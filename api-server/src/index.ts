import "dotenv/config";
import cors from "cors";
import express, { NextFunction, Request, Response } from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";
import multer from "multer";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import {
  AppEntry,
  AppRelease,
  CommandRecord,
  CommandStatus,
  CommandType,
  CreateDeviceInput,
  DeviceRecord,
  MySqlDb,
  StoreDevicePackageVersion,
  StoreDeviceSyncInput,
  StoreUpdateEventStatus
} from "./db.js";
import { MinioObjectStorage } from "./object-storage.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const storageDir = path.join(rootDir, "storage");
const tmpDir = path.join(storageDir, "tmp");

fs.mkdirSync(tmpDir, { recursive: true });

const app = express();
const port = parseEnvNumber("PORT", 4000);
const baseUrl = process.env.PUBLIC_BASE_URL ?? `http://localhost:${port}`;
const hardcodedAdminId = "sist-admin";
const hardcodedAdminPassword = "SistSist11@";
const accessTokenTtlMs = parseEnvNumber("ADMIN_ACCESS_TOKEN_TTL_MINUTES", 30) * 60_000;
const refreshTokenTtlMs = parseEnvNumber("ADMIN_REFRESH_TOKEN_TTL_DAYS", 7) * 24 * 60 * 60_000;

type AdminAuthSession = {
  sessionId: string;
  userId: string;
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAtMs: number;
  refreshTokenExpiresAtMs: number;
};

const sessionsByAccessToken = new Map<string, AdminAuthSession>();
const sessionsByRefreshToken = new Map<string, AdminAuthSession>();

const db = new MySqlDb({
  host: process.env.MYSQL_HOST ?? "127.0.0.1",
  port: parseEnvNumber("MYSQL_PORT", 3306),
  username: process.env.MYSQL_USERNAME ?? process.env.MYSQL_USER ?? "root",
  password: process.env.MYSQL_PASSWORD ?? "",
  database: process.env.MYSQL_DATABASE ?? "sistrun_hub",
  connectionLimit: parseEnvNumber("MYSQL_CONNECTION_LIMIT", 10)
});

const objectStorage = new MinioObjectStorage({
  host: process.env.MINIO_HOST ?? "127.0.0.1:9000",
  accessKey: process.env.MINIO_ACCESS_KEY ?? "minioadmin",
  secretKey: process.env.MINIO_SECRET_KEY ?? "minioadmin",
  bucketName: process.env.MINIO_BUCKET_NAME ?? "sistrun-apks"
});

app.use(cors());
app.use(express.json({ limit: "5mb" }));

const upload = multer({ dest: tmpDir });

const uploadSchema = z.object({
  appId: z.string().min(2),
  packageName: z.string().min(3),
  displayName: z.string().min(1),
  versionName: z.string().min(1),
  versionCode: z.coerce.number().int().positive(),
  changelog: z.string().optional().default(""),
  autoUpdate: z
    .string()
    .optional()
    .transform((value) => value === "true")
});

const settingsSchema = z.record(z.string(), z.string());

const checkUpdatesSchema = z.object({
  deviceId: z.string().min(1),
  packages: z
    .array(
      z.object({
        packageName: z.string().min(1),
        versionCode: z.number().int().nonnegative()
      })
    )
    .default([])
});

const createCommandSchema = z.object({
  deviceId: z.string().min(1),
  type: z.enum(["INSTALL_APP", "UPDATE_APP", "REBOOT", "APPLY_POLICY"]),
  payload: z.record(z.string(), z.unknown()).default({})
});

const pullCommandsSchema = z.object({
  max: z.number().int().positive().max(20).optional().default(5)
});

const commandResultSchema = z.object({
  status: z.enum(["RUNNING", "SUCCESS", "FAILED"]),
  resultMessage: z.string().optional(),
  resultCode: z.number().int().optional()
});

const deviceTypeValues = ["시스트파크", "시스트런"] as const;

const adminDeviceListQuerySchema = z.object({
  query: z.string().optional()
});

const adminNextDeviceQuerySchema = z.object({
  deviceType: z.enum(deviceTypeValues)
});

const adminCreateDeviceSchema = z.object({
  deviceType: z.enum(deviceTypeValues),
  modelName: z.string().min(1),
  location: z.object({
    name: z.string().min(1),
    lat: z.coerce.number().min(-90).max(90),
    lng: z.coerce.number().min(-180).max(180)
  })
});

const adminLoginSchema = z.object({
  id: z.string().min(1),
  password: z.string().min(1)
});

const adminRefreshSchema = z.object({
  refreshToken: z.string().min(1)
});

