export type ApkRelease = {
  id: string;
  versionName: string;
  versionCode: number;
  changelog: string;
  autoUpdate: boolean;
  uploadedAt: string;
  fileSize: number;
  sha256: string;
  downloadUrl: string;
  signerSha256?: string;
};

export type StoreApp = {
  appId: string;
  packageName: string;
  displayName: string;
  latestRelease: ApkRelease;
};

export type AppListResponse = {
  apps: StoreApp[];
};

export type StoreSyncPackage = {
  packageName: string;
  versionCode: number;
  versionName?: string;
};

export type StoreSyncUpdate = {
  appId: string;
  releaseId: string;
  displayName: string;
  packageName: string;
  installedVersionCode: number;
  targetVersionCode: number;
  targetVersionName: string;
  changelog: string;
  sha256: string;
  fileSize: number;
  uploadedAt: string;
  autoUpdate: boolean;
  downloadUrl: string;
  signerSha256?: string;
};

export type StoreSyncResponse = {
  deviceId: string;
  syncedAt: string;
  updates: StoreSyncUpdate[];
};

export type StoreEventInput = {
  packageName: string;
  appId?: string;
  releaseId?: string;
  targetVersionName?: string;
  targetVersionCode?: number;
  eventType:
    | "CHECK_UPDATES"
    | "DOWNLOAD_STARTED"
    | "DOWNLOAD_FINISHED"
    | "INSTALL_REQUESTED"
    | "INSTALL_SUCCESS"
    | "INSTALL_FAILED"
    | "SYNC_COMPLETED";
  status?: "INFO" | "SUCCESS" | "FAILED";
  message?: string;
  metadata?: Record<string, unknown>;
};

export type InstallClassification = "NEW_INSTALL" | "UPDATE" | "LATEST";

export type InstalledAppInfo = {
  packageName: string;
  versionCode: number;
  versionName?: string;
};

export type QueueFailurePolicy = "STOP_ON_FAILURE" | "CONTINUE_ON_FAILURE" | "RETRY_THEN_CONTINUE";

export type QueueItemStage =
  | "QUEUED"
  | "DOWNLOADING"
  | "VERIFYING"
  | "INSTALLING"
  | "PENDING_USER_ACTION"
  | "SUCCESS"
  | "FAILED";

export type QueueItem = {
  id: string;
  appId: string;
  packageName: string;
  displayName: string;
  release: ApkRelease;
  classification: InstallClassification;
  stage: QueueItemStage;
  attempts: number;
  maxRetries: number;
  failureMessage?: string;
  downloadedFileUri?: string;
  createdAt: string;
  updatedAt: string;
};

export type QueueRuntimeState = {
  policy: QueueFailurePolicy;
  maxRetries: number;
  items: QueueItem[];
  activeItemId?: string;
  updatedAt: string;
};

export type StructuredLogLevel = "INFO" | "WARN" | "ERROR";

export type StructuredLogStep =
  | "CHECK"
  | "DOWNLOAD"
  | "VERIFY"
  | "INSTALL"
  | "RESULT"
  | "RECOVERY";

export type StructuredLogRecord = {
  id: string;
  createdAt: string;
  level: StructuredLogLevel;
  step: StructuredLogStep;
  packageName: string;
  releaseId?: string;
  code: string;
  message: string;
  metadata?: Record<string, unknown>;
};

export type InstallResultCode =
  | "SUCCESS"
  | "FAILURE"
  | "PENDING_USER_ACTION"
  | "CANCELLED"
  | "UNAVAILABLE";

export type InstallResult = {
  code: InstallResultCode;
  message?: string;
  failureCode?: string;
  userActionIntentUri?: string;
};

export type DownloadIntegrity = {
  expectedSha256: string;
  expectedSize: number;
  signerSha256?: string;
};

export type DownloadRequest = {
  taskId: string;
  url: string;
  packageName: string;
  versionCode: number;
  integrity: DownloadIntegrity;
};

export type DownloadResult = {
  fileUri: string;
  size: number;
  sha256?: string;
};

export type NativeDownloadStatus = {
  taskId: string;
  status: "ENQUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED" | "CANCELLED";
  bytesDownloaded: number;
  totalBytes: number;
  outputUri?: string;
  errorMessage?: string;
};

export type NativeInstallerCapability = {
  packageInspector: boolean;
  packageInstallerSession: boolean;
  workManagerDownloader: boolean;
  canOpenUnknownSourcesSettings: boolean;
};
