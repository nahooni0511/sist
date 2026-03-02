const DEFAULT_PORT = 12000;

export type AppConfig = {
  server: {
    port: number;
    baseUrl: string;
  };
  admin: {
    accessTokenTtlMs: number;
    refreshTokenTtlMs: number;
  };
  mysql: {
    host: string;
    port: number;
    username: string;
    password: string;
    database: string;
    connectionLimit: number;
  };
  minio: {
    host: string;
    accessKey: string;
    secretKey: string;
    bucketName: string;
  };
  redis: {
    url: string;
    username?: string;
    password?: string;
  };
};

function parseEnvString(name: string, fallback: string): string {
  const raw = process.env[name];
  if (!raw || !raw.trim()) {
    return fallback;
  }
  return raw.trim();
}

function parseEnvNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseEnvOptionalString(name: string): string | undefined {
  const raw = process.env[name];
  if (!raw || !raw.trim()) {
    return undefined;
  }
  return raw.trim();
}

function parseEnvPositiveInt(name: string, fallback: number): number {
  const parsed = Math.floor(parseEnvNumber(name, fallback));
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function sanitizeBaseUrl(raw: string, fallbackPort: number): string {
  const normalized = raw.trim().replace(/\/+$/g, "");
  if (!normalized) {
    return `http://localhost:${fallbackPort}`;
  }
  return normalized;
}

export function loadConfig(): AppConfig {
  const port = parseEnvPositiveInt("PORT", DEFAULT_PORT);
  const accessTokenMinutes = parseEnvPositiveInt("ADMIN_ACCESS_TOKEN_TTL_MINUTES", 30);
  const refreshTokenDays = parseEnvPositiveInt("ADMIN_REFRESH_TOKEN_TTL_DAYS", 7);

  return {
    server: {
      port,
      baseUrl: sanitizeBaseUrl(
        parseEnvString("PUBLIC_BASE_URL", `http://localhost:${port}`),
        port
      )
    },
    admin: {
      accessTokenTtlMs: accessTokenMinutes * 60_000,
      refreshTokenTtlMs: refreshTokenDays * 24 * 60 * 60_000
    },
    mysql: {
      host: parseEnvString("MYSQL_HOST", "127.0.0.1"),
      port: parseEnvPositiveInt("MYSQL_PORT", 3306),
      username: parseEnvString("MYSQL_USERNAME", process.env.MYSQL_USER ?? "root"),
      password: process.env.MYSQL_PASSWORD ?? "",
      database: parseEnvString("MYSQL_DATABASE", "sistrun_hub"),
      connectionLimit: parseEnvPositiveInt("MYSQL_CONNECTION_LIMIT", 10)
    },
    minio: {
      host: parseEnvString("MINIO_HOST", "127.0.0.1:9000"),
      accessKey: parseEnvString("MINIO_ACCESS_KEY", "minioadmin"),
      secretKey: parseEnvString("MINIO_SECRET_KEY", "minioadmin"),
      bucketName: parseEnvString("MINIO_BUCKET_NAME", "sistrun-apks")
    },
    redis: {
      url: parseEnvString("REDIS_URL", "redis://127.0.0.1:6379"),
      username: parseEnvOptionalString("REDIS_USERNAME"),
      password: parseEnvOptionalString("REDIS_PASSWORD")
    }
  };
}
