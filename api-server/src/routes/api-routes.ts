import fs from "node:fs";
import { Express, Request, RequestHandler, Response } from "express";
import { Multer } from "multer";
import { z } from "zod";
import { CommandRecord, CommandStatus, CommandType, MySqlDb } from "../db.js";
import { AppEntry, AppRelease } from "../db.js";
import { AsyncHandler } from "./types.js";

type UploadInput = {
  appId: string;
  packageName: string;
  displayName: string;
  versionName: string;
  versionCode: number;
  changelog: string;
  autoUpdate: boolean;
};

type CommandAllowedResult =
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
    };

export type RegisterApiRoutesInput = {
  app: Express;
  asyncHandler: AsyncHandler;
  db: MySqlDb;
  upload: Multer;
  proxyDownloadHandler: RequestHandler;
  uploadSchema: z.ZodTypeAny;
  settingsSchema: z.ZodTypeAny;
  checkUpdatesSchema: z.ZodTypeAny;
  createCommandSchema: z.ZodTypeAny;
  pullCommandsSchema: z.ZodTypeAny;
  commandResultSchema: z.ZodTypeAny;
  requireAdmin: (req: Request, res: Response) => Promise<boolean>;
  routeParam: (value: string | string[] | undefined) => string;
  nowIso: () => string;
  buildDownloadUrl: (fileName: string) => string;
  parseCommandStatus: (raw: string) => CommandStatus | undefined;
  isDeviceCommandAllowed: (deviceId: string) => Promise<CommandAllowedResult>;
  createPendingCommandRecord: (
    deviceId: string,
    type: CommandType,
    payload: Record<string, unknown>
  ) => CommandRecord;
  toLatestAppView: (entry: AppEntry) => unknown;
  toReleaseView: (release: AppRelease) => unknown;
  persistUploadedRelease: (file: Express.Multer.File, payload: UploadInput) => Promise<AppRelease>;
};

export function registerApiRoutes(input: RegisterApiRoutesInput): void {
  const {
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
  } = input;

  app.get("/api/files/:fileName/download", proxyDownloadHandler);
  app.get("/downloads/:fileName", proxyDownloadHandler);

  app.get(
    "/api/apps",
    asyncHandler(async (_req, res) => {
      const apps = (await db.getApps())
        .map(toLatestAppView)
        .filter((item): item is NonNullable<typeof item> => item !== null)
        .sort((a, b) => {
          const left = String((a as { displayName: string }).displayName);
          const right = String((b as { displayName: string }).displayName);
          return left.localeCompare(right);
        });

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
      if (!(await requireAdmin(req, res))) {
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
      if (!(await requireAdmin(req, res))) {
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
      if (!(await requireAdmin(req, res))) {
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
      const packageMap = new Map<string, number>(
        payload.packages.map(
          (item: { packageName: string; versionCode: number }): [string, number] => [
            item.packageName,
            item.versionCode
          ]
        )
      );
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
      if (!(await requireAdmin(req, res))) {
        return;
      }

      const parsed = createCommandSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ message: "입력값이 올바르지 않습니다.", issues: parsed.error.issues });
        return;
      }

      const payload = parsed.data;
      const commandAllowed = await isDeviceCommandAllowed(payload.deviceId);
      if (!commandAllowed.allowed) {
        res.status(403).json({
          message: "INSTITUTION_CONTRACT_DATE_DENIED",
          institutionId: commandAllowed.reason.institutionId,
          institutionName: commandAllowed.reason.institutionName,
          contractStartDate: commandAllowed.reason.contractStartDate,
          contractEndDate: commandAllowed.reason.contractEndDate
        });
        return;
      }

      const command = createPendingCommandRecord(
        payload.deviceId,
        payload.type as CommandType,
        payload.payload
      );

      await db.createCommand(command);
      res.status(201).json({ message: "명령 생성 완료", command });
    })
  );

  app.get(
    "/api/commands",
    asyncHandler(async (req, res) => {
      if (!(await requireAdmin(req, res))) {
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
}
