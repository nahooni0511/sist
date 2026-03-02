import { downloadApkWithIntegrity } from "./downloadManager";
import { installWithSessionNative, openPendingUserActionNative } from "./nativeBridge";
import { appendStructuredLog, loadQueueRuntimeState, saveQueueRuntimeState } from "./runtimeStore";
import {
  ApkRelease,
  InstallClassification,
  InstallResult,
  QueueFailurePolicy,
  QueueItem,
  QueueRuntimeState,
  StructuredLogRecord,
  StoreApp
} from "./types";

type QueueCallbacks = {
  onState: (state: QueueRuntimeState) => void;
  onBanner?: (message: string) => void;
  onProgress?: (packageName: string, progress: number) => void;
  onInstallSuccess?: (packageName: string, versionCode: number) => Promise<void> | void;
  onStoreEvent?: (params: {
    packageName: string;
    appId: string;
    release: ApkRelease;
    eventType:
      | "DOWNLOAD_STARTED"
      | "DOWNLOAD_FINISHED"
      | "INSTALL_REQUESTED"
      | "INSTALL_SUCCESS"
      | "INSTALL_FAILED";
    status: "INFO" | "SUCCESS" | "FAILED";
    message?: string;
    metadata?: Record<string, unknown>;
  }) => Promise<void> | void;
};

type EnqueueInput = {
  app: StoreApp;
  classification: InstallClassification;
};

function nowIso(): string {
  return new Date().toISOString();
}

function randomId(prefix: string): string {
  const ts = Date.now().toString(36);
  const rnd = Math.random().toString(36).slice(2, 10);
  return `${prefix}-${ts}-${rnd}`;
}

function toFailureMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error || "알 수 없는 오류");
}

async function fallbackInstallWithIntent(_fileUri: string): Promise<InstallResult> {
  return {
    code: "UNAVAILABLE",
    message: "PackageInstaller Session 네이티브 모듈이 필요합니다.",
    failureCode: "NATIVE_INSTALLER_UNAVAILABLE"
  };
}

export class InstallQueueController {
  private callbacks: QueueCallbacks;
  private state: QueueRuntimeState = {
    policy: "RETRY_THEN_CONTINUE",
    maxRetries: 2,
    items: [],
    updatedAt: nowIso()
  };
  private running = false;

  constructor(callbacks: QueueCallbacks) {
    this.callbacks = callbacks;
  }

  getState(): QueueRuntimeState {
    return this.state;
  }

  async initialize(): Promise<void> {
    this.state = await loadQueueRuntimeState();
    this.emitState();
    void this.run();
  }

  async setPolicy(policy: QueueFailurePolicy, maxRetries: number): Promise<void> {
    this.state = {
      ...this.state,
      policy,
      maxRetries: Math.max(0, Math.floor(maxRetries)),
      updatedAt: nowIso(),
      items: this.state.items.map((item) => ({
        ...item,
        maxRetries: Math.max(0, Math.floor(maxRetries))
      }))
    };
    await this.persistAndEmit();
  }

  async enqueue(inputs: EnqueueInput[]): Promise<void> {
    const now = nowIso();
    const existingKeys = new Set(
      this.state.items
        .filter((item) => item.stage !== "SUCCESS")
        .map((item) => `${item.packageName}:${item.release.versionCode}`)
    );

    const toAppend = inputs
      .filter((input) => input.classification !== "LATEST")
      .filter((input) => !existingKeys.has(`${input.app.packageName}:${input.app.latestRelease.versionCode}`))
      .map(
        (input): QueueItem => ({
          id: randomId("queue"),
          appId: input.app.appId,
          packageName: input.app.packageName,
          displayName: input.app.displayName,
          release: input.app.latestRelease,
          classification: input.classification,
          stage: "QUEUED",
          attempts: 0,
          maxRetries: this.state.maxRetries,
          createdAt: now,
          updatedAt: now
        })
      );

    if (toAppend.length === 0) {
      return;
    }

    this.state = {
      ...this.state,
      items: [...this.state.items, ...toAppend],
      updatedAt: nowIso()
    };
    await this.persistAndEmit();
    void this.run();
  }

