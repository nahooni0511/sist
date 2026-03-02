import { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";

export const SETTINGS_SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS settings (
    setting_key VARCHAR(100) NOT NULL,
    setting_value TEXT NOT NULL,
    PRIMARY KEY (setting_key)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
];

export const DEFAULT_SETTINGS: Record<string, string> = {
  API_BASE_URL: "http://10.0.2.2:12000",
  AI_BOX_IP: "192.168.0.10"
};

type SettingRow = RowDataPacket & {
  setting_key: string;
  setting_value: string;
};

export async function seedDefaultSettings(pool: Pool): Promise<void> {
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    await pool.execute(
      "INSERT IGNORE INTO settings (setting_key, setting_value) VALUES (?, ?)",
      [key, value]
    );
  }
}

export async function getSettings(pool: Pool): Promise<Record<string, string>> {
  const [rows] = await pool.query<SettingRow[]>(
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

export async function replaceSettings(
  withTransaction: <T>(callback: (conn: PoolConnection) => Promise<T>) => Promise<T>,
  settings: Record<string, string>
): Promise<void> {
  await withTransaction(async (conn) => {
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
