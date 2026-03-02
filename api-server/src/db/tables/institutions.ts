import { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";
import { v4 as uuidv4 } from "uuid";
import {
  CreateInstitutionDeliveryInput,
  CreateInstitutionInput,
  DeviceType,
  EndInstitutionDeliveryInput,
  InstitutionActionLogRecord,
  InstitutionDetail,
  InstitutionFieldDataType,
  InstitutionFieldValue,
  InstitutionFieldValues,
  InstitutionListFilters,
  InstitutionLogFilters,
  InstitutionStatus,
  InstitutionSummary,
  InstitutionTypeCode,
  InstitutionTypeFieldRecord,
  InstitutionTypeRecord,
  UnassignedDeviceRecord,
  UpdateInstitutionInput
} from "../types.js";

export const INSTITUTIONS_SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS institution_types (
    code VARCHAR(30) NOT NULL,
    name VARCHAR(60) NOT NULL,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at VARCHAR(30) NOT NULL,
    updated_at VARCHAR(30) NOT NULL,
    PRIMARY KEY (code)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS institution_type_fields (
    id CHAR(36) NOT NULL,
    institution_type_code VARCHAR(30) NOT NULL,
    field_key VARCHAR(64) NOT NULL,
    label VARCHAR(100) NOT NULL,
    data_type VARCHAR(20) NOT NULL,
    is_required TINYINT(1) NOT NULL DEFAULT 0,
    options_json JSON NULL,
    sort_order INT NOT NULL DEFAULT 0,
    created_at VARCHAR(30) NOT NULL,
    updated_at VARCHAR(30) NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_type_field (institution_type_code, field_key),
    KEY idx_type_fields_sort (institution_type_code, sort_order),
    CONSTRAINT fk_type_fields_type FOREIGN KEY (institution_type_code) REFERENCES institution_types(code) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS institutions (
    id CHAR(36) NOT NULL,
    name VARCHAR(255) NOT NULL,
    institution_type_code VARCHAR(30) NOT NULL,
    status VARCHAR(20) NOT NULL,
    contact_name VARCHAR(120) NULL,
    contact_phone VARCHAR(40) NULL,
    address_road VARCHAR(255) NULL,
    address_detail VARCHAR(255) NULL,
    latitude DOUBLE NULL,
    longitude DOUBLE NULL,
    memo TEXT NULL,
    contract_start_date CHAR(10) NULL,
    contract_end_date CHAR(10) NULL,
    created_at VARCHAR(30) NOT NULL,
    updated_at VARCHAR(30) NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_institution_name (name),
    KEY idx_institutions_type_status (institution_type_code, status),
    CONSTRAINT fk_institutions_type FOREIGN KEY (institution_type_code) REFERENCES institution_types(code)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS institution_field_values (
    institution_id CHAR(36) NOT NULL,
    institution_type_field_id CHAR(36) NOT NULL,
    value_text TEXT NULL,
    value_number DOUBLE NULL,
    value_bool TINYINT(1) NULL,
    value_date VARCHAR(30) NULL,
    created_at VARCHAR(30) NOT NULL,
    updated_at VARCHAR(30) NOT NULL,
    PRIMARY KEY (institution_id, institution_type_field_id),
    CONSTRAINT fk_field_values_institution FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE CASCADE,
    CONSTRAINT fk_field_values_field FOREIGN KEY (institution_type_field_id) REFERENCES institution_type_fields(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS institution_device_deliveries (
    id CHAR(36) NOT NULL,
    institution_id CHAR(36) NOT NULL,
    device_id VARCHAR(120) NOT NULL,
    device_type_snapshot VARCHAR(30) NULL,
    delivered_at VARCHAR(30) NOT NULL,
    retrieved_at VARCHAR(30) NULL,
    install_location VARCHAR(255) NULL,
    memo TEXT NULL,
    created_at VARCHAR(30) NOT NULL,
    updated_at VARCHAR(30) NOT NULL,
    active_device_key VARCHAR(120) GENERATED ALWAYS AS (IF(retrieved_at IS NULL, device_id, NULL)) STORED,
    PRIMARY KEY (id),
    UNIQUE KEY uq_active_delivery_device (active_device_key),
    KEY idx_deliveries_institution (institution_id, retrieved_at, delivered_at),
    KEY idx_deliveries_device (device_id, delivered_at),
    CONSTRAINT fk_deliveries_institution FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE CASCADE,
    CONSTRAINT fk_deliveries_device FOREIGN KEY (device_id) REFERENCES devices(device_id) ON DELETE RESTRICT
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS institution_action_logs (
    id CHAR(36) NOT NULL,
    institution_id CHAR(36) NOT NULL,
    device_id VARCHAR(120) NULL,
    action_type VARCHAR(60) NOT NULL,
    action_payload_json JSON NULL,
    acted_by VARCHAR(120) NOT NULL,
    acted_at VARCHAR(30) NOT NULL,
    PRIMARY KEY (id),
    KEY idx_logs_institution_time (institution_id, acted_at),
    KEY idx_logs_action_time (action_type, acted_at),
    KEY idx_logs_device_time (device_id, acted_at),
    CONSTRAINT fk_logs_institution FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
];

const DEFAULT_INSTITUTION_TYPES: InstitutionTypeRecord[] = [
  { code: "SCHOOL", name: "학교", isActive: true },
  { code: "PARK", name: "공원", isActive: true }
];

const DEFAULT_INSTITUTION_TYPE_FIELDS: Array<{
  institutionTypeCode: InstitutionTypeCode;
  fieldKey: string;
  label: string;
  dataType: InstitutionFieldDataType;
  isRequired: boolean;
  options: string[];
  sortOrder: number;
}> = [
  {
    institutionTypeCode: "SCHOOL",
    fieldKey: "school_level",
    label: "학교급",
    dataType: "SELECT",
    isRequired: true,
    options: ["초", "중", "고", "대", "특수", "기타"],
    sortOrder: 10
  },
  {
    institutionTypeCode: "PARK",
    fieldKey: "park_category",
    label: "공원 분류",
    dataType: "SELECT",
    isRequired: true,
    options: ["근린", "어린이", "체육", "수변", "기타"],
    sortOrder: 10
  },
  {
    institutionTypeCode: "PARK",
    fieldKey: "managing_agency",
    label: "관리 기관",
    dataType: "TEXT",
    isRequired: true,
    options: [],
    sortOrder: 20
  },
  {
    institutionTypeCode: "PARK",
    fieldKey: "park_area_m2",
    label: "면적(m2)",
    dataType: "NUMBER",
    isRequired: false,
    options: [],
    sortOrder: 30
  },
  {
    institutionTypeCode: "PARK",
    fieldKey: "operation_hours",
    label: "운영 시간",
    dataType: "TEXT",
    isRequired: false,
    options: [],
    sortOrder: 40
  },
  {
    institutionTypeCode: "PARK",
    fieldKey: "zone_name",
    label: "설치 구역명",
    dataType: "TEXT",
    isRequired: false,
    options: [],
    sortOrder: 50
  },
  {
    institutionTypeCode: "PARK",
    fieldKey: "night_lighting",
    label: "야간 조명 여부",
    dataType: "BOOLEAN",
    isRequired: false,
    options: [],
    sortOrder: 60
  }
];

const LEGACY_REMOVED_FIELD_KEYS_BY_TYPE: Partial<Record<InstitutionTypeCode, string[]>> = {
  SCHOOL: ["education_office", "school_code", "operator_department", "student_count", "class_count"]
};

type InstitutionTypeRow = RowDataPacket & {
  code: string;
  name: string;
  is_active: number;
  created_at: string;
  updated_at: string;
};

type InstitutionTypeFieldRow = RowDataPacket & {
  id: string;
  institution_type_code: string;
  field_key: string;
  label: string;
  data_type: string;
  is_required: number;
  options_json: unknown;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

type InstitutionSummaryRow = RowDataPacket & {
  id: string;
  name: string;
  institution_type_code: string;
  institution_type_name: string;
  status: string;
  contact_name: string | null;
  contact_phone: string | null;
  address_road: string | null;
  address_detail: string | null;
  latitude: number | null;
  longitude: number | null;
  memo: string | null;
  contract_start_date: string | null;
  contract_end_date: string | null;
  active_device_count: number;
  created_at: string;
  updated_at: string;
};

type InstitutionFieldValueRow = RowDataPacket & {
  institution_id: string;
  institution_type_field_id: string;
  field_key: string;
  data_type: string;
  value_text: string | null;
  value_number: number | null;
  value_bool: number | null;
  value_date: string | null;
};

type InstitutionDeliveryRow = RowDataPacket & {
  id: string;
  institution_id: string;
  device_id: string;
  device_type_snapshot: string | null;
  delivered_at: string;
  retrieved_at: string | null;
  install_location: string | null;
  memo: string | null;
  created_at: string;
  updated_at: string;
  status: string;
};

type InstitutionActionLogRow = RowDataPacket & {
  id: string;
  institution_id: string;
  device_id: string | null;
  action_type: string;
  action_payload_json: unknown;
  acted_by: string;
  acted_at: string;
};

type UnassignedDeviceRow = RowDataPacket & {
  device_id: string;
  device_type: string | null;
  model_name: string | null;
  location_name: string | null;
};

export async function seedInstitutionMetadata(pool: Pool): Promise<void> {
  const now = new Date().toISOString();

  for (const type of DEFAULT_INSTITUTION_TYPES) {
    await pool.execute(
      `INSERT INTO institution_types (code, name, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         name = VALUES(name),
         is_active = VALUES(is_active),
         updated_at = VALUES(updated_at)`,
      [type.code, type.name, type.isActive ? 1 : 0, now, now]
    );
  }

  for (const field of DEFAULT_INSTITUTION_TYPE_FIELDS) {
    await pool.execute(
      `INSERT INTO institution_type_fields (
        id, institution_type_code, field_key, label, data_type, is_required, options_json, sort_order, created_at, updated_at
      )
      VALUES (UUID(), ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        label = VALUES(label),
        data_type = VALUES(data_type),
        is_required = VALUES(is_required),
        options_json = VALUES(options_json),
        sort_order = VALUES(sort_order),
        updated_at = VALUES(updated_at)`,
      [
        field.institutionTypeCode,
        field.fieldKey,
        field.label,
        field.dataType,
        field.isRequired ? 1 : 0,
        JSON.stringify(field.options),
        field.sortOrder,
        now,
        now
      ]
    );
  }

  for (const [typeCode, fieldKeys] of Object.entries(LEGACY_REMOVED_FIELD_KEYS_BY_TYPE)) {
    if (!fieldKeys || fieldKeys.length === 0) {
      continue;
    }
    const placeholders = fieldKeys.map(() => "?").join(", ");
    await pool.execute(
      `DELETE FROM institution_type_fields
       WHERE institution_type_code = ?
         AND field_key IN (${placeholders})`,
      [typeCode, ...fieldKeys]
    );
  }
}

export async function listInstitutionTypes(pool: Pool): Promise<InstitutionTypeRecord[]> {
  const [rows] = await pool.query<InstitutionTypeRow[]>(
    `SELECT code, name, is_active, created_at, updated_at
     FROM institution_types
     ORDER BY code ASC`
  );
  return rows.map(toInstitutionTypeRecord);
}

export async function listInstitutionTypeFields(
  pool: Pool,
  typeCode?: InstitutionTypeCode
): Promise<InstitutionTypeFieldRecord[]> {
  return getInstitutionTypeFieldsBySource(pool, typeCode);
}

export async function listInstitutions(
  pool: Pool,
  filters: InstitutionListFilters
): Promise<InstitutionSummary[]> {
  const where: string[] = [];
  const values: unknown[] = [];

  if (filters.query?.trim()) {
    const keyword = `%${filters.query.trim()}%`;
    where.push("(i.name LIKE ? OR IFNULL(i.contact_name, '') LIKE ? OR IFNULL(i.contact_phone, '') LIKE ?)");
    values.push(keyword, keyword, keyword);
  }

  if (filters.typeCode) {
    where.push("i.institution_type_code = ?");
    values.push(filters.typeCode);
  }

  if (filters.status) {
    where.push("i.status = ?");
    values.push(filters.status);
  }

  if (typeof filters.hasActiveDevices === "boolean") {
    if (filters.hasActiveDevices) {
      where.push(
        "EXISTS (SELECT 1 FROM institution_device_deliveries d WHERE d.institution_id = i.id AND d.retrieved_at IS NULL)"
      );
    } else {
      where.push(
        "NOT EXISTS (SELECT 1 FROM institution_device_deliveries d WHERE d.institution_id = i.id AND d.retrieved_at IS NULL)"
      );
    }
  }

  const page = Math.max(1, filters.page ?? 1);
  const size = Math.max(1, Math.min(filters.size ?? 50, 200));
  const offset = (page - 1) * size;
  const whereClause = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";

  const [rows] = await pool.query<InstitutionSummaryRow[]>(
    `SELECT
       i.id,
       i.name,
       i.institution_type_code,
       t.name AS institution_type_name,
       i.status,
       i.contact_name,
       i.contact_phone,
       i.address_road,
       i.address_detail,
       i.latitude,
       i.longitude,
       i.memo,
       i.contract_start_date,
       i.contract_end_date,
       i.created_at,
       i.updated_at,
       (
         SELECT COUNT(*)
         FROM institution_device_deliveries d
         WHERE d.institution_id = i.id AND d.retrieved_at IS NULL
       ) AS active_device_count
     FROM institutions i
     INNER JOIN institution_types t ON t.code = i.institution_type_code
     ${whereClause}
     ORDER BY i.updated_at DESC
     LIMIT ?
     OFFSET ?`,
    [...values, size, offset]
  );

  return rows.map(toInstitutionSummaryRecord);
}

export async function getInstitutionById(
  pool: Pool,
  institutionId: string
): Promise<InstitutionDetail | null> {
  return getInstitutionDetailBySource(pool, institutionId);
}

export async function createInstitution(
  withTransaction: <T>(callback: (conn: PoolConnection) => Promise<T>) => Promise<T>,
  input: CreateInstitutionInput,
  options: {
    afterCreate?: (conn: PoolConnection, institution: InstitutionDetail) => Promise<void>;
  } = {}
): Promise<InstitutionDetail> {
  return withTransaction(async (conn) => {
    const fields = await getInstitutionTypeFieldsBySource(conn, input.institutionTypeCode);
    const normalizedFieldValues = normalizeInstitutionFieldValues(fields, input.fields);
    const institutionId = uuidv4();
    const now = input.actedAt;

    try {
      await conn.execute(
        `INSERT INTO institutions (
          id, name, institution_type_code, status,
          contact_name, contact_phone, address_road, address_detail,
          latitude, longitude, memo, contract_start_date, contract_end_date,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          institutionId,
          input.name,
          input.institutionTypeCode,
          input.status,
          input.contactName ?? null,
          input.contactPhone ?? null,
          input.addressRoad ?? null,
          input.addressDetail ?? null,
          input.lat ?? null,
          input.lng ?? null,
          input.memo ?? null,
          input.contractStartDate ?? null,
          input.contractEndDate ?? null,
          now,
          now
        ]
      );
    } catch (error) {
      const maybeError = error as { code?: string };
      if (maybeError.code === "ER_DUP_ENTRY") {
        const err = new Error("institution name already exists");
        (err as { code?: string }).code = "INSTITUTION_NAME_CONFLICT";
        throw err;
      }
      throw error;
    }

    await replaceInstitutionFieldValuesBySource(conn, institutionId, fields, normalizedFieldValues, now);
    await insertInstitutionActionLogBySource(conn, {
      id: uuidv4(),
      institutionId,
      actionType: "INSTITUTION_CREATED",
      actionPayload: {
        after: {
          name: input.name,
          institutionTypeCode: input.institutionTypeCode,
          status: input.status,
          contractStartDate: input.contractStartDate ?? null,
          contractEndDate: input.contractEndDate ?? null,
          fields: normalizedFieldValues
        }
      },
      actedBy: input.actedBy,
      actedAt: now
    });

    const detail = await getInstitutionDetailBySource(conn, institutionId);
    if (!detail) {
      throw new Error("기관 생성 후 조회에 실패했습니다.");
    }

    if (options.afterCreate) {
      await options.afterCreate(conn, detail);
    }

    return detail;
  });
}

export async function updateInstitution(
  withTransaction: <T>(callback: (conn: PoolConnection) => Promise<T>) => Promise<T>,
  institutionId: string,
  input: UpdateInstitutionInput
): Promise<InstitutionDetail | null> {
  return withTransaction(async (conn) => {
    const before = await getInstitutionDetailBySource(conn, institutionId, true);
    if (!before) {
      return null;
    }

    const fields = await getInstitutionTypeFieldsBySource(conn, input.institutionTypeCode);
    const normalizedFieldValues = normalizeInstitutionFieldValues(fields, input.fields);
    const now = input.actedAt;

    try {
      await conn.execute(
        `UPDATE institutions
         SET name = ?,
             institution_type_code = ?,
             status = ?,
             contact_name = ?,
             contact_phone = ?,
             address_road = ?,
             address_detail = ?,
             latitude = ?,
             longitude = ?,
             memo = ?,
             contract_start_date = ?,
             contract_end_date = ?,
             updated_at = ?
         WHERE id = ?`,
        [
          input.name,
          input.institutionTypeCode,
          input.status,
          input.contactName ?? null,
          input.contactPhone ?? null,
          input.addressRoad ?? null,
          input.addressDetail ?? null,
          input.lat ?? null,
          input.lng ?? null,
          input.memo ?? null,
          input.contractStartDate ?? null,
          input.contractEndDate ?? null,
          now,
          institutionId
        ]
      );
    } catch (error) {
      const maybeError = error as { code?: string };
      if (maybeError.code === "ER_DUP_ENTRY") {
        const err = new Error("institution name already exists");
        (err as { code?: string }).code = "INSTITUTION_NAME_CONFLICT";
        throw err;
      }
      throw error;
    }

    await replaceInstitutionFieldValuesBySource(conn, institutionId, fields, normalizedFieldValues, now);

    const after = await getInstitutionDetailBySource(conn, institutionId);
    if (!after) {
      return null;
    }

    await insertInstitutionActionLogBySource(conn, {
      id: uuidv4(),
      institutionId,
      actionType: "INSTITUTION_UPDATED",
      actionPayload: {
        diff: diffRecords(before as unknown as Record<string, unknown>, after as unknown as Record<string, unknown>),
        before,
        after
      },
      actedBy: input.actedBy,
      actedAt: now
    });

    return after;
  });
}

export async function listInstitutionDeliveries(
  pool: Pool,
  institutionId: string,
  status?: "ACTIVE" | "ENDED"
): Promise<{
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
}[]> {
  const where: string[] = ["institution_id = ?"];
  const values: unknown[] = [institutionId];
  if (status === "ACTIVE") {
    where.push("retrieved_at IS NULL");
  } else if (status === "ENDED") {
    where.push("retrieved_at IS NOT NULL");
  }

  const [rows] = await pool.query<InstitutionDeliveryRow[]>(
    `SELECT
       id,
       institution_id,
       device_id,
       device_type_snapshot,
       delivered_at,
       retrieved_at,
       install_location,
       memo,
       created_at,
       updated_at,
       IF(retrieved_at IS NULL, 'ACTIVE', 'ENDED') AS status
     FROM institution_device_deliveries
     WHERE ${where.join(" AND ")}
     ORDER BY delivered_at DESC`,
    values
  );

  return rows.map(toInstitutionDeliveryRecord);
}

export async function listUnassignedDevices(
  pool: Pool,
  query?: string,
  limit = 100
): Promise<UnassignedDeviceRecord[]> {
  const where: string[] = ["active.id IS NULL"];
  const values: unknown[] = [];

  if (query?.trim()) {
    const keyword = `%${query.trim()}%`;
    where.push(
      "(d.device_id LIKE ? OR IFNULL(d.device_type, '') LIKE ? OR IFNULL(d.model_name, '') LIKE ? OR IFNULL(d.location_name, '') LIKE ?)"
    );
    values.push(keyword, keyword, keyword, keyword);
  }

  const [rows] = await pool.query<UnassignedDeviceRow[]>(
    `SELECT
       d.device_id,
       d.device_type,
       d.model_name,
       d.location_name
     FROM devices d
     LEFT JOIN institution_device_deliveries active
       ON active.device_id = d.device_id
       AND active.retrieved_at IS NULL
     WHERE ${where.join(" AND ")}
     ORDER BY d.device_id ASC
     LIMIT ?`,
    [...values, Math.max(1, Math.min(limit, 500))]
  );

  return rows.map((row) => ({
    deviceId: row.device_id,
    deviceType: parseDeviceType(row.device_type),
    modelName: row.model_name ?? undefined,
    locationName: row.location_name ?? undefined
  }));
}

export async function createInstitutionDelivery(
  withTransaction: <T>(callback: (conn: PoolConnection) => Promise<T>) => Promise<T>,
  input: CreateInstitutionDeliveryInput
): Promise<{
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
}> {
  return withTransaction(async (conn) => {
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

    const [deviceRows] = await conn.execute<RowDataPacket[]>(
      `SELECT device_id, device_type
       FROM devices
       WHERE device_id = ?
       LIMIT 1
       FOR UPDATE`,
      [input.deviceId]
    );
    if (deviceRows.length === 0) {
      const err = new Error("기기를 찾을 수 없습니다.");
      (err as { code?: string }).code = "DEVICE_NOT_FOUND";
      throw err;
    }

    const [activeRows] = await conn.execute<RowDataPacket[]>(
      `SELECT id
       FROM institution_device_deliveries
       WHERE device_id = ? AND retrieved_at IS NULL
       LIMIT 1
       FOR UPDATE`,
      [input.deviceId]
    );
    if (activeRows.length > 0) {
      const err = new Error("이미 납품중인 기기입니다.");
      (err as { code?: string }).code = "DEVICE_ALREADY_DELIVERED";
      throw err;
    }

    const deliveryId = uuidv4();
    const deviceType = parseDeviceType((deviceRows[0] as { device_type?: unknown }).device_type);

    await conn.execute(
      `INSERT INTO institution_device_deliveries (
        id, institution_id, device_id, device_type_snapshot, delivered_at, retrieved_at,
        install_location, memo, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, ?)`,
      [
        deliveryId,
        input.institutionId,
        input.deviceId,
        deviceType ?? null,
        input.deliveredAt,
        input.installLocation ?? null,
        input.memo ?? null,
        input.actedAt,
        input.actedAt
      ]
    );

    await insertInstitutionActionLogBySource(conn, {
      id: uuidv4(),
      institutionId: input.institutionId,
      deviceId: input.deviceId,
      actionType: "DELIVERY_REGISTERED",
      actionPayload: {
        deliveryId,
        deliveredAt: input.deliveredAt,
        installLocation: input.installLocation ?? null,
        memo: input.memo ?? null
      },
      actedBy: input.actedBy,
      actedAt: input.actedAt
    });

    const created = await getInstitutionDeliveryByIdFromSource(conn, deliveryId);
    if (!created) {
      throw new Error("납품 이력 생성 후 조회에 실패했습니다.");
    }
    return created;
  });
}

export async function endInstitutionDelivery(
  withTransaction: <T>(callback: (conn: PoolConnection) => Promise<T>) => Promise<T>,
  input: EndInstitutionDeliveryInput
): Promise<{
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
} | null> {
  return withTransaction(async (conn) => {
    const [rows] = await conn.execute<InstitutionDeliveryRow[]>(
      `SELECT
         id,
         institution_id,
         device_id,
         device_type_snapshot,
         delivered_at,
         retrieved_at,
         install_location,
         memo,
         created_at,
         updated_at,
         IF(retrieved_at IS NULL, 'ACTIVE', 'ENDED') AS status
       FROM institution_device_deliveries
       WHERE id = ? AND institution_id = ?
       LIMIT 1
       FOR UPDATE`,
      [input.deliveryId, input.institutionId]
    );
    const delivery = rows[0];
    if (!delivery) {
      return null;
    }
    if (delivery.retrieved_at) {
      const err = new Error("이미 종료된 납품입니다.");
      (err as { code?: string }).code = "DELIVERY_ALREADY_ENDED";
      throw err;
    }

    await conn.execute(
      `UPDATE institution_device_deliveries
       SET retrieved_at = ?, memo = ?, updated_at = ?
       WHERE id = ?`,
      [input.retrievedAt, input.memo ?? delivery.memo ?? null, input.actedAt, input.deliveryId]
    );

    await insertInstitutionActionLogBySource(conn, {
      id: uuidv4(),
      institutionId: input.institutionId,
      deviceId: delivery.device_id,
      actionType: "DELIVERY_ENDED",
      actionPayload: {
        deliveryId: input.deliveryId,
        retrievedAt: input.retrievedAt,
        memo: input.memo ?? null
      },
      actedBy: input.actedBy,
      actedAt: input.actedAt
    });

    return getInstitutionDeliveryByIdFromSource(conn, input.deliveryId);
  });
}

export async function createInstitutionActionLog(
  pool: Pool,
  input: InstitutionActionLogRecord
): Promise<void> {
  await insertInstitutionActionLogBySource(pool, input);
}

export async function listInstitutionLogs(
  pool: Pool,
  institutionId: string,
  filters: InstitutionLogFilters = {}
): Promise<InstitutionActionLogRecord[]> {
  const where: string[] = ["institution_id = ?"];
  const values: unknown[] = [institutionId];
  if (filters.actionType?.trim()) {
    where.push("action_type = ?");
    values.push(filters.actionType.trim());
  }
  if (filters.deviceId?.trim()) {
    where.push("device_id = ?");
    values.push(filters.deviceId.trim());
  }
  if (filters.from?.trim()) {
    where.push("acted_at >= ?");
    values.push(filters.from.trim());
  }
  if (filters.to?.trim()) {
    where.push("acted_at <= ?");
    values.push(filters.to.trim());
  }

  const [rows] = await pool.query<InstitutionActionLogRow[]>(
    `SELECT
       id,
       institution_id,
       device_id,
       action_type,
       action_payload_json,
       acted_by,
       acted_at
     FROM institution_action_logs
     WHERE ${where.join(" AND ")}
     ORDER BY acted_at DESC
     LIMIT ?`,
    [...values, Math.max(1, Math.min(filters.limit ?? 100, 500))]
  );
  return rows.map(toInstitutionActionLogRecord);
}

export async function listGlobalInstitutionLogs(
  pool: Pool,
  filters: InstitutionLogFilters = {}
): Promise<InstitutionActionLogRecord[]> {
  const where: string[] = [];
  const values: unknown[] = [];

  if (filters.institutionId?.trim()) {
    where.push("institution_id = ?");
    values.push(filters.institutionId.trim());
  }
  if (filters.actionType?.trim()) {
    where.push("action_type = ?");
    values.push(filters.actionType.trim());
  }
  if (filters.deviceId?.trim()) {
    where.push("device_id = ?");
    values.push(filters.deviceId.trim());
  }
  if (filters.from?.trim()) {
    where.push("acted_at >= ?");
    values.push(filters.from.trim());
  }
  if (filters.to?.trim()) {
    where.push("acted_at <= ?");
    values.push(filters.to.trim());
  }

  const whereClause = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";
  const [rows] = await pool.query<InstitutionActionLogRow[]>(
    `SELECT
       id,
       institution_id,
       device_id,
       action_type,
       action_payload_json,
       acted_by,
       acted_at
     FROM institution_action_logs
     ${whereClause}
     ORDER BY acted_at DESC
     LIMIT ?`,
    [...values, Math.max(1, Math.min(filters.limit ?? 100, 500))]
  );
  return rows.map(toInstitutionActionLogRecord);
}

async function getInstitutionTypeFieldsBySource(
  source: { execute: Pool["execute"] | PoolConnection["execute"] },
  typeCode?: InstitutionTypeCode
): Promise<InstitutionTypeFieldRecord[]> {
  const whereClause = typeCode ? "WHERE institution_type_code = ?" : "";
  const params = typeCode ? [typeCode] : [];
  const [rows] = await source.execute<InstitutionTypeFieldRow[]>(
    `SELECT
       id,
       institution_type_code,
       field_key,
       label,
       data_type,
       is_required,
       options_json,
       sort_order,
       created_at,
       updated_at
     FROM institution_type_fields
     ${whereClause}
     ORDER BY institution_type_code ASC, sort_order ASC, field_key ASC`,
    params
  );
  return rows.map(toInstitutionTypeFieldRecord);
}

async function getInstitutionDetailBySource(
  source: { execute: Pool["execute"] | PoolConnection["execute"] },
  institutionId: string,
  lockForUpdate = false
): Promise<InstitutionDetail | null> {
  const lockSuffix = lockForUpdate ? " FOR UPDATE" : "";
  const [rows] = await source.execute<InstitutionSummaryRow[]>(
    `SELECT
       i.id,
       i.name,
       i.institution_type_code,
       t.name AS institution_type_name,
       i.status,
       i.contact_name,
       i.contact_phone,
       i.address_road,
       i.address_detail,
       i.latitude,
       i.longitude,
       i.memo,
       i.contract_start_date,
       i.contract_end_date,
       i.created_at,
       i.updated_at,
       (
         SELECT COUNT(*)
         FROM institution_device_deliveries d
         WHERE d.institution_id = i.id AND d.retrieved_at IS NULL
       ) AS active_device_count
     FROM institutions i
     INNER JOIN institution_types t ON t.code = i.institution_type_code
     WHERE i.id = ?
     LIMIT 1${lockSuffix}`,
    [institutionId]
  );
  const summary = rows[0];
  if (!summary) {
    return null;
  }

  const [fieldRows] = await source.execute<InstitutionFieldValueRow[]>(
    `SELECT
       v.institution_id,
       v.institution_type_field_id,
       f.field_key,
       f.data_type,
       v.value_text,
       v.value_number,
       v.value_bool,
       v.value_date
     FROM institution_type_fields f
     LEFT JOIN institution_field_values v
       ON v.institution_type_field_id = f.id
       AND v.institution_id = ?
     WHERE f.institution_type_code = ?
     ORDER BY f.sort_order ASC, f.field_key ASC`,
    [institutionId, summary.institution_type_code]
  );

  const fields: InstitutionFieldValues = {};
  for (const row of fieldRows) {
    const field = toInstitutionFieldValue(row);
    fields[row.field_key] = field;
  }

  return {
    ...toInstitutionSummaryRecord(summary),
    fields
  };
}

async function replaceInstitutionFieldValuesBySource(
  source: { execute: Pool["execute"] | PoolConnection["execute"] },
  institutionId: string,
  fields: InstitutionTypeFieldRecord[],
  values: InstitutionFieldValues,
  now: string
): Promise<void> {
  await source.execute("DELETE FROM institution_field_values WHERE institution_id = ?", [institutionId]);

  const fieldByKey = new Map(fields.map((field) => [field.fieldKey, field]));
  for (const [fieldKey, value] of Object.entries(values)) {
    const definition = fieldByKey.get(fieldKey);
    if (!definition || value === undefined) {
      continue;
    }

    const normalized = normalizeFieldValueByType(definition.dataType, value);
    await source.execute(
      `INSERT INTO institution_field_values (
        institution_id, institution_type_field_id, value_text, value_number, value_bool, value_date, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        institutionId,
        definition.id,
        normalized.valueText,
        normalized.valueNumber,
        normalized.valueBool,
        normalized.valueDate,
        now,
        now
      ]
    );
  }
}

async function insertInstitutionActionLogBySource(
  source: { execute: Pool["execute"] | PoolConnection["execute"] },
  input: InstitutionActionLogRecord
): Promise<void> {
  await source.execute(
    `INSERT INTO institution_action_logs (
      id, institution_id, device_id, action_type, action_payload_json, acted_by, acted_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      input.id,
      input.institutionId,
      input.deviceId ?? null,
      input.actionType,
      input.actionPayload ? JSON.stringify(input.actionPayload) : null,
      input.actedBy,
      input.actedAt
    ]
  );
}

async function getInstitutionDeliveryByIdFromSource(
  source: { execute: Pool["execute"] | PoolConnection["execute"] },
  deliveryId: string
): Promise<{
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
} | null> {
  const [rows] = await source.execute<InstitutionDeliveryRow[]>(
    `SELECT
       id,
       institution_id,
       device_id,
       device_type_snapshot,
       delivered_at,
       retrieved_at,
       install_location,
       memo,
       created_at,
       updated_at,
       IF(retrieved_at IS NULL, 'ACTIVE', 'ENDED') AS status
     FROM institution_device_deliveries
     WHERE id = ?
     LIMIT 1`,
    [deliveryId]
  );
  const row = rows[0];
  return row ? toInstitutionDeliveryRecord(row) : null;
}

function toInstitutionTypeRecord(row: InstitutionTypeRow): InstitutionTypeRecord {
  return {
    code: parseInstitutionTypeCode(row.code),
    name: row.name,
    isActive: row.is_active === 1
  };
}

function toInstitutionTypeFieldRecord(row: InstitutionTypeFieldRow): InstitutionTypeFieldRecord {
  return {
    id: row.id,
    institutionTypeCode: parseInstitutionTypeCode(row.institution_type_code),
    fieldKey: row.field_key,
    label: row.label,
    dataType: parseFieldDataType(row.data_type),
    isRequired: row.is_required === 1,
    options: parseOptions(row.options_json),
    sortOrder: Number(row.sort_order ?? 0)
  };
}

function toInstitutionSummaryRecord(row: InstitutionSummaryRow): InstitutionSummary {
  return {
    id: row.id,
    name: row.name,
    institutionTypeCode: parseInstitutionTypeCode(row.institution_type_code),
    institutionTypeName: row.institution_type_name,
    status: parseInstitutionStatus(row.status),
    contactName: row.contact_name ?? undefined,
    contactPhone: row.contact_phone ?? undefined,
    addressRoad: row.address_road ?? undefined,
    addressDetail: row.address_detail ?? undefined,
    lat: typeof row.latitude === "number" ? row.latitude : undefined,
    lng: typeof row.longitude === "number" ? row.longitude : undefined,
    memo: row.memo ?? undefined,
    contractStartDate: row.contract_start_date ?? undefined,
    contractEndDate: row.contract_end_date ?? undefined,
    activeDeviceCount: Number(row.active_device_count ?? 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function toInstitutionDeliveryRecord(row: InstitutionDeliveryRow): {
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
} {
  return {
    id: row.id,
    institutionId: row.institution_id,
    deviceId: row.device_id,
    deviceTypeSnapshot: parseDeviceType(row.device_type_snapshot),
    deliveredAt: row.delivered_at,
    retrievedAt: row.retrieved_at ?? undefined,
    installLocation: row.install_location ?? undefined,
    memo: row.memo ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    status: row.status === "ENDED" ? "ENDED" : "ACTIVE"
  };
}

function toInstitutionActionLogRecord(row: InstitutionActionLogRow): InstitutionActionLogRecord {
  return {
    id: row.id,
    institutionId: row.institution_id,
    deviceId: row.device_id ?? undefined,
    actionType: row.action_type,
    actionPayload: parsePayload(row.action_payload_json),
    actedBy: row.acted_by,
    actedAt: row.acted_at
  };
}

function toInstitutionFieldValue(row: InstitutionFieldValueRow): InstitutionFieldValue {
  const dataType = parseFieldDataType(row.data_type);
  if (dataType === "NUMBER") {
    return typeof row.value_number === "number" ? row.value_number : null;
  }
  if (dataType === "BOOLEAN") {
    return typeof row.value_bool === "number" ? row.value_bool === 1 : null;
  }
  if (dataType === "DATE") {
    return row.value_date ?? null;
  }
  return row.value_text ?? null;
}

function normalizeInstitutionFieldValues(
  fields: InstitutionTypeFieldRecord[],
  values: InstitutionFieldValues
): InstitutionFieldValues {
  const fieldByKey = new Map(fields.map((field) => [field.fieldKey, field]));
  const result: InstitutionFieldValues = {};

  for (const field of fields) {
    const raw = values[field.fieldKey];
    if (raw === undefined || raw === null || raw === "") {
      if (field.isRequired) {
        const err = new Error(`필수 필드 누락: ${field.fieldKey}`);
        (err as { code?: string }).code = "INSTITUTION_FIELD_VALIDATION_FAILED";
        throw err;
      }
      continue;
    }

    if (!fieldByKey.has(field.fieldKey)) {
      continue;
    }

    if (!isValidFieldValue(field, raw)) {
      const err = new Error(`필드 형식 오류: ${field.fieldKey}`);
      (err as { code?: string }).code = "INSTITUTION_FIELD_VALIDATION_FAILED";
      throw err;
    }

    if (field.dataType === "SELECT" && field.options.length > 0) {
      const text = String(raw);
      if (!field.options.includes(text)) {
        const err = new Error(`선택 필드 값 오류: ${field.fieldKey}`);
        (err as { code?: string }).code = "INSTITUTION_FIELD_VALIDATION_FAILED";
        throw err;
      }
      result[field.fieldKey] = text;
      continue;
    }

    if (field.dataType === "NUMBER") {
      result[field.fieldKey] = Number(raw);
      continue;
    }
    if (field.dataType === "BOOLEAN") {
      result[field.fieldKey] = Boolean(raw);
      continue;
    }
    result[field.fieldKey] = String(raw);
  }

  for (const key of Object.keys(values)) {
    if (!fieldByKey.has(key)) {
      const err = new Error(`정의되지 않은 필드: ${key}`);
      (err as { code?: string }).code = "INSTITUTION_FIELD_VALIDATION_FAILED";
      throw err;
    }
  }

  return result;
}

function normalizeFieldValueByType(
  dataType: InstitutionFieldDataType,
  value: InstitutionFieldValue
): {
  valueText: string | null;
  valueNumber: number | null;
  valueBool: number | null;
  valueDate: string | null;
} {
  if (value === null || value === undefined) {
    return {
      valueText: null,
      valueNumber: null,
      valueBool: null,
      valueDate: null
    };
  }

  if (dataType === "NUMBER") {
    return {
      valueText: null,
      valueNumber: Number(value),
      valueBool: null,
      valueDate: null
    };
  }

  if (dataType === "BOOLEAN") {
    return {
      valueText: null,
      valueNumber: null,
      valueBool: value ? 1 : 0,
      valueDate: null
    };
  }

  if (dataType === "DATE") {
    return {
      valueText: null,
      valueNumber: null,
      valueBool: null,
      valueDate: String(value)
    };
  }

  return {
    valueText: String(value),
    valueNumber: null,
    valueBool: null,
    valueDate: null
  };
}

function isValidFieldValue(field: InstitutionTypeFieldRecord, value: InstitutionFieldValue): boolean {
  if (value === null || value === undefined) {
    return !field.isRequired;
  }
  switch (field.dataType) {
    case "NUMBER":
      return typeof value === "number" && Number.isFinite(value);
    case "BOOLEAN":
      return typeof value === "boolean";
    case "DATE":
      return typeof value === "string" && value.trim().length > 0;
    case "TEXT":
    case "SELECT":
      return typeof value === "string" && value.trim().length > 0;
    default:
      return false;
  }
}

function parseInstitutionTypeCode(value: unknown): InstitutionTypeCode {
  return String(value) === "PARK" ? "PARK" : "SCHOOL";
}

function parseInstitutionStatus(value: unknown): InstitutionStatus {
  const status = String(value).toUpperCase();
  if (status === "INACTIVE" || status === "PENDING") {
    return status;
  }
  return "ACTIVE";
}

function parseFieldDataType(value: unknown): InstitutionFieldDataType {
  const type = String(value).toUpperCase();
  if (type === "NUMBER" || type === "BOOLEAN" || type === "DATE" || type === "SELECT") {
    return type;
  }
  return "TEXT";
}

function parseDeviceType(value: unknown): DeviceType | undefined {
  if (value === "시스트파크" || value === "시스트런") {
    return value;
  }
  return undefined;
}

function parseOptions(value: unknown): string[] {
  if (!value) {
    return [];
  }
  if (Array.isArray(value)) {
    return value.map((item) => String(item));
  }
  if (Buffer.isBuffer(value)) {
    return parseOptions(value.toString("utf-8"));
  }
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed.map((item) => String(item));
      }
    } catch {
      return [];
    }
  }
  return [];
}

function diffRecords(
  before: Record<string, unknown>,
  after: Record<string, unknown>
): Record<string, { before: unknown; after: unknown }> {
  const result: Record<string, { before: unknown; after: unknown }> = {};
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const key of keys) {
    const beforeValue = before[key];
    const afterValue = after[key];
    if (JSON.stringify(beforeValue) === JSON.stringify(afterValue)) {
      continue;
    }
    result[key] = {
      before: beforeValue,
      after: afterValue
    };
  }
  return result;
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
