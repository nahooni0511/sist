import "dotenv/config";
import cors from "cors";
import express, { NextFunction, Request, Response } from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";
import multer from "multer";
import { createClient } from "redis";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import {
  AppEntry,
  AppRelease,
  AuthUserRecord,
  CommandRecord,
  CommandStatus,
  CommandType,
  CreateDeviceInput,
  CreateInstitutionDeliveryInput,
  CreateInstitutionInput,
  DeviceRecord,
  InstitutionFieldValue,
  InstitutionLogFilters,
  InstitutionStatus,
  InstitutionTypeCode,
  MySqlDb,
  StoreDevicePackageVersion,
  StoreDeviceSyncInput,
  UpdateInstitutionInput,
  StoreUpdateEventStatus
} from "./db.js";
import { DbAuthService } from "./admin-auth.js";
import { loadConfig } from "./config.js";
import { MinioObjectStorage } from "./object-storage.js";
import { registerAdminRoutes } from "./routes/admin-routes.js";
import { registerApiRoutes } from "./routes/api-routes.js";
import { registerHealthRoutes } from "./routes/health-routes.js";
import { registerSchoolRoutes } from "./routes/school-routes.js";
import { registerStoreRoutes } from "./routes/store-routes.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const storageDir = path.join(rootDir, "storage");
const tmpDir = path.join(storageDir, "tmp");

fs.mkdirSync(tmpDir, { recursive: true });

const config = loadConfig();

const app = express();
const port = config.server.port;
const baseUrl = config.server.baseUrl;

const db = new MySqlDb({
  host: config.mysql.host,
  port: config.mysql.port,
  username: config.mysql.username,
  password: config.mysql.password,
  database: config.mysql.database,
  connectionLimit: config.mysql.connectionLimit
});
const redisClient = createClient({
  url: config.redis.url,
  username: config.redis.username,
  password: config.redis.password
});
redisClient.on("error", (error) => {
  console.error("[api-server] redis error:", error);
});

const authService = new DbAuthService({
  db,
  redis: redisClient,
  accessTokenTtlMs: config.admin.accessTokenTtlMs,
  refreshTokenTtlMs: config.admin.refreshTokenTtlMs
});

const objectStorage = new MinioObjectStorage({
  host: config.minio.host,
  accessKey: config.minio.accessKey,
  secretKey: config.minio.secretKey,
  bucketName: config.minio.bucketName
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

const commandTypeValues = [
  "RESTART_APP",
  "RESTART_SERVICE",
  "RUN_HEALTHCHECK",
  "DIAG_NETWORK",
  "SYNC_TIME",
  "COLLECT_LOGS",
  "CAPTURE_SCREENSHOT",
  "CLEAR_CACHE",
  "PREFETCH_CONTENT",
  "APPLY_PROFILE",
  "REBOOT",
  "INSTALL_APP",
  "UPDATE_APP",
  "APPLY_POLICY"
] as const;

const createCommandSchema = z.object({
  deviceId: z.string().min(1),
  type: z.enum(commandTypeValues),
  payload: z.record(z.string(), z.unknown()).default({})
});

const adminCreateDeviceCommandSchema = z.object({
  type: z.enum(commandTypeValues),
  payload: z.record(z.string(), z.unknown()).default({}),
  requestedBy: z.string().optional()
});

const adminDeviceCommandListQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(200).optional().default(50),
  status: z.enum(["PENDING", "RUNNING", "SUCCESS", "FAILED"]).optional()
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
  }),
  institutionId: z.string().uuid().optional(),
  deliveredAt: z.string().datetime().optional(),
  installLocation: z.string().optional(),
  deliveryMemo: z.string().optional()
});

const institutionTypeCodeValues = ["SCHOOL", "PARK"] as const;
const institutionStatusValues = ["ACTIVE", "INACTIVE", "PENDING"] as const;
const dateOnlyRegex = /^\d{4}-\d{2}-\d{2}$/;

const institutionFieldValueSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);
const institutionFieldValuesSchema = z.record(z.string(), institutionFieldValueSchema);

