import { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";
import {
  StoreDeviceDetail,
  StoreDevicePackageVersion,
  StoreDeviceSummary,
  StoreDeviceSyncInput,
  StoreSyncLogRecord,
  StoreUpdateEventRecord,
  StoreUpdateEventStatus
} from "../types.js";

export const STORE_SCHEMA_STATEMENTS = [
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

export async function saveStoreDeviceSync(
  withTransaction: <T>(callback: (conn: PoolConnection) => Promise<T>) => Promise<T>,
  input: StoreDeviceSyncInput
): Promise<void> {
  const now = input.syncedAt;
  await withTransaction(async (conn) => {
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

export async function createStoreUpdateEvent(
  withTransaction: <T>(callback: (conn: PoolConnection) => Promise<T>) => Promise<T>,
  event: StoreUpdateEventRecord
): Promise<void> {
  await withTransaction(async (conn) => {
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

export async function listStoreDevices(pool: Pool, query?: string): Promise<StoreDeviceSummary[]> {
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

  const [rows] = await pool.query<StoreDeviceSummaryRow[]>(
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

export async function getStoreDevice(pool: Pool, deviceId: string): Promise<StoreDeviceDetail | null> {
  const [summaryRows] = await pool.execute<StoreDeviceSummaryRow[]>(
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
    pool.execute<StoreDevicePackageRow[]>(
      `SELECT device_id, package_name, version_name, version_code, synced_at
       FROM store_device_packages
       WHERE device_id = ?
       ORDER BY package_name ASC`,
      [deviceId]
    ),
    pool.execute<StoreSyncLogRow[]>(
      `SELECT id, device_id, synced_at, package_count, update_count, app_store_version, ip_address
       FROM store_sync_logs
       WHERE device_id = ?
       ORDER BY synced_at DESC
       LIMIT 20`,
      [deviceId]
    ),
    pool.execute<StoreUpdateEventRow[]>(
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

export async function listStoreUpdateEvents(
  pool: Pool,
  filters: {
    deviceId?: string;
    packageName?: string;
    limit?: number;
  }
): Promise<StoreUpdateEventRecord[]> {
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

  const [rows] = await pool.query<StoreUpdateEventRow[]>(
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

function parseStoreEventStatus(raw: unknown): StoreUpdateEventStatus {
  const normalized = String(raw ?? "").toUpperCase();
  if (normalized === "SUCCESS" || normalized === "FAILED") {
    return normalized;
  }
  return "INFO";
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