const adminApkListQuerySchema = z.object({
  query: z.string().optional(),
  packageName: z.string().optional(),
  latestOnly: z
    .union([z.boolean(), z.string()])
    .optional()
    .transform((value) => {
      if (typeof value === "boolean") {
        return value;
      }
      if (typeof value === "string") {
        return value.toLowerCase() === "true";
      }
      return false;
    })
});

const adminApkUploadSchema = z.object({
  appId: z.string().optional(),
  packageName: z.string().optional(),
  displayName: z.string().optional(),
  versionName: z.string().optional(),
  versionCode: z.coerce.number().int().positive().optional(),
  releaseNote: z.string().optional(),
  changelog: z.string().optional(),
  autoUpdate: z
    .union([z.boolean(), z.string()])
    .optional()
    .transform((value) => {
      if (typeof value === "boolean") {
        return value;
      }
      if (typeof value === "string") {
        return value.toLowerCase() === "true";
      }
      return false;
    })
});

const storeSyncSchema = z.object({
  deviceId: z.string().min(1),
  deviceName: z.string().optional(),
  modelName: z.string().optional(),
  platform: z.string().optional(),
  osVersion: z.string().optional(),
  appStoreVersion: z.string().optional(),
  ipAddress: z.string().optional(),
  packages: z
    .array(
      z.object({
        packageName: z.string().min(1),
        versionCode: z.number().int().nonnegative(),
        versionName: z.string().optional()
      })
    )
    .default([])
});

const storeEventTypeValues = [
  "CHECK_UPDATES",
  "DOWNLOAD_STARTED",
  "DOWNLOAD_FINISHED",
  "INSTALL_REQUESTED",
  "INSTALL_SUCCESS",
  "INSTALL_FAILED",
  "SYNC_COMPLETED"
] as const;

const storeEventSchema = z.object({
  packageName: z.string().min(1),
  appId: z.string().optional(),
  releaseId: z.string().optional(),
  targetVersionName: z.string().optional(),
  targetVersionCode: z.number().int().nonnegative().optional(),
  eventType: z.enum(storeEventTypeValues),
  status: z.enum(["INFO", "SUCCESS", "FAILED"]).default("INFO"),
  message: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional()
});

const adminStoreDeviceListQuerySchema = z.object({
  query: z.string().optional()
});

const adminStoreEventListQuerySchema = z.object({
  deviceId: z.string().optional(),
  packageName: z.string().optional(),
  limit: z.coerce.number().int().positive().max(500).optional().default(100)
});

function issueAdminToken(prefix: "atk" | "rtk"): string {
  return `${prefix}_${crypto.randomBytes(32).toString("hex")}`;
}

function sessionToResponse(session: AdminAuthSession) {
  return {
    accessToken: session.accessToken,
    accessTokenExpiresAt: new Date(session.accessTokenExpiresAtMs).toISOString(),
    refreshToken: session.refreshToken,
    refreshTokenExpiresAt: new Date(session.refreshTokenExpiresAtMs).toISOString()
  };
}

function revokeSession(session: AdminAuthSession): void {
  sessionsByAccessToken.delete(session.accessToken);
  sessionsByRefreshToken.delete(session.refreshToken);
}

function cleanupExpiredSessions(nowMs = Date.now()): void {
  for (const session of Array.from(sessionsByRefreshToken.values())) {
    if (session.refreshTokenExpiresAtMs <= nowMs) {
      revokeSession(session);
      continue;
    }
    if (session.accessTokenExpiresAtMs <= nowMs) {
      sessionsByAccessToken.delete(session.accessToken);
    }
  }
}

function issueSession(userId: string): AdminAuthSession {
  const nowMs = Date.now();
  const session: AdminAuthSession = {
    sessionId: uuidv4(),
    userId,
    accessToken: issueAdminToken("atk"),
    refreshToken: issueAdminToken("rtk"),
    accessTokenExpiresAtMs: nowMs + Math.max(1, accessTokenTtlMs),
    refreshTokenExpiresAtMs: nowMs + Math.max(1, refreshTokenTtlMs)
  };

  sessionsByAccessToken.set(session.accessToken, session);
  sessionsByRefreshToken.set(session.refreshToken, session);
  return session;
}

function requireAdmin(req: Request, res: Response): boolean {
  cleanupExpiredSessions();
  const token = req.header("x-admin-token")?.trim();
  if (!token) {
    res.status(401).json({ message: "Unauthorized" });
    return false;
  }

  const session = sessionsByAccessToken.get(token);
  if (!session) {
    res.status(401).json({ message: "Unauthorized" });
    return false;
  }

  if (session.accessTokenExpiresAtMs <= Date.now()) {
    sessionsByAccessToken.delete(session.accessToken);
    res.status(401).json({ message: "Access token expired" });
    return false;
  }

  return true;
}

function parseEnvNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

type AsyncRouteHandler = (req: Request, res: Response, next: NextFunction) => Promise<void>;

function asyncHandler(handler: AsyncRouteHandler) {
  return (req: Request, res: Response, next: NextFunction): void => {
    void handler(req, res, next).catch(next);
  };
}

function toLatestAppView(entry: AppEntry) {
  const latest = [...entry.releases].sort((a, b) => b.versionCode - a.versionCode)[0];
  if (!latest) {
    return null;
  }
  return {
    appId: entry.appId,
    packageName: entry.packageName,
    displayName: entry.displayName,
    latestRelease: {
      id: latest.id,
      versionName: latest.versionName,
      versionCode: latest.versionCode,
      changelog: latest.changelog,
      autoUpdate: latest.autoUpdate,
      uploadedAt: latest.uploadedAt,
      fileSize: latest.fileSize,
      sha256: latest.sha256 ?? "",
      downloadUrl: buildDownloadUrl(latest.fileName)
    }
  };
}

function toReleaseView(release: AppRelease) {
  return {
    ...release,
    sha256: release.sha256 ?? "",
    downloadUrl: buildDownloadUrl(release.fileName)
  };
}

function toAdminApkItem(entry: AppEntry, release: AppRelease) {
  return {
    id: release.id,
    appId: entry.appId,
    packageName: release.packageName || entry.packageName,
    versionName: release.versionName,
    versionCode: release.versionCode,
    releaseNote: release.changelog,
    sha256: release.sha256 ?? "",
    fileSize: release.fileSize,
    uploadedAt: release.uploadedAt,
    downloadUrl: buildDownloadUrl(release.fileName)
  };
}

function toAdminApkItemFromRelease(release: AppRelease) {
  return {
    id: release.id,
    appId: release.appId,
    packageName: release.packageName,
    versionName: release.versionName,
    versionCode: release.versionCode,
    releaseNote: release.changelog,
    sha256: release.sha256 ?? "",
    fileSize: release.fileSize,
    uploadedAt: release.uploadedAt,
    downloadUrl: buildDownloadUrl(release.fileName)
  };
}

function toStoreUpdateView(release: AppRelease, installedVersionCode: number) {
  return {
    appId: release.appId,
    releaseId: release.id,
    displayName: release.displayName,
    packageName: release.packageName,
    installedVersionCode,
    targetVersionCode: release.versionCode,
    targetVersionName: release.versionName,
    changelog: release.changelog,
    sha256: release.sha256 ?? "",
    fileSize: release.fileSize,
    uploadedAt: release.uploadedAt,
    autoUpdate: release.autoUpdate,
    downloadUrl: buildDownloadUrl(release.fileName)
  };
}

function findAppEntryByIdOrPackage(entries: AppEntry[], appIdOrPackageName: string): AppEntry | null {
  const normalized = appIdOrPackageName.trim();
  if (!normalized) {
    return null;
  }
  const byAppId = entries.find((entry) => entry.appId === normalized);
  if (byAppId) {
    return byAppId;
  }
  return entries.find((entry) => entry.packageName === normalized) ?? null;
}

function derivePackageNameFromFileName(fileName: string): string {
  const raw = fileName.replace(/\.apk$/i, "").trim();
  const cleaned = raw
    .replace(/\s+/g, ".")
    .replace(/[^a-zA-Z0-9_.-]/g, "")
    .replace(/\.+/g, ".")
    .replace(/^\.+|\.+$/g, "")
    .toLowerCase();

  if (cleaned.length >= 3 && cleaned.includes(".")) {
    return cleaned;
  }

  const fallback = cleaned || `uploaded.${Date.now()}`;
  return `app.${fallback.replace(/[^a-z0-9.-]/g, "").replace(/\.+/g, ".")}`;
}

function deriveAppIdFromPackageName(packageName: string): string {
  const normalized = packageName
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "-")
    .replace(/[.]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || `app-${Date.now()}`;
}

type UploadInput = {
  appId: string;
  packageName: string;
  displayName: string;
  versionName: string;
  versionCode: number;
  changelog: string;
  autoUpdate: boolean;
};

