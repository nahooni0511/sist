import * as FileSystem from "expo-file-system/legacy";
import {
  enqueueDownloadNative,
  getDownloadStatusNative,
  hasNativeDownloadManager,
  verifyFileIntegrityNative
} from "./nativeBridge";
import { DownloadRequest, DownloadResult } from "./types";

const POLL_INTERVAL_MS = 1200;

function sanitizeToken(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_");
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildPaths(request: DownloadRequest): { tempUri: string; finalUri: string } {
  if (FileSystem.documentDirectory == null) {
    throw new Error("앱 내부 저장소를 사용할 수 없습니다.");
  }

  const baseDir = `${FileSystem.documentDirectory}downloads/`;
  const fileToken = `${sanitizeToken(request.packageName)}-${request.versionCode}`;
  return {
    tempUri: `${baseDir}${fileToken}.apk.part`,
    finalUri: `${baseDir}${fileToken}.apk`
  };
}

async function ensureBaseDirectory(uri: string): Promise<void> {
  const separator = uri.lastIndexOf("/");
  if (separator < 0) {
    return;
  }
  const dir = uri.slice(0, separator + 1);
  await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
}

async function downloadWithExpo(
  request: DownloadRequest,
  onProgress?: (progress: number) => void
): Promise<DownloadResult> {
  const { tempUri, finalUri } = buildPaths(request);
  await ensureBaseDirectory(tempUri);

  const resumable = FileSystem.createDownloadResumable(
    request.url,
    tempUri,
    {},
    (progress) => {
      if (!onProgress || progress.totalBytesExpectedToWrite <= 0) {
        return;
      }
      onProgress(Math.round((progress.totalBytesWritten / progress.totalBytesExpectedToWrite) * 100));
    }
  );

  const downloaded = await resumable.downloadAsync();
  if (!downloaded?.uri) {
    throw new Error("APK 다운로드 실패");
  }

  const info = await FileSystem.getInfoAsync(downloaded.uri);
  if (!info.exists || typeof info.size !== "number") {
    throw new Error("다운로드 파일 정보를 읽을 수 없습니다.");
  }

  if (request.integrity.expectedSize > 0 && info.size !== request.integrity.expectedSize) {
    throw new Error(
      `파일 크기 검증 실패: expected=${request.integrity.expectedSize}, actual=${info.size}`
    );
  }

  const nativeVerified = await verifyFileIntegrityNative(downloaded.uri, request.integrity);
  if (nativeVerified && nativeVerified.fileUri) {
    if (await FileSystem.getInfoAsync(finalUri).then((v) => v.exists).catch(() => false)) {
      await FileSystem.deleteAsync(finalUri, { idempotent: true });
    }
    await FileSystem.moveAsync({
      from: downloaded.uri,
      to: finalUri
    });
    return {
      fileUri: finalUri,
      size: nativeVerified.size,
      sha256: nativeVerified.sha256
    };
  }

  const allowInsecure = process.env.EXPO_PUBLIC_ALLOW_INSECURE_VERIFY === "true";
  if (!allowInsecure && request.integrity.expectedSha256) {
    throw new Error("SHA256 검증을 수행할 네이티브 모듈이 없습니다.");
  }

  if (await FileSystem.getInfoAsync(finalUri).then((v) => v.exists).catch(() => false)) {
    await FileSystem.deleteAsync(finalUri, { idempotent: true });
  }
  await FileSystem.moveAsync({
    from: downloaded.uri,
    to: finalUri
  });

  return {
    fileUri: finalUri,
    size: info.size
  };
}

async function downloadWithNative(
  request: DownloadRequest,
  onProgress?: (progress: number) => void
): Promise<DownloadResult | null> {
  const enqueued = await enqueueDownloadNative(request);
  if (!enqueued) {
    return null;
  }

  while (true) {
    const status = await getDownloadStatusNative(enqueued.taskId);
    if (!status) {
      return null;
    }

    if (status.totalBytes > 0 && onProgress) {
      onProgress(Math.round((status.bytesDownloaded / status.totalBytes) * 100));
    }

    if (status.status === "SUCCEEDED" && status.outputUri) {
      const verified = await verifyFileIntegrityNative(status.outputUri, request.integrity);
      if (!verified) {
        throw new Error("다운로드 검증 실패");
      }
      return verified;
    }

    if (status.status === "FAILED" || status.status === "CANCELLED") {
      throw new Error(status.errorMessage || "네이티브 다운로드 실패");
    }

    await sleep(POLL_INTERVAL_MS);
  }
}

export async function downloadApkWithIntegrity(
  request: DownloadRequest,
  onProgress?: (progress: number) => void
): Promise<DownloadResult> {
  if (hasNativeDownloadManager()) {
    const nativeResult = await downloadWithNative(request, onProgress);
    if (nativeResult) {
      return nativeResult;
    }
  }

  return downloadWithExpo(request, onProgress);
}
