export type CommandExecutionStatus = "PENDING" | "RUNNING" | "SUCCESS" | "FAILED" | "UNKNOWN";

export interface ApkItem {
  id: string;
  appId?: string;
  packageName: string;
  versionName: string;
  versionCode: number;
  releaseNote: string;
  sha256: string;
  fileSize: number;
  uploadedAt: string;
  downloadUrl?: string;
}

export interface ApkDetail {
  apk: ApkItem | null;
  versions: ApkItem[];
}

export interface DeviceAppVersion {
  packageName: string;
  versionName?: string;
  versionCode?: number;
}

export interface DeviceItem {
  deviceId: string;
  deviceKey?: string;
  deviceName?: string;
  model?: string;
  osVersion?: string;
  status: "online" | "offline" | "unknown";
  lastSeen?: string;
  locationName?: string;
  lat?: number;
  lng?: number;
  groupName?: string;
  installedApps?: DeviceAppVersion[];
}

export type DeviceCommandType =
  | "RESTART_APP"
  | "RESTART_SERVICE"
  | "RUN_HEALTHCHECK"
  | "DIAG_NETWORK"
  | "SYNC_TIME"
  | "COLLECT_LOGS"
  | "CAPTURE_SCREENSHOT"
  | "CLEAR_CACHE"
  | "PREFETCH_CONTENT"
  | "APPLY_PROFILE"
  | "REBOOT"
  | "INSTALL_APP"
  | "UPDATE_APP"
  | "APPLY_POLICY";

export interface DeviceCommandRecord {
  id: string;
  deviceId: string;
  type: DeviceCommandType | string;
  status: CommandExecutionStatus;
  payload?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  resultMessage?: string;
  resultCode?: number;
}

export interface CreateCommandInput {
  type: DeviceCommandType;
  payload?: Record<string, unknown>;
  requestedBy?: string;
}

export interface ApkListFilters {
  query?: string;
  packageName?: string;
  latestOnly?: boolean;
}

export interface DeviceListFilters {
  query?: string;
  status?: "online" | "offline" | "unknown" | "all";
  hasLocation?: boolean;
}

export interface AdminApiConfig {
  baseUrl: string;
  adminToken: string;
}