async function persistUploadedRelease(file: Express.Multer.File, payload: UploadInput) {
  const ext = path.extname(file.originalname).toLowerCase() || ".apk";
  const safeFileName = `${payload.appId}-${payload.versionCode}-${Date.now()}${ext}`;
  const fileBuffer = fs.readFileSync(file.path);
  const sha256 = crypto.createHash("sha256").update(fileBuffer).digest("hex");
  const now = nowIso();

  const release: AppRelease = {
    id: uuidv4(),
    appId: payload.appId,
    packageName: payload.packageName,
    displayName: payload.displayName,
    versionName: payload.versionName,
    versionCode: payload.versionCode,
    changelog: payload.changelog,
    autoUpdate: payload.autoUpdate,
    fileName: safeFileName,
    sha256,
    fileSize: file.size,
    uploadedAt: now
  };

  try {
    await objectStorage.uploadFile({
      objectName: safeFileName,
      localPath: file.path,
      contentType: file.mimetype || "application/vnd.android.package-archive"
    });
    await db.saveRelease(release, now);
  } catch (error) {
    try {
      await objectStorage.removeObject(safeFileName);
    } catch {
      // ignore cleanup error
    }
    throw error;
  } finally {
    try {
      fs.unlinkSync(file.path);
    } catch {
      // ignore cleanup error
    }
  }

  return release;
}

function toAdminDeviceView(device: DeviceRecord) {
  const lastSeenRaw = device.lastSeenAt ?? "";
  const seenMs = Date.parse(lastSeenRaw);

  let status: "online" | "offline" | "unknown" = "unknown";
  if (Number.isFinite(seenMs)) {
    status = Date.now() - seenMs < 5 * 60_000 ? "online" : "offline";
  }

  return {
    deviceId: device.deviceId,
    deviceName: device.deviceId,
    deviceType: device.deviceType ?? undefined,
    model: device.modelName ?? undefined,
    status,
    lastSeen: Number.isFinite(seenMs) ? new Date(seenMs).toISOString() : undefined,
    locationName: device.locationName ?? undefined,
    lat: device.lat ?? undefined,
    lng: device.lng ?? undefined,
    modules: device.modules.map((module) => ({
      name: module.name,
      portNumber: module.portNumber
    })),
    installedApps: device.installedApps.map((app) => ({
      packageName: app.packageName,
      versionCode: app.versionCode
    }))
  };
}

function nowIso(): string {
  return new Date().toISOString();
}

function parseCommandStatus(raw: string): CommandStatus | undefined {
  if (raw === "PENDING" || raw === "RUNNING" || raw === "SUCCESS" || raw === "FAILED") {
    return raw;
  }
  return undefined;
}

function routeParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }
  return value ?? "";
}

function resolveClientIp(req: Request): string {
  const forwardedRaw = req.header("x-forwarded-for") ?? "";
  const forwarded = forwardedRaw
    .split(",")
    .map((token) => token.trim())
    .find((token) => token.length > 0);

  return forwarded ?? req.ip ?? req.socket.remoteAddress ?? "";
}

function buildDownloadUrl(fileName: string): string {
  return `${baseUrl}/api/files/${encodeURIComponent(fileName)}/download`;
}

function isObjectNotFound(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const maybeError = error as {
    code?: string;
    statusCode?: number;
    message?: string;
  };

  return (
    maybeError.code === "NotFound" ||
    maybeError.code === "NoSuchKey" ||
    maybeError.statusCode === 404 ||
    maybeError.message?.includes("Not Found") === true
  );
}

const proxyDownloadHandler = asyncHandler(async (req, res) => {
  const fileName = routeParam(req.params.fileName);
  if (!fileName) {
    res.status(400).json({ message: "fileName 파라미터가 필요합니다." });
    return;
  }

  let stat;
  try {
    stat = await objectStorage.statObject(fileName);
  } catch (error) {
    if (isObjectNotFound(error)) {
      res.status(404).json({ message: "File not found" });
      return;
    }
    throw error;
  }

  const objectStream = await objectStorage.getObject(fileName);
  const contentType = stat.contentType || "application/octet-stream";
  const safeName = path.basename(fileName).replace(/"/g, "");

  res.setHeader("Content-Type", contentType);
  if (typeof stat.size === "number") {
    res.setHeader("Content-Length", String(stat.size));
  }
  if (stat.etag) {
    res.setHeader("ETag", stat.etag);
  }
  if (stat.lastModified) {
    res.setHeader("Last-Modified", stat.lastModified.toUTCString());
  }
  res.setHeader("Content-Disposition", `attachment; filename="${safeName}"`);

  objectStream.on("error", (error) => {
    if (!res.headersSent) {
      res.status(500).json({ message: "다운로드 중 오류가 발생했습니다." });
      return;
    }
    res.destroy(error as Error);
  });

  objectStream.pipe(res);
});

app.get("/health", (_req, res) => {
  res.json({ ok: true, timestamp: nowIso() });
});

app.post(
  "/api/admin/login",
  asyncHandler(async (req, res) => {
    cleanupExpiredSessions();

    const parsed = adminLoginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: "입력값이 올바르지 않습니다.", issues: parsed.error.issues });
      return;
    }

    const { id, password } = parsed.data;
    if (id !== hardcodedAdminId || password !== hardcodedAdminPassword) {
      res.status(401).json({ message: "아이디 또는 비밀번호가 올바르지 않습니다." });
      return;
    }

    const session = issueSession(id);
    res.json(sessionToResponse(session));
  })
);

