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
import { AppEntry, AppRelease, CommandRecord, CommandStatus, CommandType, MySqlDb } from "./db.js";
import { MinioObjectStorage } from "./object-storage.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const storageDir = path.join(rootDir, "storage");
const tmpDir = path.join(storageDir, "tmp");

fs.mkdirSync(tmpDir, { recursive: true });

const app = express();
const port = parseEnvNumber("PORT", 4000);
const adminToken = process.env.ADMIN_TOKEN ?? "sistrun-admin";
const baseUrl = process.env.PUBLIC_BASE_URL ?? `http://localhost:${port}`;

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

function requireAdmin(req: Request, res: Response): boolean {
  const token = req.header("x-admin-token");
  if (token !== adminToken) {
    res.status(401).json({ message: "Unauthorized" });
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
    const ext = path.extname(req.file.originalname).toLowerCase() || ".apk";
    const safeFileName = `${payload.appId}-${payload.versionCode}-${Date.now()}${ext}`;
    const fileBuffer = fs.readFileSync(req.file.path);
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
      fileSize: req.file.size,
      uploadedAt: now
    };

    try {
      await objectStorage.uploadFile({
        objectName: safeFileName,
        localPath: req.file.path,
        contentType: req.file.mimetype || "application/vnd.android.package-archive"
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
        fs.unlinkSync(req.file.path);
      } catch {
        // ignore cleanup error
      }
    }

    res.status(201).json({
      message: "업로드 완료",
      release: {
        ...release,
        downloadUrl: buildDownloadUrl(release.fileName)
      }
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
