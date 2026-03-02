import { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";
import { v4 as uuidv4 } from "uuid";
import {
  ActiveDeliveryRef,
  CreateDeviceInput,
  DeviceCreatePreview,
  DeviceInstitutionContractWindow,
  DeviceModuleRecord,
  DevicePackageVersion,
  DeviceRecord,
  DeviceType,
  InstitutionRef,
  InstitutionTypeCode
} from "../types.js";

export const DEVICES_SCHEMA_STATEMENTS = [
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
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
];

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

type DeviceActiveInstitutionRow = RowDataPacket & {
  device_id: string;
  delivery_id: string;
  delivered_at: string;
  install_location: string | null;
  delivery_memo: string | null;
  institution_id: string;
  institution_name: string;
  institution_type_code: string;
  contract_start_date: string | null;
  contract_end_date: string | null;
};

export async function previewNextDevice(pool: Pool, deviceType: DeviceType): Promise<DeviceCreatePreview> {
  return previewNextDeviceFromSource(pool, deviceType, false);
}

export async function listDevices(pool: Pool, query?: string): Promise<DeviceRecord[]> {
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

  const [rows] = await pool.query<DeviceRow[]>(
    `SELECT device_id, device_type, model_name, location_name, latitude, longitude, last_seen_at
     FROM devices
    ${whereClause}
     ORDER BY device_id ASC`,
    values
  );

  const deviceIds = rows.map((row) => row.device_id);
  const [installedByDevice, modulesByDevice, activeByDevice] = await Promise.all([
    getInstalledPackagesByDeviceIds(pool, deviceIds),
    getModulesByDeviceIds(pool, deviceIds),
    getActiveInstitutionByDeviceIds(pool, deviceIds)
  ]);

  return rows.map((row) =>
    toDeviceRecord(
      row,
      installedByDevice.get(row.device_id) ?? [],
      modulesByDevice.get(row.device_id) ?? [],
      activeByDevice.get(row.device_id)
    )
  );
}

export async function getDeviceById(pool: Pool, deviceId: string): Promise<DeviceRecord | null> {
  const [rows] = await pool.execute<DeviceRow[]>(
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

  const [installedByDevice, modulesByDevice, activeByDevice] = await Promise.all([
    getInstalledPackagesByDeviceIds(pool, [deviceId]),
    getModulesByDeviceIds(pool, [deviceId]),
    getActiveInstitutionByDeviceIds(pool, [deviceId])
  ]);
  return toDeviceRecord(
    row,
    installedByDevice.get(deviceId) ?? [],
    modulesByDevice.get(deviceId) ?? [],
    activeByDevice.get(deviceId)
  );
}

export async function createDevice(
  withTransaction: <T>(callback: (conn: PoolConnection) => Promise<T>) => Promise<T>,
  input: CreateDeviceInput
): Promise<string> {
  const maxRetries = 3;
  for (let attempt = 0; attempt < maxRetries; attempt += 1) {
    try {
      return await withTransaction(async (conn) => {
        const preview = await previewNextDeviceFromSource(conn, input.deviceType, true);
        const now = input.actedAt || new Date().toISOString();

        await conn.execute(
          `INSERT INTO devices (device_id, device_type, model_name, location_name, latitude, longitude, last_seen_at)
           VALUES (?, ?, ?, ?, ?, ?, NULL)`,
          [preview.deviceId, input.deviceType, input.modelName, input.locationName, input.lat, input.lng]
        );

        if (preview.modules.length > 0) {
          const placeholders = preview.modules.map(() => "(?, ?, ?)").join(", ");
          const values = preview.modules.flatMap((module) => [
            preview.deviceId,
            module.name,
            module.portNumber
          ]);
          await conn.query(
            `INSERT INTO device_modules (device_id, module_name, port_number)
             VALUES ${placeholders}`,
            values
          );
        }

        if (input.institutionId) {
          const [institutionRows] = await conn.execute<RowDataPacket[]>(
            `SELECT id
             FROM institutions
             WHERE id = ?
             LIMIT 1
             FOR UPDATE`,
            [input.institutionId]
          );
          if (institutionRows.length === 0) {
            const err = new Error("기관을 찾을 수 없습니다.");
            (err as { code?: string }).code = "INSTITUTION_NOT_FOUND";
            throw err;
          }

          const [activeRows] = await conn.execute<RowDataPacket[]>(
            `SELECT id
             FROM institution_device_deliveries
             WHERE device_id = ? AND retrieved_at IS NULL
             LIMIT 1
             FOR UPDATE`,
            [preview.deviceId]
          );
          if (activeRows.length > 0) {
            const err = new Error("이미 납품중인 기기입니다.");
            (err as { code?: string }).code = "DEVICE_ALREADY_DELIVERED";
            throw err;
          }

          const deliveredAt = input.deliveredAt || now;
          const deliveryId = uuidv4();
          await conn.execute(
            `INSERT INTO institution_device_deliveries (
              id, institution_id, device_id, device_type_snapshot, delivered_at, retrieved_at,
              install_location, memo, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, ?)`,
            [
              deliveryId,
              input.institutionId,
              preview.deviceId,
              input.deviceType,
              deliveredAt,
              input.installLocation ?? null,
              input.deliveryMemo ?? null,
              now,
              now
            ]
          );

          await conn.execute(
            `INSERT INTO institution_action_logs (
              id, institution_id, device_id, action_type, action_payload_json, acted_by, acted_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
              uuidv4(),
              input.institutionId,
              preview.deviceId,
              "DEVICE_CREATED_WITH_INSTITUTION",
              JSON.stringify({
                deviceId: preview.deviceId,
                deviceType: input.deviceType,
                deliveredAt,
                installLocation: input.installLocation ?? null,
                memo: input.deliveryMemo ?? null
              }),
              input.actedBy || "unknown-admin",
              now
            ]
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

export async function saveDeviceState(
  withTransaction: <T>(callback: (conn: PoolConnection) => Promise<T>) => Promise<T>,
  deviceId: string,
  packages: Record<string, number>,
  lastSeenAt: string
): Promise<void> {
  await withTransaction(async (conn) => {
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

export async function getDeviceContractWindow(
  pool: Pool,
  deviceId: string
): Promise<DeviceInstitutionContractWindow | null> {
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT
       i.id AS institution_id,
       i.name AS institution_name,
       i.contract_start_date,
       i.contract_end_date
     FROM institution_device_deliveries d
     INNER JOIN institutions i ON i.id = d.institution_id
     WHERE d.device_id = ? AND d.retrieved_at IS NULL
     LIMIT 1`,
    [deviceId]
  );
  const row = rows[0] as
    | {
        institution_id?: string;
        institution_name?: string;
        contract_start_date?: string | null;
        contract_end_date?: string | null;
      }
    | undefined;
  if (!row?.institution_id || !row.institution_name) {
    return null;
  }

  return {
    institutionId: row.institution_id,
    institutionName: row.institution_name,
    contractStartDate: row.contract_start_date ?? undefined,
    contractEndDate: row.contract_end_date ?? undefined
  };
}

async function getInstalledPackagesByDeviceIds(
  pool: Pool,
  deviceIds: string[]
): Promise<Map<string, DevicePackageVersion[]>> {
  const map = new Map<string, DevicePackageVersion[]>();
  if (deviceIds.length === 0) {
    return map;
  }

  const placeholders = deviceIds.map(() => "?").join(", ");
  const [rows] = await pool.query<DevicePackageRow[]>(
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

async function getModulesByDeviceIds(
  pool: Pool,
  deviceIds: string[]
): Promise<Map<string, DeviceModuleRecord[]>> {
  const map = new Map<string, DeviceModuleRecord[]>();
  if (deviceIds.length === 0) {
    return map;
  }

  const placeholders = deviceIds.map(() => "?").join(", ");
  const [rows] = await pool.query<DeviceModuleRow[]>(
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

async function getActiveInstitutionByDeviceIds(
  pool: Pool,
  deviceIds: string[]
): Promise<Map<string, { institution: InstitutionRef; delivery: ActiveDeliveryRef }>> {
  const map = new Map<string, { institution: InstitutionRef; delivery: ActiveDeliveryRef }>();
  if (deviceIds.length === 0) {
    return map;
  }

  const placeholders = deviceIds.map(() => "?").join(", ");
  const [rows] = await pool.query<DeviceActiveInstitutionRow[]>(
    `SELECT
       d.device_id,
       d.id AS delivery_id,
       d.delivered_at,
       d.install_location,
       d.memo AS delivery_memo,
       i.id AS institution_id,
       i.name AS institution_name,
       i.institution_type_code,
       i.contract_start_date,
       i.contract_end_date
     FROM institution_device_deliveries d
     INNER JOIN institutions i ON i.id = d.institution_id
     WHERE d.retrieved_at IS NULL
       AND d.device_id IN (${placeholders})`,
    deviceIds
  );

  for (const row of rows) {
    map.set(row.device_id, {
      institution: {
        institutionId: row.institution_id,
        name: row.institution_name,
        institutionTypeCode: parseInstitutionTypeCode(row.institution_type_code),
        contractStartDate: row.contract_start_date ?? undefined,
        contractEndDate: row.contract_end_date ?? undefined
      },
      delivery: {
        deliveryId: row.delivery_id,
        deliveredAt: row.delivered_at,
        installLocation: row.install_location ?? undefined,
        memo: row.delivery_memo ?? undefined
      }
    });
  }

  return map;
}

async function previewNextDeviceFromSource(
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

function toDeviceRecord(
  row: DeviceRow,
  installedApps: DevicePackageVersion[],
  modules: DeviceModuleRecord[],
  active?: { institution: InstitutionRef; delivery: ActiveDeliveryRef }
): DeviceRecord {
  return {
    deviceId: row.device_id,
    deviceType: parseDeviceType(row.device_type),
    modelName: row.model_name ?? undefined,
    locationName: row.location_name ?? undefined,
    lat: typeof row.latitude === "number" ? row.latitude : undefined,
    lng: typeof row.longitude === "number" ? row.longitude : undefined,
    lastSeenAt: row.last_seen_at ?? undefined,
    installedApps,
    modules,
    activeInstitution: active?.institution,
    activeDelivery: active?.delivery
  };
}

function parseDeviceType(value: unknown): DeviceType | undefined {
  if (value === "시스트파크" || value === "시스트런") {
    return value;
  }
  return undefined;
}

function parseInstitutionTypeCode(value: unknown): InstitutionTypeCode {
  return String(value) === "PARK" ? "PARK" : "SCHOOL";
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