app.post(
  "/api/admin/refresh",
  asyncHandler(async (req, res) => {
    cleanupExpiredSessions();

    const parsed = adminRefreshSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: "입력값이 올바르지 않습니다.", issues: parsed.error.issues });
      return;
    }

    const refreshToken = parsed.data.refreshToken.trim();
    const session = sessionsByRefreshToken.get(refreshToken);
    if (!session) {
      res.status(401).json({ message: "Refresh token이 유효하지 않습니다." });
      return;
    }

    if (session.refreshTokenExpiresAtMs <= Date.now()) {
      revokeSession(session);
      res.status(401).json({ message: "Refresh token이 만료되었습니다." });
      return;
    }

    revokeSession(session);
    const nextSession = issueSession(session.userId);
    res.json(sessionToResponse(nextSession));
  })
);

app.get(
  "/admin/devices",
  asyncHandler(async (req, res) => {
    if (!requireAdmin(req, res)) {
      return;
    }

    const parsed = adminDeviceListQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ message: "입력값이 올바르지 않습니다.", issues: parsed.error.issues });
      return;
    }

    const devices = await db.listDevices(parsed.data.query);
    res.json({
      devices: devices.map(toAdminDeviceView)
    });
  })
);

app.post(
  "/admin/devices",
  asyncHandler(async (req, res) => {
    if (!requireAdmin(req, res)) {
      return;
    }

    const parsed = adminCreateDeviceSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: "입력값이 올바르지 않습니다.", issues: parsed.error.issues });
      return;
    }

    const payload: CreateDeviceInput = {
      deviceType: parsed.data.deviceType,
      modelName: parsed.data.modelName,
      locationName: parsed.data.location.name,
      lat: parsed.data.location.lat,
      lng: parsed.data.location.lng
    };

    const createdDeviceId = await db.createDevice(payload);

    const device = await db.getDeviceById(createdDeviceId);
    if (!device) {
      res.status(500).json({ message: "기기 생성 후 조회에 실패했습니다." });
      return;
    }

    res.status(201).json({ device: toAdminDeviceView(device) });
  })
);

app.get(
  "/admin/devices/next-id",
  asyncHandler(async (req, res) => {
    if (!requireAdmin(req, res)) {
      return;
    }

    const parsed = adminNextDeviceQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ message: "입력값이 올바르지 않습니다.", issues: parsed.error.issues });
      return;
    }

    const preview = await db.previewNextDevice(parsed.data.deviceType);
    res.json(preview);
  })
);

app.get(
  "/admin/devices/:deviceId",
  asyncHandler(async (req, res) => {
    if (!requireAdmin(req, res)) {
      return;
    }

    const deviceId = routeParam(req.params.deviceId);
    const device = await db.getDeviceById(deviceId);
    if (!device) {
      res.status(404).json({ message: "Device not found" });
      return;
    }

    res.json({ device: toAdminDeviceView(device) });
  })
);

app.get(
  "/admin/apks",
  asyncHandler(async (req, res) => {
    if (!requireAdmin(req, res)) {
      return;
    }

    const parsed = adminApkListQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ message: "입력값이 올바르지 않습니다.", issues: parsed.error.issues });
      return;
    }

    const query = parsed.data.query?.trim().toLowerCase() ?? "";
    const packageFilter = parsed.data.packageName?.trim().toLowerCase() ?? "";
    const entries = await db.getApps();

    const items = entries
      .flatMap((entry) => {
        const releases = [...entry.releases].sort((a, b) => b.versionCode - a.versionCode);
        if (parsed.data.latestOnly) {
          const latest = releases[0];
          return latest ? [toAdminApkItem(entry, latest)] : [];
        }
        return releases.map((release) => toAdminApkItem(entry, release));
      })
      .filter((item) => {
        const queryMatch =
          !query ||
          item.packageName.toLowerCase().includes(query) ||
          String(item.appId ?? "").toLowerCase().includes(query);
        const packageMatch = !packageFilter || item.packageName.toLowerCase().includes(packageFilter);
        return queryMatch && packageMatch;
      })
      .sort((a, b) => Date.parse(b.uploadedAt) - Date.parse(a.uploadedAt));

    res.json({ items });
  })
);