const adminInstitutionListQuerySchema = z.object({
  query: z.string().optional(),
  typeCode: z.enum(institutionTypeCodeValues).optional(),
  status: z.enum(institutionStatusValues).optional(),
  hasActiveDevices: z
    .union([z.boolean(), z.string()])
    .optional()
    .transform((value) => {
      if (typeof value === "boolean") {
        return value;
      }
      if (typeof value === "string") {
        if (value.toLowerCase() === "true") {
          return true;
        }
        if (value.toLowerCase() === "false") {
          return false;
        }
      }
      return undefined;
    }),
  page: z.coerce.number().int().positive().optional().default(1),
  size: z.coerce.number().int().positive().max(200).optional().default(50)
});

const dateOnlyFieldSchema = z
  .string()
  .regex(dateOnlyRegex, "YYYY-MM-DD 형식이어야 합니다.")
  .refine((value) => isValidDateOnly(value), "유효한 날짜여야 합니다.");

const adminInstitutionBaseSchema = z.object({
  name: z.string().min(1).max(255),
  typeCode: z.enum(institutionTypeCodeValues),
  status: z.enum(institutionStatusValues).default("ACTIVE"),
  contactName: z.string().optional(),
  contactPhone: z.string().optional(),
  addressRoad: z.string().optional(),
  addressDetail: z.string().optional(),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  memo: z.string().optional(),
  contractStartDate: dateOnlyFieldSchema.optional(),
  contractEndDate: dateOnlyFieldSchema.optional(),
  fields: institutionFieldValuesSchema.default({})
});

const adminCreateInstitutionSchema = adminInstitutionBaseSchema
  .extend({
    schoolAdmin: z
      .object({
        loginId: z.string().min(1).max(120),
        password: z.string().min(1).max(255)
      })
      .optional()
  })
  .superRefine((value, ctx) => {
    if (
      value.contractStartDate &&
      value.contractEndDate &&
      value.contractStartDate >= value.contractEndDate
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["contractEndDate"],
        message: "계약 종료일은 시작일보다 이후 날짜여야 합니다."
      });
    }

    if (value.typeCode === "SCHOOL" && !value.schoolAdmin) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["schoolAdmin"],
        message: "학교 기관 생성 시 학교 관리자 계정이 필요합니다."
      });
    }
  });

const adminUpdateInstitutionSchema = adminInstitutionBaseSchema.superRefine((value, ctx) => {
  if (
    value.contractStartDate &&
    value.contractEndDate &&
    value.contractStartDate >= value.contractEndDate
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["contractEndDate"],
      message: "계약 종료일은 시작일보다 이후 날짜여야 합니다."
    });
  }
});

const adminInstitutionDeliveriesQuerySchema = z.object({
  status: z.enum(["ACTIVE", "ENDED"]).optional()
});

const adminCreateDeliverySchema = z.object({
  deviceId: z.string().min(1),
  deliveredAt: z.string().datetime().optional(),
  installLocation: z.string().optional(),
  memo: z.string().optional()
});

const adminEndDeliverySchema = z.object({
  retrievedAt: z.string().datetime().optional(),
  memo: z.string().optional()
});

const adminInstitutionLogsQuerySchema = z.object({
  actionType: z.string().optional(),
  deviceId: z.string().optional(),
  limit: z.coerce.number().int().positive().max(500).optional().default(100),
  from: z.string().optional(),
  to: z.string().optional()
});

const adminGlobalInstitutionLogsQuerySchema = z.object({
  institutionId: z.string().optional(),
  actionType: z.string().optional(),
  deviceId: z.string().optional(),
  limit: z.coerce.number().int().positive().max(500).optional().default(100),
  from: z.string().optional(),
  to: z.string().optional()
});

const adminUnassignedDevicesQuerySchema = z.object({
  query: z.string().optional(),
  limit: z.coerce.number().int().positive().max(500).optional().default(100)
});

const adminLoginSchema = z.object({
  id: z.string().min(1),
  password: z.string().min(1)
});

const adminRefreshSchema = z.object({
  refreshToken: z.string().min(1)
});

