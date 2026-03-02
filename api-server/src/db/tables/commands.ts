import { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { CommandRecord, CommandStatus, CommandType } from "../types.js";

export const COMMANDS_SCHEMA_STATEMENTS = [
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
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
];

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

export async function createCommand(
  withTransaction: <T>(callback: (conn: PoolConnection) => Promise<T>) => Promise<T>,
  command: CommandRecord
): Promise<void> {
  await withTransaction(async (conn) => {
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

export async function listCommands(
  pool: Pool,
  filters: {
    deviceId?: string;
    status?: CommandStatus;
    limit?: number;
  }
): Promise<CommandRecord[]> {
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
  const limitValue =
    typeof filters.limit === "number" && Number.isFinite(filters.limit)
      ? Math.max(1, Math.floor(filters.limit))
      : undefined;

  const limitClause = limitValue ? "LIMIT ?" : "";
  if (limitValue) {
    values.push(limitValue);
  }

  const [rows] = await pool.query<CommandRow[]>(
    `SELECT id, device_id, type, payload, status, created_at, updated_at,
            started_at, finished_at, result_message, result_code
     FROM commands
     ${whereClause}
     ORDER BY created_at DESC
     ${limitClause}`,
    values
  );

  return rows.map(toCommandRecord);
}

export async function pullPendingCommands(
  withTransaction: <T>(callback: (conn: PoolConnection) => Promise<T>) => Promise<T>,
  deviceId: string,
  max: number,
  startedAt: string
): Promise<CommandRecord[]> {
  return withTransaction(async (conn) => {
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

export async function updateCommandResult(
  pool: Pool,
  params: {
    deviceId: string;
    commandId: string;
    status: CommandStatus;
    resultMessage?: string;
    resultCode?: number;
    updatedAt: string;
  }
): Promise<CommandRecord | null> {
  const finishedAt = params.status === "SUCCESS" || params.status === "FAILED" ? params.updatedAt : null;

  const [result] = await pool.execute<ResultSetHeader>(
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

  const [rows] = await pool.execute<CommandRow[]>(
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