app.get(
  "/admin/apks/:apkId",
  asyncHandler(async (req, res) => {
    if (!requireAdmin(req, res)) {
      return;
    }

    const apkId = routeParam(req.params.apkId).trim();
    if (!apkId) {
      res.status(400).json({ message: "apkId 파라미터가 필요합니다." });
      return;
    }

    const entries = await db.getApps();
    const entry = findAppEntryByIdOrPackage(entries, apkId);
    if (!entry) {
      res.status(404).json({ message: "APK not found" });
      return;
    }

    const versions = [...entry.releases]
      .sort((a, b) => b.versionCode - a.versionCode)
      .map((release) => toAdminApkItem(entry, release));

    res.json({
      apk: versions[0] ?? null,
      versions
    });
  })
);

app.post(
  "/admin/apks/upload",
  upload.single("apk"),
  asyncHandler(async (req, res) => {
    if (!requireAdmin(req, res)) {
      return;
    }

    if (!req.file) {
      res.status(400).json({ message: "apk 파일이 필요합니다." });
      return;
    }

    const parsed = adminApkUploadSchema.safeParse(req.body);
    if (!parsed.success) {
      try {
        fs.unlinkSync(req.file.path);
      } catch {
        // ignore cleanup error
      }
      res.status(400).json({ message: "입력값이 올바르지 않습니다.", issues: parsed.error.issues });
      return;
    }

    const data = parsed.data;
    const packageName = data.packageName?.trim() || derivePackageNameFromFileName(req.file.originalname);
    const appId = data.appId?.trim() || deriveAppIdFromPackageName(packageName);
    const displayName = data.displayName?.trim() || packageName;
    const versionName = data.versionName?.trim() || "1.0.0";
    const versionCode = data.versionCode ?? 1;
    const changelog = (data.releaseNote ?? data.changelog ?? "").trim();

    const release = await persistUploadedRelease(req.file, {
      appId,
      packageName,
      displayName,
      versionName,
      versionCode,
      changelog,
      autoUpdate: data.autoUpdate
    });

    res.status(201).json({
      message: "업로드 완료",
      apk: toAdminApkItemFromRelease(release),
      release: toReleaseView(release)
    });
  })
);

app.get("/api/files/:fileName/download", proxyDownloadHandler);
app.get("/downloads/:fileName", proxyDownloadHandler);

app.get(
  "/api/apps",
  asyncHandler(async (_req, res) => {
    const apps = (await db.getApps())
      .map(toLatestAppView)
      .filter((item): item is NonNullable<typeof item> => item !== null)
      .sort((a, b) => a.displayName.localeCompare(b.displayName));

    res.json({ apps });
  })
);

app.get(
  "/api/apps/:appId/releases",
  asyncHandler(async (req, res) => {
    const appId = routeParam(req.params.appId);
    const appEntry = await db.getAppById(appId);
    if (!appEntry) {
      res.status(404).json({ message: "App not found" });
      return;
    }

    const releases = [...appEntry.releases]
      .sort((a, b) => b.versionCode - a.versionCode)
      .map((release) => ({
        ...release,
        sha256: release.sha256 ?? "",
        downloadUrl: buildDownloadUrl(release.fileName)
      }));

    res.json({ appId, releases });
  })
);

app.post(
  "/api/apps/upload",
  upload.single("apk"),
  asyncHandler(async (req, res) => {
    if (!requireAdmin(req, res)) {
      return;
    }

    if (!req.file) {
      res.status(400).json({ message: "apk 파일이 필요합니다." });
      return;
    }

    const parsed = uploadSchema.safeParse(req.body);
    if (!parsed.success) {
      try {
        fs.unlinkSync(req.file.path);
      } catch {
        // ignore cleanup error
      }
      res.status(400).json({ message: "입력값이 올바르지 않습니다.", issues: parsed.error.issues });
      return;
    }

    const payload = parsed.data;
    const release = await persistUploadedRelease(req.file, {
      appId: payload.appId,
      packageName: payload.packageName,
      displayName: payload.displayName,
      versionName: payload.versionName,
      versionCode: payload.versionCode,
      changelog: payload.changelog,
      autoUpdate: payload.autoUpdate
    });

    res.status(201).json({
      message: "업로드 완료",
      release: toReleaseView(release)
    });
  })
);

app.put(
  "/api/apps/:appId",
  asyncHandler(async (req, res) => {
    if (!requireAdmin(req, res)) {
      return;
    }

    const schema = z.object({
      displayName: z.string().min(1).optional(),
      packageName: z.string().min(3).optional()
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: "입력값이 올바르지 않습니다.", issues: parsed.error.issues });
      return;
    }

    const updated = await db.updateApp(routeParam(req.params.appId), parsed.data);
    if (!updated) {
      res.status(404).json({ message: "App not found" });
      return;
    }

    res.json({ message: "앱 정보가 수정되었습니다." });
  })
);