  async clearFinished(): Promise<void> {
    this.state = {
      ...this.state,
      items: this.state.items.filter((item) => item.stage !== "SUCCESS" && item.stage !== "FAILED"),
      updatedAt: nowIso()
    };
    await this.persistAndEmit();
  }

  private emitState(): void {
    this.callbacks.onState(this.state);
  }

  private async persistAndEmit(): Promise<void> {
    await saveQueueRuntimeState(this.state);
    this.emitState();
  }

  private async appendLog(log: Omit<StructuredLogRecord, "id" | "createdAt">): Promise<void> {
    await appendStructuredLog({
      ...log,
      id: randomId("log"),
      createdAt: nowIso()
    });
  }

  private updateItem(itemId: string, patch: Partial<QueueItem>): void {
    this.state = {
      ...this.state,
      items: this.state.items.map((item) =>
        item.id === itemId
          ? {
              ...item,
              ...patch,
              updatedAt: nowIso()
            }
          : item
      ),
      updatedAt: nowIso()
    };
  }

  private async run(): Promise<void> {
    if (this.running) {
      return;
    }
    this.running = true;

    try {
      while (true) {
        const next = this.state.items.find((item) => item.stage === "QUEUED");
        if (!next) {
          this.state = {
            ...this.state,
            activeItemId: undefined,
            updatedAt: nowIso()
          };
          await this.persistAndEmit();
          break;
        }

        this.state = {
          ...this.state,
          activeItemId: next.id,
          updatedAt: nowIso()
        };
        await this.persistAndEmit();

        const shouldContinue = await this.processOne(next.id);
        if (!shouldContinue) {
          break;
        }
      }
    } finally {
      this.running = false;
    }
  }