const schoolLoginSchema = adminLoginSchema;
const schoolRefreshSchema = adminRefreshSchema;
const schoolChangePasswordSchema = z.object({
  newPassword: z.string().min(1).max(255)
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

async function loginAdmin(id: string, password: string) {
  return authService.login(id, password, ["SUPER_ADMIN"]);
}

async function refreshAdmin(refreshToken: string) {
  return authService.refresh(refreshToken, ["SUPER_ADMIN"]);
}

async function loginSchool(id: string, password: string) {
  return authService.login(id, password, ["SCHOOL_ADMIN"]);
}

async function refreshSchool(refreshToken: string) {
  return authService.refresh(refreshToken, ["SCHOOL_ADMIN"]);
}

async function requireAdmin(req: Request, res: Response): Promise<boolean> {
  return authService.requireRole(req, res, ["SUPER_ADMIN"]);
}

async function requireSchool(req: Request, res: Response): Promise<boolean> {
  return authService.requireRole(req, res, ["SCHOOL_ADMIN"]);
}

async function getAdminUserId(req: Request): Promise<string> {
  const userId = await authService.getCurrentUserId(req);
  if (!userId) {
    throw new Error("ADMIN_UNAUTHORIZED");
  }
  return userId;
}

async function getSchoolUser(req: Request): Promise<AuthUserRecord | null> {
  return authService.getCurrentUser(req);
}

async function changeSchoolPassword(userId: string, newPassword: string): Promise<void> {
  await authService.changePassword(userId, newPassword, nowIso());
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
    })),
    activeInstitution: device.activeInstitution
      ? {
          institutionId: device.activeInstitution.institutionId,
          name: device.activeInstitution.name,
          typeCode: device.activeInstitution.institutionTypeCode,
          contractStartDate: device.activeInstitution.contractStartDate,
          contractEndDate: device.activeInstitution.contractEndDate
        }
      : undefined,
    activeDelivery: device.activeDelivery
      ? {
          deliveryId: device.activeDelivery.deliveryId,
          deliveredAt: device.activeDelivery.deliveredAt,
          installLocation: device.activeDelivery.installLocation,
          memo: device.activeDelivery.memo
        }
      : undefined
  };
}

function nowIso(): string {
  return new Date().toISOString();
}

function isValidDateOnly(value: string): boolean {
  if (!dateOnlyRegex.test(value)) {
    return false;
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    return false;
  }
  return parsed.toISOString().slice(0, 10) === value;
}

