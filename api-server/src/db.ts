import {
  Pool,
  PoolConnection,
  ResultSetHeader,
  RowDataPacket,
  createPool
} from "mysql2/promise";

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

export type CommandType = "INSTALL_APP" | "UPDATE_APP" | "REBOOT" | "APPLY_POLICY";
export type CommandStatus = "PENDING" | "RUNNING" | "SUCCESS" | "FAILED";
export type DeviceType = "시스트파크" | "시스트런";

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
};

export type CreateDeviceInput = {
  deviceType: DeviceType;
  modelName: string;
  locationName: string;
  lat: number;
  lng: number;
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

export type MySqlConfig = {
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
  connectionLimit?: number;
};

export const DEFAULT_SETTINGS: Record<string, string> = {
  API_BASE_URL: "http://10.0.2.2:4000",
  AI_BOX_IP: "192.168.0.10"
};

const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS apps (
    app_id VARCHAR(100) NOT NULL,
    package_name VARCHAR(255) NOT NULL,
    display_name VARCHAR(255) NOT NULL,
    created_at VARCHAR(30) NOT NULL,
    updated_at VARCHAR(30) NOT NULL,
    PRIMARY KEY (app_id),
    KEY idx_apps_package_name (package_name)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS app_releases (
    id CHAR(36) NOT NULL,
    app_id VARCHAR(100) NOT NULL,
    package_name VARCHAR(255) NOT NULL,
    display_name VARCHAR(255) NOT NULL,
    version_name VARCHAR(100) NOT NULL,
    version_code INT NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    sha256 CHAR(64) NOT NULL,
    file_size BIGINT NOT NULL,
    auto_update TINYINT(1) NOT NULL DEFAULT 0,
    changelog TEXT NOT NULL,
    uploaded_at VARCHAR(30) NOT NULL,
    PRIMARY KEY (id),
    KEY idx_releases_app_version (app_id, version_code),
    KEY idx_releases_package_name (package_name),
    KEY idx_releases_uploaded_at (uploaded_at),
    CONSTRAINT fk_releases_app FOREIGN KEY (app_id) REFERENCES apps(app_id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS settings (
    setting_key VARCHAR(100) NOT NULL,
    setting_value TEXT NOT NULL,
    PRIMARY KEY (setting_key)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS devices (
    device_id VARCHAR(120) NOT NULL,
    device_type VARCHAR(30) NULL,
    model_name VARCHAR(120) NULL,
    location_name VARCHAR(255) NULL,
    latitude DOUBLE NULL,
    longitude DOUBLE NULL,
    last_seen_at VARCHAR(30) NULL,
    PRIMARY KEY (device_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS device_packages (
    device_id VARCHAR(120) NOT NULL,
    package_name VARCHAR(255) NOT NULL,
    version_code INT NOT NULL,
    PRIMARY KEY (device_id, package_name),
    CONSTRAINT fk_device_packages_device FOREIGN KEY (device_id) REFERENCES devices(device_id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS device_modules (
    device_id VARCHAR(120) NOT NULL,
    module_name VARCHAR(120) NOT NULL,
    port_number INT NOT NULL,
    PRIMARY KEY (device_id, module_name),
    KEY idx_device_modules_device (device_id),
    CONSTRAINT fk_device_modules_device FOREIGN KEY (device_id) REFERENCES devices(device_id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS commands (
    id CHAR(36) NOT NULL,
    device_id VARCHAR(120) NOT NULL,
    type VARCHAR(30) NOT NULL,
    payload JSON NOT NULL,
    status VARCHAR(20) NOT NULL,
    created_at VARCHAR(30) NOT NULL,
    updated_at VARCHAR(30) NOT NULL,
    started_at VARCHAR(30) NULL,
    finished_at VARCHAR(30) NULL,
    result_message TEXT NULL,
    result_code INT NULL,
    PRIMARY KEY (id),
    KEY idx_commands_device_created (device_id, created_at),
    KEY idx_commands_status_created (status, created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS store_devices (
    device_id VARCHAR(120) NOT NULL,
    device_name VARCHAR(160) NULL,
    model_name VARCHAR(160) NULL,
    platform VARCHAR(40) NULL,
    os_version VARCHAR(60) NULL,
    app_store_version VARCHAR(60) NULL,
    ip_address VARCHAR(64) NULL,
    last_synced_at VARCHAR(30) NULL,
    created_at VARCHAR(30) NOT NULL,
    updated_at VARCHAR(30) NOT NULL,
    PRIMARY KEY (device_id),
    KEY idx_store_devices_last_synced (last_synced_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS store_device_packages (
    device_id VARCHAR(120) NOT NULL,
    package_name VARCHAR(255) NOT NULL,
    version_name VARCHAR(100) NULL,
    version_code INT NOT NULL,
    synced_at VARCHAR(30) NOT NULL,
    PRIMARY KEY (device_id, package_name),
    KEY idx_store_device_packages_package (package_name),
    CONSTRAINT fk_store_device_packages_device FOREIGN KEY (device_id) REFERENCES store_devices(device_id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS store_sync_logs (
    id CHAR(36) NOT NULL,
    device_id VARCHAR(120) NOT NULL,
    synced_at VARCHAR(30) NOT NULL,
    package_count INT NOT NULL,
    update_count INT NOT NULL DEFAULT 0,
    app_store_version VARCHAR(60) NULL,
    ip_address VARCHAR(64) NULL,
    PRIMARY KEY (id),
    KEY idx_store_sync_logs_device_synced (device_id, synced_at),
    CONSTRAINT fk_store_sync_logs_device FOREIGN KEY (device_id) REFERENCES store_devices(device_id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS store_update_events (
    id CHAR(36) NOT NULL,
    device_id VARCHAR(120) NOT NULL,
    package_name VARCHAR(255) NOT NULL,
    app_id VARCHAR(100) NULL,
    release_id CHAR(36) NULL,
    target_version_name VARCHAR(100) NULL,
    target_version_code INT NULL,
    event_type VARCHAR(40) NOT NULL,
    status VARCHAR(20) NOT NULL,
    message TEXT NULL,
    metadata JSON NULL,
    created_at VARCHAR(30) NOT NULL,
    PRIMARY KEY (id),
    KEY idx_store_update_events_device_created (device_id, created_at),
    KEY idx_store_update_events_package_created (package_name, created_at),
    CONSTRAINT fk_store_update_events_device FOREIGN KEY (device_id) REFERENCES store_devices(device_id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
];

type AppRow = RowDataPacket & {
  app_id: string;
  package_name: string;
  display_name: string;
  created_at: string;
  updated_at: string;
};

type ReleaseRow = RowDataPacket & {
  id: string;
  app_id: string;
  package_name: string;
  display_name: string;
  version_name: string;
  version_code: number;
  file_name: string;
  sha256: string;
  file_size: number;
  auto_update: number;
  changelog: string;
  uploaded_at: string;
};

type SettingRow = RowDataPacket & {
  setting_key: string;
  setting_value: string;
};

type DeviceRow = RowDataPacket & {
  device_id: string;
  device_type: string | null;
  model_name: string | null;
  location_name: string | null;
  latitude: number | null;
  longitude: number | null;
  last_seen_at: string | null;
};

type DevicePackageRow = RowDataPacket & {
  device_id: string;
  package_name: string;
  version_code: number;
};

type DeviceModuleRow = RowDataPacket & {
  device_id: string;
  module_name: string;
  port_number: number;
};

type CountRow = RowDataPacket & {
  cnt: number;
};

type CommandRow = RowDataPacket & {
  id: string;
  device_id: string;
  type: CommandType;
  payload: unknown;
  status: CommandStatus;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  finished_at: string | null;
  result_message: string | null;
  result_code: number | null;
};

type CommandIdRow = RowDataPacket & {
  id: string;
};

type StoreDeviceRow = RowDataPacket & {
  device_id: string;
  device_name: string | null;
  model_name: string | null;
  platform: string | null;
  os_version: string | null;
  app_store_version: string | null;
  ip_address: string | null;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
};

type StoreDeviceSummaryRow = StoreDeviceRow & {
  installed_package_count: number;
  available_update_count: number;
  latest_event_at: string | null;
  latest_event_type: string | null;
  latest_event_status: string | null;
};

type StoreDevicePackageRow = RowDataPacket & {
  device_id: string;
  package_name: string;
  version_name: string | null;
  version_code: number;
  synced_at: string;
};

type StoreSyncLogRow = RowDataPacket & {
  id: string;
  device_id: string;
  synced_at: string;
  package_count: number;
  update_count: number;
  app_store_version: string | null;
  ip_address: string | null;
};

type StoreUpdateEventRow = RowDataPacket & {
  id: string;
  device_id: string;
  package_name: string;
  app_id: string | null;
  release_id: string | null;
  target_version_name: string | null;
  target_version_code: number | null;
  event_type: string;
  status: string;
  message: string | null;
  metadata: unknown;
  created_at: string;
};

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
    await this.ensureDeviceSchema();
    await this.seedDefaultSettings();
  }

  async close(): Promise<void> {
    await this.pool.end();
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

  private async seedDefaultSettings(): Promise<void> {
    for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
      await this.pool.execute(
        "INSERT IGNORE INTO settings (setting_key, setting_value) VALUES (?, ?)",
        [key, value]
      );
    }
  }

  private async hasColumn(tableName: string, columnName: string): Promise<boolean> {
    const [rows] = await this.pool.execute<CountRow[]>(
      `SELECT COUNT(*) AS cnt
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
      [this.config.database, tableName, columnName]
    );
    return (rows[0]?.cnt ?? 0) > 0;
  }

  private async ensureDeviceSchema(): Promise<void> {
    const addColumnIfMissing = async (columnName: string, ddl: string) => {
      if (!(await this.hasColumn("devices", columnName))) {
        await this.pool.query(ddl);
      }
    };

    await addColumnIfMissing("device_type", "ALTER TABLE devices ADD COLUMN device_type VARCHAR(30) NULL AFTER device_id");
    await addColumnIfMissing("model_name", "ALTER TABLE devices ADD COLUMN model_name VARCHAR(120) NULL AFTER device_type");
    await addColumnIfMissing(
      "location_name",
      "ALTER TABLE devices ADD COLUMN location_name VARCHAR(255) NULL AFTER model_name"
    );
    await addColumnIfMissing("latitude", "ALTER TABLE devices ADD COLUMN latitude DOUBLE NULL AFTER location_name");
    await addColumnIfMissing("longitude", "ALTER TABLE devices ADD COLUMN longitude DOUBLE NULL AFTER latitude");
    await this.pool.query("ALTER TABLE devices MODIFY COLUMN last_seen_at VARCHAR(30) NULL");
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

  async getApps(): Promise<AppEntry[]> {
    const [appRows] = await this.pool.query<AppRow[]>(
      `SELECT app_id, package_name, display_name, created_at, updated_at
       FROM apps
       ORDER BY display_name ASC`
    );

    const [releaseRows] = await this.pool.query<ReleaseRow[]>(
      `SELECT id, app_id, package_name, display_name, version_name, version_code,
              file_name, sha256, file_size, auto_update, changelog, uploaded_at
       FROM app_releases
       ORDER BY app_id ASC, version_code DESC, uploaded_at DESC`
    );

    const releasesByAppId = new Map<string, AppRelease[]>();
    for (const row of releaseRows) {
      const current = releasesByAppId.get(row.app_id) ?? [];
      current.push(toAppRelease(row));
      releasesByAppId.set(row.app_id, current);
    }

    return appRows.map((row) => ({
      appId: row.app_id,
      packageName: row.package_name,
      displayName: row.display_name,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      releases: releasesByAppId.get(row.app_id) ?? []
    }));
  }

  async getAppById(appId: string): Promise<AppEntry | null> {
    const [appRows] = await this.pool.execute<AppRow[]>(
      `SELECT app_id, package_name, display_name, created_at, updated_at
       FROM apps
       WHERE app_id = ?
       LIMIT 1`,
      [appId]
    );

    const appRow = appRows[0];
    if (!appRow) {
      return null;
    }

    const [releaseRows] = await this.pool.execute<ReleaseRow[]>(
      `SELECT id, app_id, package_name, display_name, version_name, version_code,
              file_name, sha256, file_size, auto_update, changelog, uploaded_at
       FROM app_releases
       WHERE app_id = ?
       ORDER BY version_code DESC, uploaded_at DESC`,
      [appId]
    );

    return {
      appId: appRow.app_id,
      packageName: appRow.package_name,
      displayName: appRow.display_name,
      createdAt: appRow.created_at,
      updatedAt: appRow.updated_at,
      releases: releaseRows.map(toAppRelease)
    };
  }

  async saveRelease(release: AppRelease, appUpdatedAt: string): Promise<void> {
    await this.withTransaction(async (conn) => {
      await conn.execute(
        `INSERT INTO apps (app_id, package_name, display_name, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           package_name = VALUES(package_name),
           display_name = VALUES(display_name),
           updated_at = VALUES(updated_at)`,
        [release.appId, release.packageName, release.displayName, appUpdatedAt, appUpdatedAt]
      );

      await conn.execute(
        `INSERT INTO app_releases (
          id, app_id, package_name, display_name, version_name, version_code,
          file_name, sha256, file_size, auto_update, changelog, uploaded_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          release.id,
          release.appId,
          release.packageName,
          release.displayName,
          release.versionName,
          release.versionCode,
          release.fileName,
          release.sha256,
          release.fileSize,
          release.autoUpdate ? 1 : 0,
          release.changelog,
          release.uploadedAt
        ]
      );
    });
  }

  async updateApp(appId: string, payload: { displayName?: string; packageName?: string }): Promise<boolean> {
    const now = new Date().toISOString();
    const [result] = await this.pool.execute<ResultSetHeader>(
      `UPDATE apps
       SET display_name = COALESCE(?, display_name),
           package_name = COALESCE(?, package_name),
           updated_at = ?
       WHERE app_id = ?`,
      [payload.displayName ?? null, payload.packageName ?? null, now, appId]
    );
    return result.affectedRows > 0;
  }

  async getSettings(): Promise<Record<string, string>> {
    const [rows] = await this.pool.query<SettingRow[]>(
      `SELECT setting_key, setting_value
       FROM settings
       ORDER BY setting_key ASC`
    );

    const settings: Record<string, string> = {};
    for (const row of rows) {
      settings[row.setting_key] = row.setting_value;
    }
    return settings;
  }

  async replaceSettings(settings: Record<string, string>): Promise<void> {
    await this.withTransaction(async (conn) => {
      await conn.query("DELETE FROM settings");

      const entries = Object.entries(settings);
      if (entries.length === 0) {
        return;
      }

      const placeholders = entries.map(() => "(?, ?)").join(", ");
      const values = entries.flatMap(([key, value]) => [key, value]);
      await conn.query(`INSERT INTO settings (setting_key, setting_value) VALUES ${placeholders}`, values);
    });
  }

  private async getInstalledPackagesByDeviceIds(deviceIds: string[]): Promise<Map<string, DevicePackageVersion[]>> {
    const map = new Map<string, DevicePackageVersion[]>();
    if (deviceIds.length === 0) {
      return map;
    }

    const placeholders = deviceIds.map(() => "?").join(", ");
    const [rows] = await this.pool.query<DevicePackageRow[]>(
      `SELECT device_id, package_name, version_code
       FROM device_packages
       WHERE device_id IN (${placeholders})
       ORDER BY device_id ASC, package_name ASC`,
      deviceIds
    );

    for (const row of rows) {
      const current = map.get(row.device_id) ?? [];
      current.push({
        packageName: row.package_name,
        versionCode: row.version_code
      });
      map.set(row.device_id, current);
    }

    return map;
  }

  private async getModulesByDeviceIds(deviceIds: string[]): Promise<Map<string, DeviceModuleRecord[]>> {
    const map = new Map<string, DeviceModuleRecord[]>();
    if (deviceIds.length === 0) {
      return map;
    }

    const placeholders = deviceIds.map(() => "?").join(", ");
    const [rows] = await this.pool.query<DeviceModuleRow[]>(
      `SELECT device_id, module_name, port_number
       FROM device_modules
       WHERE device_id IN (${placeholders})
       ORDER BY device_id ASC, module_name ASC`,
      deviceIds
    );

    for (const row of rows) {
      const current = map.get(row.device_id) ?? [];
      current.push({
        name: row.module_name,
        portNumber: row.port_number
      });
      map.set(row.device_id, current);
    }

    return map;
  }

  private async previewNextDeviceFromSource(
    source: { execute: Pool["execute"] | PoolConnection["execute"] },
    deviceType: DeviceType,
    lockForUpdate: boolean
  ): Promise<DeviceCreatePreview> {
    const prefix = toDeviceIdPrefix(deviceType);
    const lockSuffix = lockForUpdate ? " FOR UPDATE" : "";
    const [rows] = await source.execute<RowDataPacket[]>(
      `SELECT device_id
       FROM devices
       WHERE device_id LIKE ?${lockSuffix}`,
      [`${prefix}-%`]
    );

    const nextSequence = computeNextSequence(
      rows.map((row) => String((row as { device_id?: unknown }).device_id ?? "")),
      prefix
    );
    return buildDeviceCreatePreview(deviceType, nextSequence);
  }

  async previewNextDevice(deviceType: DeviceType): Promise<DeviceCreatePreview> {
    return this.previewNextDeviceFromSource(this.pool, deviceType, false);
  }

  async listDevices(query?: string): Promise<DeviceRecord[]> {
    const values: unknown[] = [];
    let whereClause = "";

    if (query && query.trim()) {
      const keyword = `%${query.trim()}%`;
      whereClause = `WHERE (
        device_id LIKE ? OR
        IFNULL(device_type, '') LIKE ? OR
        IFNULL(model_name, '') LIKE ? OR
        IFNULL(location_name, '') LIKE ?
      )`;
      values.push(keyword, keyword, keyword, keyword);
    }

    const [rows] = await this.pool.query<DeviceRow[]>(
      `SELECT device_id, device_type, model_name, location_name, latitude, longitude, last_seen_at
       FROM devices
      ${whereClause}
       ORDER BY device_id ASC`,
      values
    );

    const deviceIds = rows.map((row) => row.device_id);
    const [installedByDevice, modulesByDevice] = await Promise.all([
      this.getInstalledPackagesByDeviceIds(deviceIds),
      this.getModulesByDeviceIds(deviceIds)
    ]);

    return rows.map((row) =>
      toDeviceRecord(row, installedByDevice.get(row.device_id) ?? [], modulesByDevice.get(row.device_id) ?? [])
    );
  }

  async getDeviceById(deviceId: string): Promise<DeviceRecord | null> {
    const [rows] = await this.pool.execute<DeviceRow[]>(
      `SELECT device_id, device_type, model_name, location_name, latitude, longitude, last_seen_at
       FROM devices
       WHERE device_id = ?
       LIMIT 1`,
      [deviceId]
    );

    const row = rows[0];
    if (!row) {
      return null;
    }

    const [installedByDevice, modulesByDevice] = await Promise.all([
      this.getInstalledPackagesByDeviceIds([deviceId]),
      this.getModulesByDeviceIds([deviceId])
    ]);
    return toDeviceRecord(row, installedByDevice.get(deviceId) ?? [], modulesByDevice.get(deviceId) ?? []);
  }

  async createDevice(input: CreateDeviceInput): Promise<string> {
    const maxRetries = 3;
    for (let attempt = 0; attempt < maxRetries; attempt += 1) {
      try {
        return await this.withTransaction(async (conn) => {
          const preview = await this.previewNextDeviceFromSource(conn, input.deviceType, true);

          await conn.execute(
            `INSERT INTO devices (device_id, device_type, model_name, location_name, latitude, longitude, last_seen_at)
             VALUES (?, ?, ?, ?, ?, ?, NULL)`,
            [preview.deviceId, input.deviceType, input.modelName, input.locationName, input.lat, input.lng]
          );

          if (preview.modules.length > 0) {
            const placeholders = preview.modules.map(() => "(?, ?, ?)").join(", ");
            const values = preview.modules.flatMap((module) => [preview.deviceId, module.name, module.portNumber]);
            await conn.query(
              `INSERT INTO device_modules (device_id, module_name, port_number)
               VALUES ${placeholders}`,
              values
            );
          }

          return preview.deviceId;
        });
      } catch (error) {
        const maybeError = error as { code?: string };
        if (maybeError.code === "ER_DUP_ENTRY" && attempt < maxRetries - 1) {
          continue;
        }
        throw error;
      }
    }

    throw new Error("기기 ID 생성에 실패했습니다.");
  }

  async saveDeviceState(
    deviceId: string,
    packages: Record<string, number>,
    lastSeenAt: string
  ): Promise<void> {
    await this.withTransaction(async (conn) => {
      await conn.execute(
        `INSERT INTO devices (device_id, last_seen_at)
         VALUES (?, ?)
         ON DUPLICATE KEY UPDATE last_seen_at = VALUES(last_seen_at)`,
        [deviceId, lastSeenAt]
      );

      await conn.execute("DELETE FROM device_packages WHERE device_id = ?", [deviceId]);

      const packageEntries = Object.entries(packages);
      if (packageEntries.length === 0) {
        return;
      }

      const placeholders = packageEntries.map(() => "(?, ?, ?)").join(", ");
      const values = packageEntries.flatMap(([packageName, versionCode]) => [
        deviceId,
        packageName,
        versionCode
      ]);

      await conn.query(
        `INSERT INTO device_packages (device_id, package_name, version_code)
         VALUES ${placeholders}`,
        values
      );
    });
  }

  async getLatestReleases(): Promise<AppRelease[]> {
    const [rows] = await this.pool.query<ReleaseRow[]>(
      `SELECT id, app_id, package_name, display_name, version_name, version_code,
              file_name, sha256, file_size, auto_update, changelog, uploaded_at
       FROM app_releases
       ORDER BY app_id ASC, version_code DESC, uploaded_at DESC`
    );

    const latestByAppId = new Map<string, AppRelease>();
    for (const row of rows) {
      if (!latestByAppId.has(row.app_id)) {
        latestByAppId.set(row.app_id, toAppRelease(row));
      }
    }

    return [...latestByAppId.values()];
  }

  async createCommand(command: CommandRecord): Promise<void> {
    await this.withTransaction(async (conn) => {
      await conn.execute(
        `INSERT INTO devices (device_id, last_seen_at)
         VALUES (?, ?)
         ON DUPLICATE KEY UPDATE last_seen_at = last_seen_at`,
        [command.deviceId, command.createdAt]
      );

      await conn.execute(
        `INSERT INTO commands (
          id, device_id, type, payload, status, created_at, updated_at,
          started_at, finished_at, result_message, result_code
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          command.id,
          command.deviceId,
          command.type,
          JSON.stringify(command.payload),
          command.status,
          command.createdAt,
          command.updatedAt,
          command.startedAt ?? null,
          command.finishedAt ?? null,
          command.resultMessage ?? null,
          command.resultCode ?? null
        ]
      );
    });
  }

  async listCommands(filters: {
    deviceId?: string;
    status?: CommandStatus;
  }): Promise<CommandRecord[]> {
    const where: string[] = [];
    const values: unknown[] = [];

    if (filters.deviceId) {
      where.push("device_id = ?");
      values.push(filters.deviceId);
    }
    if (filters.status) {
      where.push("status = ?");
      values.push(filters.status);
    }

    const whereClause = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";
    const [rows] = await this.pool.query<CommandRow[]>(
      `SELECT id, device_id, type, payload, status, created_at, updated_at,
              started_at, finished_at, result_message, result_code
       FROM commands
       ${whereClause}
       ORDER BY created_at DESC`,
      values
    );

    return rows.map(toCommandRecord);
  }

  async pullPendingCommands(deviceId: string, max: number, startedAt: string): Promise<CommandRecord[]> {
    return this.withTransaction(async (conn) => {
      const [idRows] = await conn.execute<CommandIdRow[]>(
        `SELECT id
         FROM commands
         WHERE device_id = ? AND status = 'PENDING'
         ORDER BY created_at ASC
         LIMIT ?
         FOR UPDATE`,
        [deviceId, max]
      );

      if (idRows.length === 0) {
        return [];
      }

      const ids = idRows.map((row) => row.id);
      const placeholders = ids.map(() => "?").join(", ");
      await conn.query(
        `UPDATE commands
         SET status = 'RUNNING',
             started_at = ?,
             updated_at = ?
         WHERE id IN (${placeholders})`,
        [startedAt, startedAt, ...ids]
      );

      const [rows] = await conn.query<CommandRow[]>(
        `SELECT id, device_id, type, payload, status, created_at, updated_at,
                started_at, finished_at, result_message, result_code
         FROM commands
         WHERE id IN (${placeholders})
         ORDER BY created_at ASC`,
        ids
      );

      return rows.map(toCommandRecord);
    });
  }

  async updateCommandResult(params: {
    deviceId: string;
    commandId: string;
    status: CommandStatus;
    resultMessage?: string;
    resultCode?: number;
    updatedAt: string;
  }): Promise<CommandRecord | null> {
    const finishedAt = params.status === "SUCCESS" || params.status === "FAILED" ? params.updatedAt : null;

    const [result] = await this.pool.execute<ResultSetHeader>(
      `UPDATE commands
       SET status = ?,
           updated_at = ?,
           result_message = ?,
           result_code = ?,
           finished_at = ?
       WHERE id = ? AND device_id = ?`,
      [
        params.status,
        params.updatedAt,
        params.resultMessage ?? null,
        params.resultCode ?? null,
        finishedAt,
        params.commandId,
        params.deviceId
      ]
    );

    if (result.affectedRows === 0) {
      return null;
    }

    const [rows] = await this.pool.execute<CommandRow[]>(
      `SELECT id, device_id, type, payload, status, created_at, updated_at,
              started_at, finished_at, result_message, result_code
       FROM commands
       WHERE id = ? AND device_id = ?
       LIMIT 1`,
      [params.commandId, params.deviceId]
    );

    const row = rows[0];
    return row ? toCommandRecord(row) : null;
  }

  async saveStoreDeviceSync(input: StoreDeviceSyncInput): Promise<void> {
    const now = input.syncedAt;
    await this.withTransaction(async (conn) => {
      await conn.execute(
        `INSERT INTO store_devices (
          device_id, device_name, model_name, platform, os_version,
          app_store_version, ip_address, last_synced_at, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          device_name = VALUES(device_name),
          model_name = VALUES(model_name),
          platform = VALUES(platform),
          os_version = VALUES(os_version),
          app_store_version = VALUES(app_store_version),
          ip_address = VALUES(ip_address),
          last_synced_at = VALUES(last_synced_at),
          updated_at = VALUES(updated_at)`,
        [
          input.deviceId,
          input.deviceName ?? null,
          input.modelName ?? null,
          input.platform ?? null,
          input.osVersion ?? null,
          input.appStoreVersion ?? null,
          input.ipAddress ?? null,
          now,
          now,
          now
        ]
      );

      await conn.execute("DELETE FROM store_device_packages WHERE device_id = ?", [input.deviceId]);

      if (input.packages.length > 0) {
        const placeholders = input.packages.map(() => "(?, ?, ?, ?, ?)").join(", ");
        const values = input.packages.flatMap((pkg) => [
          input.deviceId,
          pkg.packageName,
          pkg.versionName ?? null,
          pkg.versionCode,
          now
        ]);

        await conn.query(
          `INSERT INTO store_device_packages (
            device_id, package_name, version_name, version_code, synced_at
          ) VALUES ${placeholders}`,
          values
        );
      }

      await conn.execute(
        `INSERT INTO store_sync_logs (
          id, device_id, synced_at, package_count, update_count, app_store_version, ip_address
        ) VALUES (UUID(), ?, ?, ?, ?, ?, ?)`,
        [
          input.deviceId,
          now,
          input.packages.length,
          input.availableUpdateCount,
          input.appStoreVersion ?? null,
          input.ipAddress ?? null
        ]
      );
    });
  }

  async createStoreUpdateEvent(event: StoreUpdateEventRecord): Promise<void> {
    await this.withTransaction(async (conn) => {
      await conn.execute(
        `INSERT INTO store_devices (
          device_id, last_synced_at, created_at, updated_at
        ) VALUES (?, NULL, ?, ?)
        ON DUPLICATE KEY UPDATE
          updated_at = VALUES(updated_at)`,
        [event.deviceId, event.createdAt, event.createdAt]
      );

      await conn.execute(
        `INSERT INTO store_update_events (
          id, device_id, package_name, app_id, release_id, target_version_name, target_version_code,
          event_type, status, message, metadata, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          event.id,
          event.deviceId,
          event.packageName,
          event.appId ?? null,
          event.releaseId ?? null,
          event.targetVersionName ?? null,
          event.targetVersionCode ?? null,
          event.eventType,
          event.status,
          event.message ?? null,
          event.metadata ? JSON.stringify(event.metadata) : null,
          event.createdAt
        ]
      );
    });
  }

  async listStoreDevices(query?: string): Promise<StoreDeviceSummary[]> {
    const values: unknown[] = [];
    let whereClause = "";
    if (query?.trim()) {
      const keyword = `%${query.trim()}%`;
      whereClause = `WHERE (
        d.device_id LIKE ? OR
        IFNULL(d.device_name, '') LIKE ? OR
        IFNULL(d.model_name, '') LIKE ? OR
        IFNULL(d.platform, '') LIKE ?
      )`;
      values.push(keyword, keyword, keyword, keyword);
    }

    const [rows] = await this.pool.query<StoreDeviceSummaryRow[]>(
      `SELECT
         d.device_id,
         d.device_name,
         d.model_name,
         d.platform,
         d.os_version,
         d.app_store_version,
         d.ip_address,
         d.last_synced_at,
         d.created_at,
         d.updated_at,
         (SELECT COUNT(*) FROM store_device_packages p WHERE p.device_id = d.device_id) AS installed_package_count,
         COALESCE((
           SELECT l.update_count
           FROM store_sync_logs l
           WHERE l.device_id = d.device_id
           ORDER BY l.synced_at DESC
           LIMIT 1
         ), 0) AS available_update_count,
         (
           SELECT e.created_at
           FROM store_update_events e
           WHERE e.device_id = d.device_id
           ORDER BY e.created_at DESC
           LIMIT 1
         ) AS latest_event_at,
         (
           SELECT e.event_type
           FROM store_update_events e
           WHERE e.device_id = d.device_id
           ORDER BY e.created_at DESC
           LIMIT 1
         ) AS latest_event_type,
         (
           SELECT e.status
           FROM store_update_events e
           WHERE e.device_id = d.device_id
           ORDER BY e.created_at DESC
           LIMIT 1
         ) AS latest_event_status
       FROM store_devices d
       ${whereClause}
       ORDER BY d.last_synced_at DESC, d.updated_at DESC`,
      values
    );

    return rows.map(toStoreDeviceSummary);
  }

  async getStoreDevice(deviceId: string): Promise<StoreDeviceDetail | null> {
    const [summaryRows] = await this.pool.execute<StoreDeviceSummaryRow[]>(
      `SELECT
         d.device_id,
         d.device_name,
         d.model_name,
         d.platform,
         d.os_version,
         d.app_store_version,
         d.ip_address,
         d.last_synced_at,
         d.created_at,
         d.updated_at,
         (SELECT COUNT(*) FROM store_device_packages p WHERE p.device_id = d.device_id) AS installed_package_count,
         COALESCE((
           SELECT l.update_count
           FROM store_sync_logs l
           WHERE l.device_id = d.device_id
           ORDER BY l.synced_at DESC
           LIMIT 1
         ), 0) AS available_update_count,
         (
           SELECT e.created_at
           FROM store_update_events e
           WHERE e.device_id = d.device_id
           ORDER BY e.created_at DESC
           LIMIT 1
         ) AS latest_event_at,
         (
           SELECT e.event_type
           FROM store_update_events e
           WHERE e.device_id = d.device_id
           ORDER BY e.created_at DESC
           LIMIT 1
         ) AS latest_event_type,
         (
           SELECT e.status
           FROM store_update_events e
           WHERE e.device_id = d.device_id
           ORDER BY e.created_at DESC
           LIMIT 1
         ) AS latest_event_status
       FROM store_devices d
       WHERE d.device_id = ?
       LIMIT 1`,
      [deviceId]
    );

    const summary = summaryRows[0];
    if (!summary) {
      return null;
    }

    const [packageRows, syncRows, eventRows] = await Promise.all([
      this.pool.execute<StoreDevicePackageRow[]>(
        `SELECT device_id, package_name, version_name, version_code, synced_at
         FROM store_device_packages
         WHERE device_id = ?
         ORDER BY package_name ASC`,
        [deviceId]
      ),
      this.pool.execute<StoreSyncLogRow[]>(
        `SELECT id, device_id, synced_at, package_count, update_count, app_store_version, ip_address
         FROM store_sync_logs
         WHERE device_id = ?
         ORDER BY synced_at DESC
         LIMIT 20`,
        [deviceId]
      ),
      this.pool.execute<StoreUpdateEventRow[]>(
        `SELECT
           id, device_id, package_name, app_id, release_id,
           target_version_name, target_version_code, event_type, status,
           message, metadata, created_at
         FROM store_update_events
         WHERE device_id = ?
         ORDER BY created_at DESC
         LIMIT 50`,
        [deviceId]
      )
    ]);

    const packages = packageRows[0].map((row) => ({
      packageName: row.package_name,
      versionCode: row.version_code,
      versionName: row.version_name ?? undefined,
      syncedAt: row.synced_at
    }));

    const recentSyncs = syncRows[0].map(toStoreSyncLogRecord);
    const recentEvents = eventRows[0].map(toStoreUpdateEventRecord);

    return {
      ...toStoreDeviceSummary(summary),
      packages,
      recentSyncs,
      recentEvents
    };
  }

  async listStoreUpdateEvents(filters: {
    deviceId?: string;
    packageName?: string;
    limit?: number;
  }): Promise<StoreUpdateEventRecord[]> {
    const where: string[] = [];
    const values: unknown[] = [];
    if (filters.deviceId) {
      where.push("device_id = ?");
      values.push(filters.deviceId);
    }
    if (filters.packageName) {
      where.push("package_name = ?");
      values.push(filters.packageName);
    }

    const whereClause = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";
    const limit = Math.max(1, Math.min(filters.limit ?? 100, 500));
    values.push(limit);

    const [rows] = await this.pool.query<StoreUpdateEventRow[]>(
      `SELECT
         id, device_id, package_name, app_id, release_id,
         target_version_name, target_version_code, event_type, status,
         message, metadata, created_at
       FROM store_update_events
       ${whereClause}
       ORDER BY created_at DESC
       LIMIT ?`,
      values
    );

    return rows.map(toStoreUpdateEventRecord);
  }
}

function toAppRelease(row: ReleaseRow): AppRelease {
  return {
    id: row.id,
    appId: row.app_id,
    packageName: row.package_name,
    displayName: row.display_name,
    versionName: row.version_name,
    versionCode: row.version_code,
    fileName: row.file_name,
    sha256: row.sha256,
    fileSize: row.file_size,
    autoUpdate: row.auto_update === 1,
    changelog: row.changelog,
    uploadedAt: row.uploaded_at
  };
}

function toCommandRecord(row: CommandRow): CommandRecord {
  return {
    id: row.id,
    deviceId: row.device_id,
    type: row.type,
    payload: parsePayload(row.payload),
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    startedAt: row.started_at ?? undefined,
    finishedAt: row.finished_at ?? undefined,
    resultMessage: row.result_message ?? undefined,
    resultCode: row.result_code ?? undefined
  };
}

function toStoreDeviceSummary(row: StoreDeviceSummaryRow): StoreDeviceSummary {
  return {
    deviceId: row.device_id,
    deviceName: row.device_name ?? undefined,
    modelName: row.model_name ?? undefined,
    platform: row.platform ?? undefined,
    osVersion: row.os_version ?? undefined,
    appStoreVersion: row.app_store_version ?? undefined,
    ipAddress: row.ip_address ?? undefined,
    lastSyncedAt: row.last_synced_at ?? undefined,
    installedPackageCount: Number(row.installed_package_count ?? 0),
    availableUpdateCount: Number(row.available_update_count ?? 0),
    latestEventAt: row.latest_event_at ?? undefined,
    latestEventType: row.latest_event_type ?? undefined,
    latestEventStatus: row.latest_event_status ?? undefined
  };
}

function toStoreSyncLogRecord(row: StoreSyncLogRow): StoreSyncLogRecord {
  return {
    id: row.id,
    deviceId: row.device_id,
    syncedAt: row.synced_at,
    packageCount: Number(row.package_count ?? 0),
    updateCount: Number(row.update_count ?? 0),
    appStoreVersion: row.app_store_version ?? undefined,
    ipAddress: row.ip_address ?? undefined
  };
}

function toStoreUpdateEventRecord(row: StoreUpdateEventRow): StoreUpdateEventRecord {
  return {
    id: row.id,
    deviceId: row.device_id,
    packageName: row.package_name,
    appId: row.app_id ?? undefined,
    releaseId: row.release_id ?? undefined,
    targetVersionName: row.target_version_name ?? undefined,
    targetVersionCode: row.target_version_code ?? undefined,
    eventType: row.event_type,
    status: parseStoreEventStatus(row.status),
    message: row.message ?? undefined,
    metadata: parsePayload(row.metadata),
    createdAt: row.created_at
  };
}

function toDeviceRecord(
  row: DeviceRow,
  installedApps: DevicePackageVersion[],
  modules: DeviceModuleRecord[]
): DeviceRecord {
  return {
    deviceId: row.device_id,
    deviceType: row.device_type === "시스트파크" || row.device_type === "시스트런" ? row.device_type : undefined,
    modelName: row.model_name ?? undefined,
    locationName: row.location_name ?? undefined,
    lat: typeof row.latitude === "number" ? row.latitude : undefined,
    lng: typeof row.longitude === "number" ? row.longitude : undefined,
    lastSeenAt: row.last_seen_at ?? undefined,
    installedApps,
    modules
  };
}

function toDeviceIdPrefix(deviceType: DeviceType): "park" | "run" {
  return deviceType === "시스트파크" ? "park" : "run";
}

function computeNextSequence(deviceIds: string[], prefix: "park" | "run"): number {
  const pattern = new RegExp(`^${prefix}-(\\d+)$`);
  let maxSequence = 0;

  for (const deviceId of deviceIds) {
    const match = deviceId.match(pattern);
    if (!match) {
      continue;
    }

    const sequence = Number(match[1]);
    if (Number.isInteger(sequence) && sequence > maxSequence) {
      maxSequence = sequence;
    }
  }

  return maxSequence + 1;
}

function buildDeviceCreatePreview(deviceType: DeviceType, sequence: number): DeviceCreatePreview {
  if (sequence > 999) {
    throw new Error("기기 번호가 999를 초과했습니다.");
  }

  const prefix = toDeviceIdPrefix(deviceType);
  const suffix = String(sequence).padStart(3, "0");
  const deviceId = `${prefix}-${suffix}`;

  const portPrefixAndroid = deviceType === "시스트런" ? "10" : "12";
  const portPrefixAiBox = deviceType === "시스트런" ? "11" : "13";

  return {
    deviceId,
    modules: [
      {
        name: "안드로이드",
        portNumber: Number(`${portPrefixAndroid}${suffix}`)
      },
      {
        name: "AI BOX",
        portNumber: Number(`${portPrefixAiBox}${suffix}`)
      }
    ]
  };
}

function parsePayload(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === "object" && !Buffer.isBuffer(raw)) {
    return raw as Record<string, unknown>;
  }

  if (Buffer.isBuffer(raw)) {
    const text = raw.toString("utf-8");
    return parsePayload(text);
  }

  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return {};
    }
  }

  return {};
}

function parseStoreEventStatus(raw: unknown): StoreUpdateEventStatus {
  const normalized = String(raw ?? "").toUpperCase();
  if (normalized === "SUCCESS" || normalized === "FAILED") {
    return normalized;
  }
  return "INFO";
}
