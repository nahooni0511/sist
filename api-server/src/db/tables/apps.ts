import { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { AppEntry, AppRelease } from "../types.js";

export const APPS_SCHEMA_STATEMENTS = [
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

export async function getApps(pool: Pool): Promise<AppEntry[]> {
  const [appRows] = await pool.query<AppRow[]>(
    `SELECT app_id, package_name, display_name, created_at, updated_at
     FROM apps
     ORDER BY display_name ASC`
  );

  const [releaseRows] = await pool.query<ReleaseRow[]>(
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

export async function getAppById(pool: Pool, appId: string): Promise<AppEntry | null> {
  const [appRows] = await pool.execute<AppRow[]>(
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

  const [releaseRows] = await pool.execute<ReleaseRow[]>(
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

export async function saveRelease(
  withTransaction: <T>(callback: (conn: PoolConnection) => Promise<T>) => Promise<T>,
  release: AppRelease,
  appUpdatedAt: string
): Promise<void> {
  await withTransaction(async (conn) => {
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

export async function updateApp(
  pool: Pool,
  appId: string,
  payload: { displayName?: string; packageName?: string }
): Promise<boolean> {
  const now = new Date().toISOString();
  const [result] = await pool.execute<ResultSetHeader>(
    `UPDATE apps
     SET display_name = COALESCE(?, display_name),
         package_name = COALESCE(?, package_name),
         updated_at = ?
     WHERE app_id = ?`,
    [payload.displayName ?? null, payload.packageName ?? null, now, appId]
  );
  return result.affectedRows > 0;
}

export async function getLatestReleases(pool: Pool): Promise<AppRelease[]> {
  const [rows] = await pool.query<ReleaseRow[]>(
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
