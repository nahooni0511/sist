import fs from "node:fs";
import { Express, Request, Response } from "express";
import { Multer } from "multer";
import { z } from "zod";
import {
  AppEntry,
  AppRelease,
  CommandRecord,
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
  UpdateInstitutionInput
} from "../db.js";
import { AsyncHandler, InstitutionErrorMapping } from "./types.js";

type PortalAuthSessionResponse = {
  accessToken: string;
  accessTokenExpiresAt: string;
  refreshToken: string;
  refreshTokenExpiresAt: string;
  role: "SUPER_ADMIN" | "SCHOOL_ADMIN" | "PARK_ADMIN";
  institutionId?: string;
  mustResetPassword: boolean;
};

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

export type RegisterAdminRoutesInput = {
  app: Express;
  asyncHandler: AsyncHandler;
  db: MySqlDb;
  upload: Multer;
  loginAdmin: (id: string, password: string) => Promise<PortalAuthSessionResponse>;
  refreshAdmin: (refreshToken: string) => Promise<PortalAuthSessionResponse>;
  adminLoginSchema: z.ZodTypeAny;
  adminRefreshSchema: z.ZodTypeAny;
  adminDeviceListQuerySchema: z.ZodTypeAny;
  adminCreateDeviceSchema: z.ZodTypeAny;
  adminNextDeviceQuerySchema: z.ZodTypeAny;
  adminDeviceCommandListQuerySchema: z.ZodTypeAny;
  adminCreateDeviceCommandSchema: z.ZodTypeAny;
  adminInstitutionListQuerySchema: z.ZodTypeAny;
  adminCreateInstitutionSchema: z.ZodTypeAny;
  adminUnassignedDevicesQuerySchema: z.ZodTypeAny;
  adminGlobalInstitutionLogsQuerySchema: z.ZodTypeAny;
  adminUpdateInstitutionSchema: z.ZodTypeAny;
  adminInstitutionDeliveriesQuerySchema: z.ZodTypeAny;
  adminCreateDeliverySchema: z.ZodTypeAny;
  adminEndDeliverySchema: z.ZodTypeAny;
  adminInstitutionLogsQuerySchema: z.ZodTypeAny;
  adminApkListQuerySchema: z.ZodTypeAny;
  adminApkUploadSchema: z.ZodTypeAny;
  requireAdmin: (req: Request, res: Response) => Promise<boolean>;
  routeParam: (value: string | string[] | undefined) => string;
  getAdminUserId: (req: Request) => Promise<string>;
  nowIso: () => string;
  mapInstitutionError: (error: unknown) => InstitutionErrorMapping | null;
  isDeviceCommandAllowed: (deviceId: string) => Promise<CommandAllowedResult>;
  createPendingCommandRecord: (
    deviceId: string,
    type: CommandType,
    payload: Record<string, unknown>
  ) => CommandRecord;
  toAdminDeviceView: (device: DeviceRecord) => unknown;
  toInstitutionLogFilters: (input: {
    institutionId?: string;
    actionType?: string;
    deviceId?: string;
    limit?: number;
    from?: string;
    to?: string;
  }) => InstitutionLogFilters;
  toAdminApkItem: (entry: AppEntry, release: AppRelease) => unknown;
  toAdminApkItemFromRelease: (release: AppRelease) => unknown;
  toReleaseView: (release: AppRelease) => unknown;
  findAppEntryByIdOrPackage: (entries: AppEntry[], appIdOrPackageName: string) => AppEntry | null;
  persistUploadedRelease: (file: Express.Multer.File, payload: UploadInput) => Promise<AppRelease>;
  derivePackageNameFromFileName: (fileName: string) => string;
  deriveAppIdFromPackageName: (packageName: string) => string;
};

