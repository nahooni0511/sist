import { Pool, PoolConnection, createPool } from "mysql2/promise";
import {
  APPS_SCHEMA_STATEMENTS,
  getAppById as getAppByIdTable,
  getApps as getAppsTable,
  getLatestReleases as getLatestReleasesTable,
  saveRelease as saveReleaseTable,
  updateApp as updateAppTable
} from "./db/tables/apps.js";
import {
  AUTH_SCHEMA_STATEMENTS,
  authenticateAuthUser as authenticateAuthUserTable,
  createAuthUser as createAuthUserTable,
  createAuthUserBySource,
  getAuthUserById as getAuthUserByIdTable,
  markAuthUserLoggedIn as markAuthUserLoggedInTable,
  updateAuthUserPassword as updateAuthUserPasswordTable
} from "./db/tables/auth.js";
import {
  COMMANDS_SCHEMA_STATEMENTS,
  createCommand as createCommandTable,
  listCommands as listCommandsTable,
  pullPendingCommands as pullPendingCommandsTable,
  updateCommandResult as updateCommandResultTable
} from "./db/tables/commands.js";
import {
  DEVICES_SCHEMA_STATEMENTS,
  createDevice as createDeviceTable,
  getDeviceById as getDeviceByIdTable,
  getDeviceContractWindow as getDeviceContractWindowTable,
  listDevices as listDevicesTable,
  previewNextDevice as previewNextDeviceTable,
  saveDeviceState as saveDeviceStateTable
} from "./db/tables/devices.js";
import {
  INSTITUTIONS_SCHEMA_STATEMENTS,
  createInstitution as createInstitutionTable,
  createInstitutionActionLog as createInstitutionActionLogTable,
  createInstitutionDelivery as createInstitutionDeliveryTable,
  endInstitutionDelivery as endInstitutionDeliveryTable,
  getInstitutionById as getInstitutionByIdTable,
  listGlobalInstitutionLogs as listGlobalInstitutionLogsTable,
  listInstitutionDeliveries as listInstitutionDeliveriesTable,
  listInstitutionLogs as listInstitutionLogsTable,
  listInstitutionTypeFields as listInstitutionTypeFieldsTable,
  listInstitutionTypes as listInstitutionTypesTable,
  listInstitutions as listInstitutionsTable,
  listUnassignedDevices as listUnassignedDevicesTable,
  seedInstitutionMetadata,
  updateInstitution as updateInstitutionTable
} from "./db/tables/institutions.js";
import {
  DEFAULT_SETTINGS,
  SETTINGS_SCHEMA_STATEMENTS,
  getSettings as getSettingsTable,
  replaceSettings as replaceSettingsTable,
  seedDefaultSettings
} from "./db/tables/settings.js";
import {
  STORE_SCHEMA_STATEMENTS,
  createStoreUpdateEvent as createStoreUpdateEventTable,
  getStoreDevice as getStoreDeviceTable,
  listStoreDevices as listStoreDevicesTable,
  listStoreUpdateEvents as listStoreUpdateEventsTable,
  saveStoreDeviceSync as saveStoreDeviceSyncTable
} from "./db/tables/store.js";
import {
  AppEntry,
  AppRelease,
  AuthUserRecord,
  CommandRecord,
  CommandStatus,
  CreateAuthUserInput,
  CreateDeviceInput,
  CreateInstitutionDeliveryInput,
  CreateInstitutionInput,
  DeviceCreatePreview,
  DeviceInstitutionContractWindow,
  DeviceRecord,
  EndInstitutionDeliveryInput,
  InstitutionActionLogRecord,
  InstitutionDetail,
  InstitutionDeliveryRecord,
  InstitutionListFilters,
  InstitutionLogFilters,
  InstitutionSummary,
  InstitutionTypeCode,
  InstitutionTypeFieldRecord,
  InstitutionTypeRecord,
  MySqlConfig,
  StoreDeviceDetail,
  StoreDeviceSummary,
  StoreDeviceSyncInput,
  StoreUpdateEventRecord,
  UnassignedDeviceRecord,
  UserRole,
  UpdateInstitutionInput
} from "./db/types.js";

export * from "./db/types.js";
export { DEFAULT_SETTINGS };

const SCHEMA_STATEMENTS = [
  ...APPS_SCHEMA_STATEMENTS,
  ...SETTINGS_SCHEMA_STATEMENTS,
  ...DEVICES_SCHEMA_STATEMENTS,
  ...COMMANDS_SCHEMA_STATEMENTS,
  ...INSTITUTIONS_SCHEMA_STATEMENTS,
  ...AUTH_SCHEMA_STATEMENTS,
  ...STORE_SCHEMA_STATEMENTS
];