  private async processOne(itemId: string): Promise<boolean> {
    const item = this.state.items.find((v) => v.id === itemId);
    if (!item) {
      return true;
    }

    try {
      this.updateItem(item.id, { stage: "DOWNLOADING", attempts: item.attempts + 1, failureMessage: undefined });
      await this.persistAndEmit();
      await this.appendLog({
        level: "INFO",
        step: "DOWNLOAD",
        packageName: item.packageName,
        releaseId: item.release.id,
        code: "DOWNLOAD_STARTED",
        message: `${item.displayName} 다운로드 시작`,
        metadata: {
          attempt: item.attempts + 1
        }
      });

      await this.callbacks.onStoreEvent?.({
        packageName: item.packageName,
        appId: item.appId,
        release: item.release,
        eventType: "DOWNLOAD_STARTED",
        status: "INFO",
        message: "큐 다운로드 시작"
      });

      const downloaded = await downloadApkWithIntegrity(
        {
          taskId: item.id,
          url: item.release.downloadUrl,
          packageName: item.packageName,
          versionCode: item.release.versionCode,
          integrity: {
            expectedSha256: item.release.sha256,
            expectedSize: item.release.fileSize,
            signerSha256: item.release.signerSha256
          }
        },
        (progress) => this.callbacks.onProgress?.(item.packageName, progress)
      );

      this.updateItem(item.id, {
        stage: "VERIFYING",
        downloadedFileUri: downloaded.fileUri
      });
      await this.persistAndEmit();
      await this.appendLog({
        level: "INFO",
        step: "VERIFY",
        packageName: item.packageName,
        releaseId: item.release.id,
        code: "VERIFY_OK",
        message: `${item.displayName} 파일 무결성 검증 성공`,
        metadata: {
          size: downloaded.size,
          sha256: downloaded.sha256
        }
      });

      await this.callbacks.onStoreEvent?.({
        packageName: item.packageName,
        appId: item.appId,
        release: item.release,
        eventType: "DOWNLOAD_FINISHED",
        status: "SUCCESS"
      });

      this.updateItem(item.id, { stage: "INSTALLING" });
      await this.persistAndEmit();
      await this.callbacks.onStoreEvent?.({
        packageName: item.packageName,
        appId: item.appId,
        release: item.release,
        eventType: "INSTALL_REQUESTED",
        status: "INFO"
      });

      const installResult =
        (await installWithSessionNative({
          packageName: item.packageName,
          fileUri: downloaded.fileUri,
          isUpdate: item.classification === "UPDATE"
        })) ?? (await fallbackInstallWithIntent(downloaded.fileUri));

      if (installResult.code === "SUCCESS") {
        this.updateItem(item.id, { stage: "SUCCESS" });
        await this.callbacks.onInstallSuccess?.(item.packageName, item.release.versionCode);
        await this.callbacks.onStoreEvent?.({
          packageName: item.packageName,
          appId: item.appId,
          release: item.release,
          eventType: "INSTALL_SUCCESS",
          status: "SUCCESS"
        });
        await this.appendLog({
          level: "INFO",
          step: "RESULT",
          packageName: item.packageName,
          releaseId: item.release.id,
          code: "INSTALL_SUCCESS",
          message: `${item.displayName} 설치 성공`
        });
        await this.persistAndEmit();
        this.callbacks.onBanner?.(`${item.displayName} 설치 완료`);
        return true;
      }

      if (installResult.code === "PENDING_USER_ACTION") {
        this.updateItem(item.id, { stage: "PENDING_USER_ACTION" });
        await this.persistAndEmit();
        await this.appendLog({
          level: "WARN",
          step: "INSTALL",
          packageName: item.packageName,
          releaseId: item.release.id,
          code: "PENDING_USER_ACTION",
          message: "시스템 설치 UI가 필요합니다."
        });

        if (installResult.userActionIntentUri) {
          await openPendingUserActionNative(installResult.userActionIntentUri);
        }

        this.callbacks.onBanner?.(`${item.displayName} 설치를 위해 시스템 화면으로 이동합니다.`);
        await this.callbacks.onStoreEvent?.({
          packageName: item.packageName,
          appId: item.appId,
          release: item.release,
          eventType: "INSTALL_REQUESTED",
          status: "INFO",
          message: "USER_ACTION_REQUIRED"
        });
        return true;
      }

      throw new Error(
        installResult.message || installResult.failureCode || "설치 실패"
      );
    } catch (error) {
      const message = toFailureMessage(error);
      const current = this.state.items.find((v) => v.id === item.id);
      const attempts = current?.attempts ?? item.attempts + 1;
      const canRetry = attempts <= (current?.maxRetries ?? item.maxRetries);

      if (canRetry) {
        this.updateItem(item.id, {
          stage: "QUEUED",
          failureMessage: message
        });
        await this.persistAndEmit();
        await this.appendLog({
          level: "WARN",
          step: "RESULT",
          packageName: item.packageName,
          releaseId: item.release.id,
          code: "RETRY_SCHEDULED",
          message,
          metadata: {
            attempts,
            maxRetries: current?.maxRetries ?? item.maxRetries
          }
        });
        return true;
      }

      this.updateItem(item.id, {
        stage: "FAILED",
        failureMessage: message
      });
      await this.persistAndEmit();
      await this.callbacks.onStoreEvent?.({
        packageName: item.packageName,
        appId: item.appId,
        release: item.release,
        eventType: "INSTALL_FAILED",
        status: "FAILED",
        message
      });
      await this.appendLog({
        level: "ERROR",
        step: "RESULT",
        packageName: item.packageName,
        releaseId: item.release.id,
        code: "FAILED",
        message
      });

      if (this.state.policy === "STOP_ON_FAILURE") {
        this.callbacks.onBanner?.(`${item.displayName} 실패로 전체 업데이트를 중단했습니다.`);
        return false;
      }

      return true;
    }
  }
}