function nowSeoulDateKey(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

function parseDateOnly(value?: string): string | undefined {
  if (!value) {
    return undefined;
  }
  const trimmed = value.trim();
  if (!isValidDateOnly(trimmed)) {
    return undefined;
  }
  return trimmed;
}

function isWithinContractPeriod(contractStartDate?: string, contractEndDate?: string): boolean {
  const start = parseDateOnly(contractStartDate);
  const end = parseDateOnly(contractEndDate);

  if (!start && !end) {
    return true;
  }

  const today = nowSeoulDateKey();
  if (start && today < start) {
    return false;
  }

  // End date is exclusive: e.g. start=2026-01-01, end=2026-02-01 allows until 2026-01-31.
  if (end && today >= end) {
    return false;
  }

  return true;
}

function toInstitutionLogFilters(
  input: {
    institutionId?: string;
    actionType?: string;
    deviceId?: string;
    limit?: number;
    from?: string;
    to?: string;
  }
): InstitutionLogFilters {
  return {
    institutionId: input.institutionId?.trim() || undefined,
    actionType: input.actionType?.trim() || undefined,
    deviceId: input.deviceId?.trim() || undefined,
    limit: input.limit,
    from: input.from?.trim() || undefined,
    to: input.to?.trim() || undefined
  };
}

function mapInstitutionError(error: unknown): { status: number; message: string } | null {
  const code = (error as { code?: string } | null)?.code;
  if (code === "INSTITUTION_NAME_CONFLICT") {
    return { status: 409, message: "INSTITUTION_NAME_CONFLICT" };
  }
  if (code === "DEVICE_ALREADY_DELIVERED") {
    return { status: 409, message: "DEVICE_ALREADY_DELIVERED" };
  }
  if (code === "INSTITUTION_NOT_FOUND") {
    return { status: 404, message: "기관을 찾을 수 없습니다." };
  }
  if (code === "DEVICE_NOT_FOUND") {
    return { status: 404, message: "기기를 찾을 수 없습니다." };
  }
  if (code === "INSTITUTION_FIELD_VALIDATION_FAILED") {
    return { status: 400, message: (error as Error).message || "기관 필드 검증에 실패했습니다." };
  }
  if (code === "DELIVERY_ALREADY_ENDED") {
    return { status: 409, message: "이미 종료된 납품입니다." };
  }
  return null;
}

async function isDeviceCommandAllowed(deviceId: string): Promise<
  | {
      allowed: true;
    }
  | {
      allowed: false;
      reason: {
        institutionId: string;
        institutionName: string;
        contractStartDate?: string;
        contractEndDate?: string;
      };
    }
> {
  const contractWindow = await db.getDeviceContractWindow(deviceId);
  if (!contractWindow) {
    return { allowed: true };
  }

  const allowed = isWithinContractPeriod(contractWindow.contractStartDate, contractWindow.contractEndDate);
  if (allowed) {
    return { allowed: true };
  }

  return {
    allowed: false,
    reason: {
      institutionId: contractWindow.institutionId,
      institutionName: contractWindow.institutionName,
      contractStartDate: contractWindow.contractStartDate,
      contractEndDate: contractWindow.contractEndDate
    }
  };
}

function createPendingCommandRecord(deviceId: string, type: CommandType, payload: Record<string, unknown>): CommandRecord {
  const now = nowIso();
  return {
    id: uuidv4(),
    deviceId,
    type,
    payload,
    status: "PENDING",
    createdAt: now,
    updatedAt: now
  };
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

registerHealthRoutes({
  app,
  nowIso
});

registerAdminRoutes({
  app,
  asyncHandler,
  db,
  upload,
  loginAdmin,
  refreshAdmin,
  adminLoginSchema,
  adminRefreshSchema,
  adminDeviceListQuerySchema,
  adminCreateDeviceSchema,
  adminNextDeviceQuerySchema,
  adminDeviceCommandListQuerySchema,
  adminCreateDeviceCommandSchema,
  adminInstitutionListQuerySchema,
  adminCreateInstitutionSchema,
  adminUnassignedDevicesQuerySchema,
  adminGlobalInstitutionLogsQuerySchema,
  adminUpdateInstitutionSchema,
  adminInstitutionDeliveriesQuerySchema,
  adminCreateDeliverySchema,
  adminEndDeliverySchema,
  adminInstitutionLogsQuerySchema,
  adminApkListQuerySchema,
  adminApkUploadSchema,
  requireAdmin,
  routeParam,
  getAdminUserId,
  nowIso,
  mapInstitutionError,
  isDeviceCommandAllowed,
  createPendingCommandRecord,
  toAdminDeviceView,
  toInstitutionLogFilters,
  toAdminApkItem,
  toAdminApkItemFromRelease,
  toReleaseView,
  findAppEntryByIdOrPackage,
  persistUploadedRelease,
  derivePackageNameFromFileName,
  deriveAppIdFromPackageName
});

registerSchoolRoutes({
  app,
  asyncHandler,
  schoolLoginSchema,
  schoolRefreshSchema,
  schoolChangePasswordSchema,
  loginSchool,
  refreshSchool,
  requireSchool,
  getSchoolUser,
  changeSchoolPassword
});

registerApiRoutes({
  app,
  asyncHandler,
  db,
  upload,
  proxyDownloadHandler,
  uploadSchema,
  settingsSchema,
  checkUpdatesSchema,
  createCommandSchema,
  pullCommandsSchema,
  commandResultSchema,
  requireAdmin,
  routeParam,
  nowIso,
  buildDownloadUrl,
  parseCommandStatus,
  isDeviceCommandAllowed,
  createPendingCommandRecord,
  toLatestAppView,
  toReleaseView,
  persistUploadedRelease
});

registerStoreRoutes({
  app,
  asyncHandler,
  db,
  storeSyncSchema,
  storeEventSchema,
  adminStoreDeviceListQuerySchema,
  adminStoreEventListQuerySchema,
  requireAdmin,
  routeParam,
  resolveClientIp,
  nowIso,
  toStoreUpdateView
});

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error("[api-server] unhandled error:", error);
  if (res.headersSent) {
    return;
  }
  res.status(500).json({ message: "Internal server error" });
});

async function bootstrap(): Promise<void> {
  await redisClient.connect();
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
  void Promise.allSettled([db.close(), redisClient.quit()]).finally(() => process.exit(0));
});

process.on("SIGTERM", () => {
  void Promise.allSettled([db.close(), redisClient.quit()]).finally(() => process.exit(0));
});
