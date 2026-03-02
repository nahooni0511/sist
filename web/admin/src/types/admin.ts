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

export type DeviceType = "시스트파크" | "시스트런";
export type InstitutionTypeCode = "SCHOOL" | "PARK";
export type InstitutionStatus = "ACTIVE" | "INACTIVE" | "PENDING";
export type InstitutionFieldDataType = "TEXT" | "NUMBER" | "BOOLEAN" | "DATE" | "SELECT";
export type InstitutionFieldValue = string | number | boolean | null;
export type InstitutionFieldValues = Record<string, InstitutionFieldValue>;

export interface DeviceModuleItem {
  name: string;
  portNumber: number;
}

export interface DeviceItem {
  deviceId: string;
  deviceType?: DeviceType;
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
  modules?: DeviceModuleItem[];
  activeInstitution?: {
    institutionId: string;
    name: string;
    typeCode: InstitutionTypeCode;
    contractStartDate?: string;
    contractEndDate?: string;
  };
  activeDelivery?: {
    deliveryId: string;
    deliveredAt: string;
    installLocation?: string;
    memo?: string;
  };
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
}

export interface CreateDeviceInput {
  deviceType: DeviceType;
  modelName: string;
  locationName: string;
  lat: number;
  lng: number;
  institutionId?: string;
  deliveredAt?: string;
  installLocation?: string;
  deliveryMemo?: string;
}

export interface InstitutionTypeItem {
  code: InstitutionTypeCode;
  name: string;
  isActive: boolean;
}

export interface InstitutionTypeField {
  id: string;
  institutionTypeCode: InstitutionTypeCode;
  fieldKey: string;
  label: string;
  dataType: InstitutionFieldDataType;
  isRequired: boolean;
  options: string[];
  sortOrder: number;
}

export interface InstitutionSummary {
  id: string;
  name: string;
  institutionTypeCode: InstitutionTypeCode;
  institutionTypeName: string;
  status: InstitutionStatus;
  contactName?: string;
  contactPhone?: string;
  addressRoad?: string;
  addressDetail?: string;
  lat?: number;
  lng?: number;
  memo?: string;
  contractStartDate?: string;
  contractEndDate?: string;
  activeDeviceCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface InstitutionDetail extends InstitutionSummary {
  fields: InstitutionFieldValues;
}

export interface InstitutionListFilters {
  query?: string;
  typeCode?: InstitutionTypeCode;
  status?: InstitutionStatus;
  hasActiveDevices?: boolean;
  page?: number;
  size?: number;
}

export interface UpsertInstitutionInput {
  name: string;
  typeCode: InstitutionTypeCode;
  status: InstitutionStatus;
  contactName?: string;
  contactPhone?: string;
  addressRoad?: string;
  addressDetail?: string;
  lat?: number;
  lng?: number;
  memo?: string;
  contractStartDate?: string;
  contractEndDate?: string;
  fields: InstitutionFieldValues;
  schoolAdmin?: {
    loginId: string;
    password: string;
  };
}

export interface InstitutionDelivery {
  id: string;
  institutionId: string;
  deviceId: string;
  deviceTypeSnapshot?: DeviceType;
  deliveredAt: string;
  retrievedAt?: string;
  installLocation?: string;
  memo?: string;
  createdAt: string;
  updatedAt: string;
  status: "ACTIVE" | "ENDED";
}

export interface InstitutionActionLog {
  id: string;
  institutionId: string;
  deviceId?: string;
  actionType: string;
  actionPayload?: Record<string, unknown>;
  actedBy: string;
  actedAt: string;
}

export interface InstitutionLogFilters {
  institutionId?: string;
  actionType?: string;
  deviceId?: string;
  limit?: number;
  from?: string;
  to?: string;
}

export interface UnassignedDeviceItem {
  deviceId: string;
  deviceType?: DeviceType;
  modelName?: string;
  locationName?: string;
}

export interface NextDevicePreview {
  deviceId: string;
  modules: DeviceModuleItem[];
}

export interface AdminAuthSession {
  accessToken: string;
  accessTokenExpiresAt: string;
  refreshToken: string;
  refreshTokenExpiresAt: string;
}

export interface AdminApiConfig {
  baseUrl: string;
  accessToken?: string;
  refreshToken?: string;
  onAuthSession?: (session: AdminAuthSession | null) => void;
  onUnauthorized?: () => void;
}

export interface StoreDeviceSummary {
  deviceId: string;
  deviceName?: string;
  modelName?: string;
  platform?: string;
  osVersion?: string;
  appStoreVersion?: string;
  ipAddress?: string;
  lastSyncedAt?: string;
  installedPackageCount: number;
  availableUpdateCount: number;
  latestEventAt?: string;
  latestEventType?: string;
  latestEventStatus?: string;
}

export interface StoreDevicePackage {
  packageName: string;
  versionCode: number;
  versionName?: string;
  syncedAt?: string;
}

export interface StoreSyncLog {
  id: string;
  deviceId: string;
  syncedAt: string;
  packageCount: number;
  updateCount: number;
  appStoreVersion?: string;
  ipAddress?: string;
}

export interface StoreUpdateEvent {
  id: string;
  deviceId: string;
  packageName: string;
  appId?: string;
  releaseId?: string;
  targetVersionName?: string;
  targetVersionCode?: number;
  eventType: string;
  status: "INFO" | "SUCCESS" | "FAILED";
  message?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface StoreDeviceDetail extends StoreDeviceSummary {
  packages: StoreDevicePackage[];
  recentSyncs: StoreSyncLog[];
  recentEvents: StoreUpdateEvent[];
}
