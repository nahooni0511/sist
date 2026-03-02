import { Express, Request, Response } from "express";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import { MySqlDb, StoreDevicePackageVersion, StoreDeviceSyncInput, StoreUpdateEventStatus } from "../db.js";
import { AppRelease } from "../db.js";
import { AsyncHandler } from "./types.js";

export type RegisterStoreRoutesInput = {
  app: Express;
  asyncHandler: AsyncHandler;
  db: MySqlDb;
  storeSyncSchema: z.ZodTypeAny;
  storeEventSchema: z.ZodTypeAny;
  adminStoreDeviceListQuerySchema: z.ZodTypeAny;
  adminStoreEventListQuerySchema: z.ZodTypeAny;
  requireAdmin: (req: Request, res: Response) => Promise<boolean>;
  routeParam: (value: string | string[] | undefined) => string;
  resolveClientIp: (req: Request) => string;
  nowIso: () => string;
  toStoreUpdateView: (release: AppRelease, installedVersionCode: number) => unknown;
};

export function registerStoreRoutes(input: RegisterStoreRoutesInput): void {
  const {
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
  } = input;

  app.post(
    "/api/store/devices/sync",
    asyncHandler(async (req, res) => {
      const parsed = storeSyncSchema.safeParse(req.body);
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
        .sort((a, b) => {
          const left = String((a as { displayName: string }).displayName);
          const right = String((b as { displayName: string }).displayName);
          return left.localeCompare(right);
        });

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
          (item: { packageName: string; versionCode: number; versionName?: string }): StoreDevicePackageVersion => ({
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
      if (!(await requireAdmin(req, res))) {
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
      if (!(await requireAdmin(req, res))) {
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
      if (!(await requireAdmin(req, res))) {
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
}
