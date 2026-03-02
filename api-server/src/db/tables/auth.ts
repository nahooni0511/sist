import { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { v4 as uuidv4 } from "uuid";
import bcrypt from "bcryptjs";
import { AuthUserRecord, CreateAuthUserInput, UserRole } from "../types.js";

const PASSWORD_HASH_ROUNDS = 10;

export const AUTH_SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS auth_users (
    id CHAR(36) NOT NULL,
    login_id VARCHAR(120) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL,
    institution_id CHAR(36) NULL,
    must_reset_password TINYINT(1) NOT NULL DEFAULT 0,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    last_login_at VARCHAR(30) NULL,
    created_at VARCHAR(30) NOT NULL,
    updated_at VARCHAR(30) NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_auth_users_login_id (login_id),
    KEY idx_auth_users_role (role),
    KEY idx_auth_users_institution (institution_id),
    CONSTRAINT fk_auth_users_institution FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
];

type AuthUserRow = RowDataPacket & {
  id: string;
  login_id: string;
  password_hash: string;
  role: string;
  institution_id: string | null;
  must_reset_password: number;
  is_active: number;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
};

type SqlSource = {
  execute: Pool["execute"] | PoolConnection["execute"];
};

export async function createAuthUser(
  withTransaction: <T>(callback: (conn: PoolConnection) => Promise<T>) => Promise<T>,
  input: CreateAuthUserInput,
  now: string
): Promise<AuthUserRecord> {
  return withTransaction(async (conn) => createAuthUserBySource(conn, input, now));
}

export async function createAuthUserBySource(
  source: SqlSource,
  input: CreateAuthUserInput,
  now: string
): Promise<AuthUserRecord> {
  const normalizedLoginId = input.loginId.trim();
  const id = uuidv4();
  const passwordHash = await hashPassword(input.password);
  const role = parseUserRole(input.role);

  try {
    await source.execute(
      `INSERT INTO auth_users (
        id, login_id, password_hash, role, institution_id,
        must_reset_password, is_active, last_login_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
      [
        id,
        normalizedLoginId,
        passwordHash,
        role,
        input.institutionId ?? null,
        input.mustResetPassword ? 1 : 0,
        input.isActive === false ? 0 : 1,
        now,
        now
      ]
    );
  } catch (error) {
    const maybeError = error as { code?: string };
    if (maybeError.code === "ER_DUP_ENTRY") {
      const err = new Error("login_id already exists");
      (err as { code?: string }).code = "AUTH_LOGIN_ID_CONFLICT";
      throw err;
    }
    throw error;
  }

  const user = await getAuthUserByLoginIdFromSource(source, normalizedLoginId);
  if (!user) {
    throw new Error("사용자 생성 후 조회에 실패했습니다.");
  }
  return user;
}

export async function getAuthUserById(pool: Pool, userId: string): Promise<AuthUserRecord | null> {
  const [rows] = await pool.execute<AuthUserRow[]>(
    `SELECT
       id, login_id, password_hash, role, institution_id,
       must_reset_password, is_active, last_login_at, created_at, updated_at
     FROM auth_users
     WHERE id = ?
     LIMIT 1`,
    [userId]
  );
  const row = rows[0];
  return row ? toAuthUserRecord(row) : null;
}

export async function authenticateAuthUser(
  pool: Pool,
  loginId: string,
  password: string
): Promise<AuthUserRecord | null> {
  const normalizedLoginId = loginId.trim();
  if (!normalizedLoginId) {
    return null;
  }

  const [rows] = await pool.execute<AuthUserRow[]>(
    `SELECT
       id, login_id, password_hash, role, institution_id,
       must_reset_password, is_active, last_login_at, created_at, updated_at
     FROM auth_users
     WHERE login_id = ?
       AND is_active = 1
     LIMIT 1`,
    [normalizedLoginId]
  );
  const row = rows[0];
  if (!row) {
    return null;
  }

  const matched = await bcrypt.compare(password, row.password_hash);
  if (!matched) {
    return null;
  }

  return toAuthUserRecord(row);
}

export async function markAuthUserLoggedIn(
  pool: Pool,
  userId: string,
  loggedInAt: string
): Promise<void> {
  await pool.execute<ResultSetHeader>(
    `UPDATE auth_users
     SET last_login_at = ?, updated_at = ?
     WHERE id = ?`,
    [loggedInAt, loggedInAt, userId]
  );
}

export async function updateAuthUserPassword(
  withTransaction: <T>(callback: (conn: PoolConnection) => Promise<T>) => Promise<T>,
  input: {
    userId: string;
    newPassword: string;
    mustResetPassword: boolean;
    updatedAt: string;
  }
): Promise<void> {
  const passwordHash = await hashPassword(input.newPassword);
  await withTransaction(async (conn) => {
    const [result] = await conn.execute<ResultSetHeader>(
      `UPDATE auth_users
       SET password_hash = ?,
           must_reset_password = ?,
           updated_at = ?
       WHERE id = ?
         AND is_active = 1`,
      [passwordHash, input.mustResetPassword ? 1 : 0, input.updatedAt, input.userId]
    );
    if (result.affectedRows === 0) {
      const err = new Error("사용자를 찾을 수 없습니다.");
      (err as { code?: string }).code = "AUTH_USER_NOT_FOUND";
      throw err;
    }
  });
}

async function getAuthUserByLoginIdFromSource(
  source: SqlSource,
  loginId: string
): Promise<AuthUserRecord | null> {
  const [rows] = await source.execute<AuthUserRow[]>(
    `SELECT
       id, login_id, password_hash, role, institution_id,
       must_reset_password, is_active, last_login_at, created_at, updated_at
     FROM auth_users
     WHERE login_id = ?
     LIMIT 1`,
    [loginId]
  );
  const row = rows[0];
  return row ? toAuthUserRecord(row) : null;
}

function toAuthUserRecord(row: AuthUserRow): AuthUserRecord {
  return {
    id: row.id,
    loginId: row.login_id,
    role: parseUserRole(row.role),
    institutionId: row.institution_id ?? undefined,
    mustResetPassword: row.must_reset_password === 1,
    isActive: row.is_active === 1,
    lastLoginAt: row.last_login_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, PASSWORD_HASH_ROUNDS);
}

function parseUserRole(raw: unknown): UserRole {
  const role = String(raw ?? "").toUpperCase();
  if (role === "SCHOOL_ADMIN" || role === "PARK_ADMIN") {
    return role;
  }
  return "SUPER_ADMIN";
}
