export type AppRelease = {
  id: string;
  appId: string;
  packageName: string;
  displayName: string;
  versionName: string;
  versionCode: number;
  fileName: string;
  sha256: string;
  fileSize: number;
  autoUpdate: boolean;
  changelog: string;
  uploadedAt: string;
};

export type AppEntry = {
  appId: string;
  packageName: string;
  displayName: string;
  createdAt: string;
  updatedAt: string;
  releases: AppRelease[];
};

export type CommandType =
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

export type CommandStatus = "PENDING" | "RUNNING" | "SUCCESS" | "FAILED";
export type DeviceType = "시스트파크" | "시스트런";
export type InstitutionTypeCode = "SCHOOL" | "PARK";
export type InstitutionStatus = "ACTIVE" | "INACTIVE" | "PENDING";
export type InstitutionFieldDataType = "TEXT" | "NUMBER" | "BOOLEAN" | "DATE" | "SELECT";
export type UserRole = "SUPER_ADMIN" | "SCHOOL_ADMIN" | "PARK_ADMIN";

export type InstitutionFieldValue = string | number | boolean | null;
export type InstitutionFieldValues = Record<string, InstitutionFieldValue>;

export type InstitutionTypeRecord = {
  code: InstitutionTypeCode;
  name: string;
  isActive: boolean;
};

export type InstitutionTypeFieldRecord = {
  id: string;
  institutionTypeCode: InstitutionTypeCode;
  fieldKey: string;
  label: string;
  dataType: InstitutionFieldDataType;
  isRequired: boolean;
  options: string[];
  sortOrder: number;
};

export type InstitutionRef = {
  institutionId: string;
  name: string;
  institutionTypeCode: InstitutionTypeCode;
  contractStartDate?: string;
  contractEndDate?: string;
};

export type ActiveDeliveryRef = {
  deliveryId: string;
  deliveredAt: string;
  installLocation?: string;
  memo?: string;
};

export type InstitutionSummary = {
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
};

export type InstitutionDetail = InstitutionSummary & {
  fields: InstitutionFieldValues;
};

export type InstitutionListFilters = {
  query?: string;
  typeCode?: InstitutionTypeCode;
  status?: InstitutionStatus;
  hasActiveDevices?: boolean;
  page?: number;
  size?: number;
};

export type InstitutionLogFilters = {
  institutionId?: string;
  actionType?: string;
  deviceId?: string;
  limit?: number;
  from?: string;
  to?: string;
};

export type CreateInstitutionInput = {
  name: string;
  institutionTypeCode: InstitutionTypeCode;
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
  actedBy: string;
  actedAt: string;
};

export type UpdateInstitutionInput = {
  name: string;
  institutionTypeCode: InstitutionTypeCode;
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
  actedBy: string;
  actedAt: string;
};

export type InstitutionDeliveryRecord = {
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
};

export type CreateInstitutionDeliveryInput = {
  institutionId: string;
  deviceId: string;
  deliveredAt: string;
  installLocation?: string;
  memo?: string;
  actedBy: string;
  actedAt: string;
};

export type EndInstitutionDeliveryInput = {
  institutionId: string;
  deliveryId: string;
  retrievedAt: string;
  memo?: string;
  actedBy: string;
  actedAt: string;
};

export type InstitutionActionLogRecord = {
  id: string;
  institutionId: string;
  deviceId?: string;
  actionType: string;
  actionPayload?: Record<string, unknown>;
  actedBy: string;
  actedAt: string;
};

export type UnassignedDeviceRecord = {
  deviceId: string;
  deviceType?: DeviceType;
  modelName?: string;
  locationName?: string;
};

export type DeviceInstitutionContractWindow = {
  institutionId: string;
  institutionName: string;
  contractStartDate?: string;
  contractEndDate?: string;
};

export type DevicePackageVersion = {
  packageName: string;
  versionCode: number;
};

export type DeviceModuleRecord = {
  name: string;
  portNumber: number;
};

export type StoreDevicePackageVersion = {
  packageName: string;
  versionCode: number;
  versionName?: string;
  syncedAt?: string;
};

export type StoreDeviceSyncInput = {
  deviceId: string;
  deviceName?: string;
  modelName?: string;
  platform?: string;
  osVersion?: string;
  appStoreVersion?: string;
  ipAddress?: string;
  syncedAt: string;
  availableUpdateCount: number;
  packages: StoreDevicePackageVersion[];
};

export type StoreSyncLogRecord = {
  id: string;
  deviceId: string;
  syncedAt: string;
  packageCount: number;
  updateCount: number;
  appStoreVersion?: string;
  ipAddress?: string;
};

export type StoreUpdateEventStatus = "INFO" | "SUCCESS" | "FAILED";

export type StoreUpdateEventRecord = {
  id: string;
  deviceId: string;
  packageName: string;
  eventType: string;
  status: StoreUpdateEventStatus;
  message?: string;
  appId?: string;
  releaseId?: string;
  targetVersionName?: string;
  targetVersionCode?: number;
  metadata?: Record<string, unknown>;
  createdAt: string;
};

export type StoreDeviceSummary = {
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
};

export type StoreDeviceDetail = StoreDeviceSummary & {
  packages: StoreDevicePackageVersion[];
  recentSyncs: StoreSyncLogRecord[];
  recentEvents: StoreUpdateEventRecord[];
};

export type DeviceCreatePreview = {
  deviceId: string;
  modules: DeviceModuleRecord[];
};

export type DeviceRecord = {
  deviceId: string;
  deviceType?: DeviceType;
  modelName?: string;
  locationName?: string;
  lat?: number;
  lng?: number;
  lastSeenAt?: string;
  installedApps: DevicePackageVersion[];
  modules: DeviceModuleRecord[];
  activeInstitution?: InstitutionRef;
  activeDelivery?: ActiveDeliveryRef;
};

export type CreateDeviceInput = {
  deviceType: DeviceType;
  modelName: string;
  locationName: string;
  lat: number;
  lng: number;
  institutionId?: string;
  deliveredAt?: string;
  installLocation?: string;
  deliveryMemo?: string;
  actedBy?: string;
  actedAt?: string;
};

export type CommandRecord = {
  id: string;
  deviceId: string;
  type: CommandType;
  payload: Record<string, unknown>;
  status: CommandStatus;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  finishedAt?: string;
  resultMessage?: string;
  resultCode?: number;
};

export type AuthUserRecord = {
  id: string;
  loginId: string;
  role: UserRole;
  institutionId?: string;
  mustResetPassword: boolean;
  isActive: boolean;
  lastLoginAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type AuthSessionRecord = {
  id: string;
  userId: string;
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: string;
  refreshTokenExpiresAt: string;
  revokedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type AuthSessionWithUser = {
  session: AuthSessionRecord;
  user: AuthUserRecord;
};

export type CreateAuthUserInput = {
  loginId: string;
  password: string;
  role: UserRole;
  institutionId?: string;
  mustResetPassword?: boolean;
  isActive?: boolean;
};

export type MySqlConfig = {
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
  connectionLimit?: number;
};