app.get(
  "/api/settings",
  asyncHandler(async (_req, res) => {
    const settings = await db.getSettings();
    res.json({ settings });
  })
);

app.put(
  "/api/settings",
  asyncHandler(async (req, res) => {
    if (!requireAdmin(req, res)) {
      return;
    }

    const parsed = settingsSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: "settings는 string key-value 형태여야 합니다." });
      return;
    }

    const settings = parsed.data;
    await db.replaceSettings(settings);
    res.json({ message: "설정 저장 완료", settings });
  })
);

app.post(
  "/api/devices/check-updates",
  asyncHandler(async (req, res) => {
    const parsed = checkUpdatesSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: "입력값이 올바르지 않습니다.", issues: parsed.error.issues });
      return;
    }

    const payload = parsed.data;
    const packageMap = new Map(payload.packages.map((item) => [item.packageName, item.versionCode]));
    const now = nowIso();

    await db.saveDeviceState(payload.deviceId, Object.fromEntries(packageMap.entries()), now);
    const [settings, latestReleases] = await Promise.all([db.getSettings(), db.getLatestReleases()]);

    const updates = latestReleases
      .map((latest) => {
        const installedVersion = packageMap.get(latest.packageName) ?? -1;
        const shouldUpdate = latest.autoUpdate && latest.versionCode > installedVersion;
        if (!shouldUpdate) {
          return null;
        }

        return {
          appId: latest.appId,
          displayName: latest.displayName,
          packageName: latest.packageName,
          installedVersionCode: installedVersion,
          targetVersionCode: latest.versionCode,
          targetVersionName: latest.versionName,
          changelog: latest.changelog,
          sha256: latest.sha256 ?? "",
          downloadUrl: buildDownloadUrl(latest.fileName)
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);

    res.json({
      deviceId: payload.deviceId,
      checkedAt: now,
      settings,
      updates
    });
  })
);

app.post(
  "/api/store/devices/sync",
  asyncHandler(async (req, res) => {
    const parsed = storeSyncSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: "입력값이 올바르지 않습니다.", issues: parsed.error.issues });
      return;
    }

    const payload = parsed.data;
    const packageMap = new Map(payload.packages.map((item) => [item.packageName, item.versionCode]));
    const latestReleases = await db.getLatestReleases();
    const now = nowIso();

    const updates = latestReleases
      .map((latest) => {
        const installedVersion = packageMap.get(latest.packageName) ?? -1;
        if (latest.versionCode <= installedVersion) {
          return null;
        }
        return toStoreUpdateView(latest, installedVersion);
      })
      .filter((item): item is NonNullable<typeof item> => item !== null)
      .sort((a, b) => a.displayName.localeCompare(b.displayName));

    const syncInput: StoreDeviceSyncInput = {
      deviceId: payload.deviceId.trim(),
      deviceName: payload.deviceName?.trim() || undefined,
      modelName: payload.modelName?.trim() || undefined,
      platform: payload.platform?.trim() || undefined,
      osVersion: payload.osVersion?.trim() || undefined,
      appStoreVersion: payload.appStoreVersion?.trim() || undefined,
      ipAddress: payload.ipAddress?.trim() || resolveClientIp(req),
      syncedAt: now,
      availableUpdateCount: updates.length,
      packages: payload.packages.map(
        (item): StoreDevicePackageVersion => ({
          packageName: item.packageName.trim(),
          versionCode: item.versionCode,
          versionName: item.versionName?.trim() || undefined,
          syncedAt: now
        })
      )
    };

    await db.saveStoreDeviceSync(syncInput);

    res.json({
      deviceId: payload.deviceId,
      syncedAt: now,
      updates
    });
  })
);

app.post(
  "/api/store/devices/:deviceId/events",
  asyncHandler(async (req, res) => {
    const deviceId = routeParam(req.params.deviceId).trim();
    if (!deviceId) {
      res.status(400).json({ message: "deviceId 파라미터가 필요합니다." });
      return;
    }

    const parsed = storeEventSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: "입력값이 올바르지 않습니다.", issues: parsed.error.issues });
      return;
    }

    const payload = parsed.data;
    const status: StoreUpdateEventStatus = payload.status;
    const createdAt = nowIso();
    const eventId = uuidv4();

    await db.createStoreUpdateEvent({
      id: eventId,
      deviceId,
      packageName: payload.packageName.trim(),
      appId: payload.appId?.trim() || undefined,
      releaseId: payload.releaseId?.trim() || undefined,
      targetVersionName: payload.targetVersionName?.trim() || undefined,
      targetVersionCode: payload.targetVersionCode,
      eventType: payload.eventType,
      status,
      message: payload.message?.trim() || undefined,
      metadata: payload.metadata,
      createdAt
    });

    res.status(201).json({
      message: "이벤트 저장 완료",
      eventId
    });
  })
);

