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