export class MySqlDb {
  private readonly config: MySqlConfig;
  private readonly pool: Pool;

  constructor(config: MySqlConfig) {
    this.config = config;
    this.pool = createPool({
      host: config.host,
      port: config.port,
      user: config.username,
      password: config.password,
      database: config.database,
      charset: "utf8mb4",
      waitForConnections: true,
      connectionLimit: config.connectionLimit ?? 10,
      queueLimit: 0
    });
  }

  async init(): Promise<void> {
    await this.ensureDatabaseExists();
    for (const statement of SCHEMA_STATEMENTS) {
      await this.pool.query(statement);
    }
    await seedDefaultSettings(this.pool);
    await seedInstitutionMetadata(this.pool);
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  async getApps(): Promise<AppEntry[]> {
    return getAppsTable(this.pool);
  }

  async getAppById(appId: string): Promise<AppEntry | null> {
    return getAppByIdTable(this.pool, appId);
  }

  async saveRelease(release: AppRelease, appUpdatedAt: string): Promise<void> {
    return saveReleaseTable(this.withTransaction.bind(this), release, appUpdatedAt);
  }

  async updateApp(appId: string, payload: { displayName?: string; packageName?: string }): Promise<boolean> {
    return updateAppTable(this.pool, appId, payload);
  }

  async getSettings(): Promise<Record<string, string>> {
    return getSettingsTable(this.pool);
  }

  async replaceSettings(settings: Record<string, string>): Promise<void> {
    return replaceSettingsTable(this.withTransaction.bind(this), settings);
  }

  async previewNextDevice(deviceType: "시스트파크" | "시스트런"): Promise<DeviceCreatePreview> {
    return previewNextDeviceTable(this.pool, deviceType);
  }

  async listDevices(query?: string): Promise<DeviceRecord[]> {
    return listDevicesTable(this.pool, query);
  }

  async getDeviceById(deviceId: string): Promise<DeviceRecord | null> {
    return getDeviceByIdTable(this.pool, deviceId);
  }

  async createDevice(input: CreateDeviceInput): Promise<string> {
    return createDeviceTable(this.withTransaction.bind(this), input);
  }

  async saveDeviceState(
    deviceId: string,
    packages: Record<string, number>,
    lastSeenAt: string
  ): Promise<void> {
    return saveDeviceStateTable(this.withTransaction.bind(this), deviceId, packages, lastSeenAt);
  }

  async getLatestReleases(): Promise<AppRelease[]> {
    return getLatestReleasesTable(this.pool);
  }

  async createCommand(command: CommandRecord): Promise<void> {
    return createCommandTable(this.withTransaction.bind(this), command);
  }

  async listCommands(filters: {
    deviceId?: string;
    status?: CommandStatus;
    limit?: number;
  }): Promise<CommandRecord[]> {
    return listCommandsTable(this.pool, filters);
  }

  async pullPendingCommands(deviceId: string, max: number, startedAt: string): Promise<CommandRecord[]> {
    return pullPendingCommandsTable(this.withTransaction.bind(this), deviceId, max, startedAt);
  }

  async updateCommandResult(params: {
    deviceId: string;
    commandId: string;
    status: CommandStatus;
    resultMessage?: string;
    resultCode?: number;
    updatedAt: string;
  }): Promise<CommandRecord | null> {
    return updateCommandResultTable(this.pool, params);
  }

  async saveStoreDeviceSync(input: StoreDeviceSyncInput): Promise<void> {
    return saveStoreDeviceSyncTable(this.withTransaction.bind(this), input);
  }

  async createStoreUpdateEvent(event: StoreUpdateEventRecord): Promise<void> {
    return createStoreUpdateEventTable(this.withTransaction.bind(this), event);
  }

  async listStoreDevices(query?: string): Promise<StoreDeviceSummary[]> {
    return listStoreDevicesTable(this.pool, query);
  }

  async getStoreDevice(deviceId: string): Promise<StoreDeviceDetail | null> {
    return getStoreDeviceTable(this.pool, deviceId);
  }

  async listStoreUpdateEvents(filters: {
    deviceId?: string;
    packageName?: string;
    limit?: number;
  }): Promise<StoreUpdateEventRecord[]> {
    return listStoreUpdateEventsTable(this.pool, filters);
  }

  async listInstitutionTypes(): Promise<InstitutionTypeRecord[]> {
    return listInstitutionTypesTable(this.pool);
  }

  async listInstitutionTypeFields(typeCode?: InstitutionTypeCode): Promise<InstitutionTypeFieldRecord[]> {
    return listInstitutionTypeFieldsTable(this.pool, typeCode);
  }

  async listInstitutions(filters: InstitutionListFilters): Promise<InstitutionSummary[]> {
    return listInstitutionsTable(this.pool, filters);
  }

  async getInstitutionById(institutionId: string): Promise<InstitutionDetail | null> {
    return getInstitutionByIdTable(this.pool, institutionId);
  }

  async createInstitution(input: CreateInstitutionInput): Promise<InstitutionDetail> {
    return createInstitutionTable(this.withTransaction.bind(this), input);
  }

  async createInstitutionWithSchoolAdmin(
    input: CreateInstitutionInput,
    schoolAdmin: { loginId: string; password: string }
  ): Promise<InstitutionDetail> {
    return createInstitutionTable(this.withTransaction.bind(this), input, {
      afterCreate: async (conn, institution) => {
        await createAuthUserBySource(
          conn,
          {
            loginId: schoolAdmin.loginId,
            password: schoolAdmin.password,
            role: "SCHOOL_ADMIN",
            institutionId: institution.id,
            mustResetPassword: true,
            isActive: true
          },
          input.actedAt
        );
      }
    });
  }

  async updateInstitution(institutionId: string, input: UpdateInstitutionInput): Promise<InstitutionDetail | null> {
    return updateInstitutionTable(this.withTransaction.bind(this), institutionId, input);
  }

  async listInstitutionDeliveries(
    institutionId: string,
    status?: "ACTIVE" | "ENDED"
  ): Promise<InstitutionDeliveryRecord[]> {
    return listInstitutionDeliveriesTable(this.pool, institutionId, status);
  }

  async listUnassignedDevices(query?: string, limit = 100): Promise<UnassignedDeviceRecord[]> {
    return listUnassignedDevicesTable(this.pool, query, limit);
  }

  async createInstitutionDelivery(input: CreateInstitutionDeliveryInput): Promise<InstitutionDeliveryRecord> {
    return createInstitutionDeliveryTable(this.withTransaction.bind(this), input);
  }

  async endInstitutionDelivery(input: EndInstitutionDeliveryInput): Promise<InstitutionDeliveryRecord | null> {
    return endInstitutionDeliveryTable(this.withTransaction.bind(this), input);
  }

  async createInstitutionActionLog(input: InstitutionActionLogRecord): Promise<void> {
    return createInstitutionActionLogTable(this.pool, input);
  }

  async listInstitutionLogs(
    institutionId: string,
    filters: InstitutionLogFilters = {}
  ): Promise<InstitutionActionLogRecord[]> {
    return listInstitutionLogsTable(this.pool, institutionId, filters);
  }

  async listGlobalInstitutionLogs(filters: InstitutionLogFilters = {}): Promise<InstitutionActionLogRecord[]> {
    return listGlobalInstitutionLogsTable(this.pool, filters);
  }

  async getDeviceContractWindow(deviceId: string): Promise<DeviceInstitutionContractWindow | null> {
    return getDeviceContractWindowTable(this.pool, deviceId);
  }

  async createAuthUser(input: CreateAuthUserInput, now: string): Promise<AuthUserRecord> {
    return createAuthUserTable(this.withTransaction.bind(this), input, now);
  }

  async authenticateAuthUser(loginId: string, password: string): Promise<AuthUserRecord | null> {
    return authenticateAuthUserTable(this.pool, loginId, password);
  }

  async getAuthUserById(userId: string): Promise<AuthUserRecord | null> {
    return getAuthUserByIdTable(this.pool, userId);
  }

  async markAuthUserLoggedIn(userId: string, loggedInAt: string): Promise<void> {
    await markAuthUserLoggedInTable(this.pool, userId, loggedInAt);
  }

  async updateAuthUserPassword(input: {
    userId: string;
    newPassword: string;
    mustResetPassword: boolean;
    updatedAt: string;
  }): Promise<void> {
    await updateAuthUserPasswordTable(this.withTransaction.bind(this), input);
  }

  private async ensureDatabaseExists(): Promise<void> {
    if (!/^[A-Za-z0-9_]+$/.test(this.config.database)) {
      throw new Error("MYSQL_DATABASE는 영문/숫자/언더스코어만 사용할 수 있습니다.");
    }

    const bootstrapPool = createPool({
      host: this.config.host,
      port: this.config.port,
      user: this.config.username,
      password: this.config.password,
      charset: "utf8mb4",
      waitForConnections: true,
      connectionLimit: 1,
      queueLimit: 0
    });

    try {
      await bootstrapPool.query(
        `CREATE DATABASE IF NOT EXISTS \`${this.config.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
      );
    } finally {
      await bootstrapPool.end();
    }
  }

  private async withTransaction<T>(callback: (conn: PoolConnection) => Promise<T>): Promise<T> {
    const conn = await this.pool.getConnection();
    try {
      await conn.beginTransaction();
      const result = await callback(conn);
      await conn.commit();
      return result;
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }
  }
}