export function registerAdminRoutes(input: RegisterAdminRoutesInput): void {
  const {
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
  } = input;

  app.post(
    "/api/admin/login",
    asyncHandler(async (req, res) => {
      const parsed = adminLoginSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ message: "입력값이 올바르지 않습니다.", issues: parsed.error.issues });
        return;
      }

      const { id, password } = parsed.data;
      try {
        const session = await loginAdmin(id, password);
        res.json(session);
      } catch {
        res.status(401).json({ message: "아이디 또는 비밀번호가 올바르지 않습니다." });
      }
    })
  );

  app.post(
    "/api/admin/refresh",
    asyncHandler(async (req, res) => {
      const parsed = adminRefreshSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ message: "입력값이 올바르지 않습니다.", issues: parsed.error.issues });
        return;
      }

      const refreshToken = parsed.data.refreshToken.trim();
      try {
        const session = await refreshAdmin(refreshToken);
        res.json(session);
      } catch (error) {
        const message = (error as Error).message || "Refresh token이 유효하지 않습니다.";
        res.status(401).json({ message });
      }
    })
  );

  app.get(
    "/admin/devices",
    asyncHandler(async (req, res) => {
      if (!(await requireAdmin(req, res))) {
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
      if (!(await requireAdmin(req, res))) {
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
        lng: parsed.data.location.lng,
        institutionId: parsed.data.institutionId,
        deliveredAt: parsed.data.deliveredAt,
        installLocation: parsed.data.installLocation?.trim() || undefined,
        deliveryMemo: parsed.data.deliveryMemo?.trim() || undefined,
        actedBy: await getAdminUserId(req),
        actedAt: nowIso()
      };

      let createdDeviceId = "";
      try {
        createdDeviceId = await db.createDevice(payload);
      } catch (error) {
        const mapped = mapInstitutionError(error);
        if (mapped) {
          res.status(mapped.status).json({ message: mapped.message });
          return;
        }
        throw error;
      }

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
      if (!(await requireAdmin(req, res))) {
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
      if (!(await requireAdmin(req, res))) {
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
    "/admin/devices/:deviceId/commands",
    asyncHandler(async (req, res) => {
      if (!(await requireAdmin(req, res))) {
        return;
      }

      const deviceId = routeParam(req.params.deviceId).trim();
      if (!deviceId) {
        res.status(400).json({ message: "deviceId 파라미터가 필요합니다." });
        return;
      }

      const parsed = adminDeviceCommandListQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        res.status(400).json({ message: "입력값이 올바르지 않습니다.", issues: parsed.error.issues });
        return;
      }

      const commands = await db.listCommands({
        deviceId,
        status: parsed.data.status,
        limit: parsed.data.limit
      });
      res.json({ commands });
    })
  );

  app.post(
    "/admin/devices/:deviceId/commands",
    asyncHandler(async (req, res) => {
      if (!(await requireAdmin(req, res))) {
        return;
      }

      const deviceId = routeParam(req.params.deviceId).trim();
      if (!deviceId) {
        res.status(400).json({ message: "deviceId 파라미터가 필요합니다." });
        return;
      }

      const parsed = adminCreateDeviceCommandSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ message: "입력값이 올바르지 않습니다.", issues: parsed.error.issues });
        return;
      }

      const device = await db.getDeviceById(deviceId);
      if (!device) {
        res.status(404).json({ message: "Device not found" });
        return;
      }

      const commandAllowed = await isDeviceCommandAllowed(deviceId);
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

      const command = createPendingCommandRecord(deviceId, parsed.data.type as CommandType, parsed.data.payload);
      await db.createCommand(command);
      res.status(201).json({ message: "명령 생성 완료", command });
    })
  );

  app.get(
    "/admin/institution-types",
    asyncHandler(async (req, res) => {
      if (!(await requireAdmin(req, res))) {
        return;
      }
      const types = await db.listInstitutionTypes();
      res.json({ types });
    })
  );

  app.get(
    "/admin/institution-types/:typeCode/fields",
    asyncHandler(async (req, res) => {
      if (!(await requireAdmin(req, res))) {
        return;
      }

      const typeCode = routeParam(req.params.typeCode).trim().toUpperCase();
      if (typeCode !== "SCHOOL" && typeCode !== "PARK") {
        res.status(400).json({ message: "typeCode는 SCHOOL 또는 PARK여야 합니다." });
        return;
      }

      const fields = await db.listInstitutionTypeFields(typeCode as InstitutionTypeCode);
      res.json({ fields });
    })
  );

  app.get(
    "/admin/institutions",
    asyncHandler(async (req, res) => {
      if (!(await requireAdmin(req, res))) {
        return;
      }

      const parsed = adminInstitutionListQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        res.status(400).json({ message: "입력값이 올바르지 않습니다.", issues: parsed.error.issues });
        return;
      }

      const items = await db.listInstitutions({
        query: parsed.data.query?.trim() || undefined,
        typeCode: parsed.data.typeCode,
        status: parsed.data.status as InstitutionStatus | undefined,
        hasActiveDevices: parsed.data.hasActiveDevices,
        page: parsed.data.page,
        size: parsed.data.size
      });
      res.json({ items });
    })
  );

  app.post(
    "/admin/institutions",
    asyncHandler(async (req, res) => {
      if (!(await requireAdmin(req, res))) {
        return;
      }

      const parsed = adminCreateInstitutionSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ message: "입력값이 올바르지 않습니다.", issues: parsed.error.issues });
        return;
      }

      const now = nowIso();
      const schoolAdmin =
        parsed.data.typeCode === "SCHOOL"
          ? {
              loginId: parsed.data.schoolAdmin.loginId.trim(),
              password: parsed.data.schoolAdmin.password
            }
          : undefined;
      const payload: CreateInstitutionInput = {
        name: parsed.data.name.trim(),
        institutionTypeCode: parsed.data.typeCode,
        status: parsed.data.status,
        contactName: parsed.data.contactName?.trim() || undefined,
        contactPhone: parsed.data.contactPhone?.trim() || undefined,
        addressRoad: parsed.data.addressRoad?.trim() || undefined,
        addressDetail: parsed.data.addressDetail?.trim() || undefined,
        lat: parsed.data.lat,
        lng: parsed.data.lng,
        memo: parsed.data.memo?.trim() || undefined,
        contractStartDate: parsed.data.contractStartDate?.trim() || undefined,
        contractEndDate: parsed.data.contractEndDate?.trim() || undefined,
        fields: parsed.data.fields as Record<string, InstitutionFieldValue>,
        actedBy: await getAdminUserId(req),
        actedAt: now
      };

      try {
        const institution = schoolAdmin
          ? await db.createInstitutionWithSchoolAdmin(payload, schoolAdmin)
          : await db.createInstitution(payload);
        res.status(201).json({ institution });
      } catch (error) {
        const authCode = (error as { code?: string } | null)?.code;
        if (authCode === "AUTH_LOGIN_ID_CONFLICT") {
          res.status(409).json({ message: "SCHOOL_ADMIN_LOGIN_ID_CONFLICT" });
          return;
        }
        const mapped = mapInstitutionError(error);
        if (mapped) {
          res.status(mapped.status).json({ message: mapped.message });
          return;
        }
        throw error;
      }
    })
  );

  app.get(
    "/admin/institutions/unassigned-devices",
    asyncHandler(async (req, res) => {
      if (!(await requireAdmin(req, res))) {
        return;
      }
      const parsed = adminUnassignedDevicesQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        res.status(400).json({ message: "입력값이 올바르지 않습니다.", issues: parsed.error.issues });
        return;
      }
      const devices = await db.listUnassignedDevices(parsed.data.query, parsed.data.limit);
      res.json({ devices });
    })
  );

  app.get(
    "/admin/institution-logs",
    asyncHandler(async (req, res) => {
      if (!(await requireAdmin(req, res))) {
        return;
      }
      const parsed = adminGlobalInstitutionLogsQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        res.status(400).json({ message: "입력값이 올바르지 않습니다.", issues: parsed.error.issues });
        return;
      }
      const logs = await db.listGlobalInstitutionLogs(
        toInstitutionLogFilters({
          institutionId: parsed.data.institutionId,
          actionType: parsed.data.actionType,
          deviceId: parsed.data.deviceId,
          limit: parsed.data.limit,
          from: parsed.data.from,
          to: parsed.data.to
        })
      );
      res.json({ logs });
    })
  );

  app.get(
    "/admin/institutions/:institutionId",
    asyncHandler(async (req, res) => {
      if (!(await requireAdmin(req, res))) {
        return;
      }
      const institutionId = routeParam(req.params.institutionId).trim();
      if (!institutionId) {
        res.status(400).json({ message: "institutionId 파라미터가 필요합니다." });
        return;
      }
      const institution = await db.getInstitutionById(institutionId);
      if (!institution) {
        res.status(404).json({ message: "기관을 찾을 수 없습니다." });
        return;
      }
      res.json({ institution });
    })
  );

  app.put(
    "/admin/institutions/:institutionId",
    asyncHandler(async (req, res) => {
      if (!(await requireAdmin(req, res))) {
        return;
      }

      const institutionId = routeParam(req.params.institutionId).trim();
      if (!institutionId) {
        res.status(400).json({ message: "institutionId 파라미터가 필요합니다." });
        return;
      }

      const parsed = adminUpdateInstitutionSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ message: "입력값이 올바르지 않습니다.", issues: parsed.error.issues });
        return;
      }

      const payload: UpdateInstitutionInput = {
        name: parsed.data.name.trim(),
        institutionTypeCode: parsed.data.typeCode,
        status: parsed.data.status,
        contactName: parsed.data.contactName?.trim() || undefined,
        contactPhone: parsed.data.contactPhone?.trim() || undefined,
        addressRoad: parsed.data.addressRoad?.trim() || undefined,
        addressDetail: parsed.data.addressDetail?.trim() || undefined,
        lat: parsed.data.lat,
        lng: parsed.data.lng,
        memo: parsed.data.memo?.trim() || undefined,
        contractStartDate: parsed.data.contractStartDate?.trim() || undefined,
        contractEndDate: parsed.data.contractEndDate?.trim() || undefined,
        fields: parsed.data.fields as Record<string, InstitutionFieldValue>,
        actedBy: await getAdminUserId(req),
        actedAt: nowIso()
      };

      try {
        const institution = await db.updateInstitution(institutionId, payload);
        if (!institution) {
          res.status(404).json({ message: "기관을 찾을 수 없습니다." });
          return;
        }
        res.json({ institution });
      } catch (error) {
        const mapped = mapInstitutionError(error);
        if (mapped) {
          res.status(mapped.status).json({ message: mapped.message });
          return;
        }
        throw error;
      }
    })
  );

  app.get(
    "/admin/institutions/:institutionId/deliveries",
    asyncHandler(async (req, res) => {
      if (!(await requireAdmin(req, res))) {
        return;
      }
      const institutionId = routeParam(req.params.institutionId).trim();
      if (!institutionId) {
        res.status(400).json({ message: "institutionId 파라미터가 필요합니다." });
        return;
      }

      const parsed = adminInstitutionDeliveriesQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        res.status(400).json({ message: "입력값이 올바르지 않습니다.", issues: parsed.error.issues });
        return;
      }

      const deliveries = await db.listInstitutionDeliveries(institutionId, parsed.data.status);
      res.json({ deliveries });
    })
  );

  app.post(
    "/admin/institutions/:institutionId/deliveries",
    asyncHandler(async (req, res) => {
      if (!(await requireAdmin(req, res))) {
        return;
      }
      const institutionId = routeParam(req.params.institutionId).trim();
      if (!institutionId) {
        res.status(400).json({ message: "institutionId 파라미터가 필요합니다." });
        return;
      }

      const parsed = adminCreateDeliverySchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ message: "입력값이 올바르지 않습니다.", issues: parsed.error.issues });
        return;
      }

      const now = nowIso();
      const payload: CreateInstitutionDeliveryInput = {
        institutionId,
        deviceId: parsed.data.deviceId.trim(),
        deliveredAt: parsed.data.deliveredAt || now,
        installLocation: parsed.data.installLocation?.trim() || undefined,
        memo: parsed.data.memo?.trim() || undefined,
        actedBy: await getAdminUserId(req),
        actedAt: now
      };

      try {
        const delivery = await db.createInstitutionDelivery(payload);
        res.status(201).json({ delivery });
      } catch (error) {
        const mapped = mapInstitutionError(error);
        if (mapped) {
          res.status(mapped.status).json({ message: mapped.message });
          return;
        }
        throw error;
      }
    })
  );

  app.patch(
    "/admin/institutions/:institutionId/deliveries/:deliveryId/end",
    asyncHandler(async (req, res) => {
      if (!(await requireAdmin(req, res))) {
        return;
      }

      const institutionId = routeParam(req.params.institutionId).trim();
      const deliveryId = routeParam(req.params.deliveryId).trim();
      if (!institutionId || !deliveryId) {
        res.status(400).json({ message: "institutionId, deliveryId 파라미터가 필요합니다." });
        return;
      }

      const parsed = adminEndDeliverySchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ message: "입력값이 올바르지 않습니다.", issues: parsed.error.issues });
        return;
      }

      const now = nowIso();
      try {
        const delivery = await db.endInstitutionDelivery({
          institutionId,
          deliveryId,
          retrievedAt: parsed.data.retrievedAt || now,
          memo: parsed.data.memo?.trim() || undefined,
          actedBy: await getAdminUserId(req),
          actedAt: now
        });
        if (!delivery) {
          res.status(404).json({ message: "납품 이력을 찾을 수 없습니다." });
          return;
        }
        res.json({ delivery });
      } catch (error) {
        const mapped = mapInstitutionError(error);
        if (mapped) {
          res.status(mapped.status).json({ message: mapped.message });
          return;
        }
        throw error;
      }
    })
  );

  app.get(
    "/admin/institutions/:institutionId/logs",
    asyncHandler(async (req, res) => {
      if (!(await requireAdmin(req, res))) {
        return;
      }

      const institutionId = routeParam(req.params.institutionId).trim();
      if (!institutionId) {
        res.status(400).json({ message: "institutionId 파라미터가 필요합니다." });
        return;
      }

      const parsed = adminInstitutionLogsQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        res.status(400).json({ message: "입력값이 올바르지 않습니다.", issues: parsed.error.issues });
        return;
      }

      const logs = await db.listInstitutionLogs(
        institutionId,
        toInstitutionLogFilters({
          actionType: parsed.data.actionType,
          deviceId: parsed.data.deviceId,
          limit: parsed.data.limit,
          from: parsed.data.from,
          to: parsed.data.to
        })
      );
      res.json({ logs });
    })
  );

  app.get(
    "/admin/apks",
    asyncHandler(async (req, res) => {
      if (!(await requireAdmin(req, res))) {
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
          const apkItem = item as {
            packageName: string;
            appId?: string;
          };
          const queryMatch =
            !query ||
            apkItem.packageName.toLowerCase().includes(query) ||
            String(apkItem.appId ?? "").toLowerCase().includes(query);
          const packageMatch = !packageFilter || apkItem.packageName.toLowerCase().includes(packageFilter);
          return queryMatch && packageMatch;
        })
        .sort((a, b) => {
          const left = Date.parse(String((a as { uploadedAt: string }).uploadedAt));
          const right = Date.parse(String((b as { uploadedAt: string }).uploadedAt));
          return right - left;
        });

      res.json({ items });
    })
  );

  app.get(
    "/admin/apks/:apkId",
    asyncHandler(async (req, res) => {
      if (!(await requireAdmin(req, res))) {
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
      if (!(await requireAdmin(req, res))) {
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
}