app.get(
  "/admin/store/devices",
  asyncHandler(async (req, res) => {
    if (!requireAdmin(req, res)) {
      return;
    }

    const parsed = adminStoreDeviceListQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ message: "입력값이 올바르지 않습니다.", issues: parsed.error.issues });
      return;
    }

    const devices = await db.listStoreDevices(parsed.data.query);
    res.json({ devices });
  })
);

app.get(
  "/admin/store/devices/:deviceId",
  asyncHandler(async (req, res) => {
    if (!requireAdmin(req, res)) {
      return;
    }

    const deviceId = routeParam(req.params.deviceId).trim();
    if (!deviceId) {
      res.status(400).json({ message: "deviceId 파라미터가 필요합니다." });
      return;
    }

    const device = await db.getStoreDevice(deviceId);
    if (!device) {
      res.status(404).json({ message: "Store device not found" });
      return;
    }

    res.json({ device });
  })
);

app.get(
  "/admin/store/events",
  asyncHandler(async (req, res) => {
    if (!requireAdmin(req, res)) {
      return;
    }

    const parsed = adminStoreEventListQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ message: "입력값이 올바르지 않습니다.", issues: parsed.error.issues });
      return;
    }

    const events = await db.listStoreUpdateEvents({
      deviceId: parsed.data.deviceId?.trim() || undefined,
      packageName: parsed.data.packageName?.trim() || undefined,
      limit: parsed.data.limit
    });

    res.json({ events });
  })
);

app.post(
  "/api/commands",
  asyncHandler(async (req, res) => {
    if (!requireAdmin(req, res)) {
      return;
    }

    const parsed = createCommandSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: "입력값이 올바르지 않습니다.", issues: parsed.error.issues });
      return;
    }

    const payload = parsed.data;
    const now = nowIso();
    const command: CommandRecord = {
      id: uuidv4(),
      deviceId: payload.deviceId,
      type: payload.type as CommandType,
      payload: payload.payload,
      status: "PENDING",
      createdAt: now,
      updatedAt: now
    };

    await db.createCommand(command);
    res.status(201).json({ message: "명령 생성 완료", command });
  })
);

app.get(
  "/api/commands",
  asyncHandler(async (req, res) => {
    if (!requireAdmin(req, res)) {
      return;
    }

    const deviceId = String(req.query.deviceId ?? "").trim();
    const status = parseCommandStatus(String(req.query.status ?? "").trim());

    const commands = await db.listCommands({
      deviceId: deviceId || undefined,
      status
    });

    res.json({ commands });
  })
);

app.post(
  "/api/devices/:deviceId/commands/pull",
  asyncHandler(async (req, res) => {
    const deviceId = routeParam(req.params.deviceId);
    const parsed = pullCommandsSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ message: "입력값이 올바르지 않습니다.", issues: parsed.error.issues });
      return;
    }

    const now = nowIso();
    const commands = await db.pullPendingCommands(deviceId, parsed.data.max, now);
    res.json({ deviceId, commands });
  })
);

app.post(
  "/api/devices/:deviceId/commands/:commandId/result",
  asyncHandler(async (req, res) => {
    const deviceId = routeParam(req.params.deviceId);
    const commandId = routeParam(req.params.commandId);

    const parsed = commandResultSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: "입력값이 올바르지 않습니다.", issues: parsed.error.issues });
      return;
    }

    const payload = parsed.data;
    const updated = await db.updateCommandResult({
      deviceId,
      commandId,
      status: payload.status,
      resultMessage: payload.resultMessage,
      resultCode: payload.resultCode,
      updatedAt: nowIso()
    });

    if (!updated) {
      res.status(404).json({ message: "Command not found" });
      return;
    }

    res.json({ message: "명령 결과 저장 완료", command: updated });
  })
);

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error("[api-server] unhandled error:", error);
  if (res.headersSent) {
    return;
  }
  res.status(500).json({ message: "Internal server error" });
});

async function bootstrap(): Promise<void> {
  await objectStorage.init();
  await db.init();
  app.listen(port, () => {
    console.log(`[api-server] listening on ${baseUrl}`);
  });
}

void bootstrap().catch((error) => {
  console.error("[api-server] failed to start:", error);
  process.exit(1);
});

process.on("SIGINT", () => {
  void db.close().finally(() => process.exit(0));
});

process.on("SIGTERM", () => {
  void db.close().finally(() => process.exit(0));
});
