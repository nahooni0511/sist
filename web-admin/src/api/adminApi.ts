import {
  AdminApiConfig,
  AdminAuthSession,
  ApkDetail,
  ApkItem,
  ApkListFilters,
  CreateDeviceInput,
  CreateCommandInput,
  DeviceCommandRecord,
  DeviceItem,
  DeviceListFilters,
  NextDevicePreview,
  StoreDeviceDetail,
  StoreDeviceSummary,
  StoreSyncLog,
  StoreUpdateEvent
} from "../types/admin";

class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function shouldFallbackUpload(error: unknown): boolean {
  if (!(error instanceof ApiError)) {
    return false;
  }
  return error.status === 404 || error.status === 405 || error.status === 501;
}

type RequestOptions = {
  method?: string;
  body?: BodyInit | null;
  contentType?: string;
};

type JsonRecord = Record<string, unknown>;

function safeText(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (value === null || value === undefined) {
    return "";
  }
  return String(value);
}

function safeNumber(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function optionalNumber(value: unknown): number | undefined {
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function toIso(value: unknown): string {
  const raw = safeText(value);
  if (!raw) {
    return new Date(0).toISOString();
  }
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    return new Date(0).toISOString();
  }
  return parsed.toISOString();
}

function optionalIso(value: unknown): string | undefined {
  const raw = safeText(value).trim();
  if (!raw) {
    return undefined;
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    return undefined;
  }
  return parsed.toISOString();
}

function safeDeviceType(value: unknown): DeviceItem["deviceType"] {
  const raw = safeText(value);
  if (raw === "시스트파크" || raw === "시스트런") {
    return raw;
  }
  return undefined;
}

function mapAdminApk(item: JsonRecord): ApkItem {
  return {
    id: safeText(item.id || item.apkId || item.packageName || item.appId),
    appId: safeText(item.appId) || undefined,
    packageName: safeText(item.packageName),
    versionName: safeText(item.versionName),
    versionCode: safeNumber(item.versionCode, -1),
    releaseNote: safeText(item.releaseNote || item.changelog),
    sha256: safeText(item.sha256),
    fileSize: safeNumber(item.fileSize, 0),
    uploadedAt: toIso(item.uploadedAt),
    downloadUrl: safeText(item.downloadUrl || item.fileUrl) || undefined
  };
}

function mapLegacyApp(item: JsonRecord): ApkItem {
  const latestRelease = (item.latestRelease as JsonRecord | undefined) ?? {};
  const appId = safeText(item.appId);
  const packageName = safeText(item.packageName);

  return {
    id: appId || packageName,
    appId: appId || undefined,
    packageName,
    versionName: safeText(latestRelease.versionName),
    versionCode: safeNumber(latestRelease.versionCode, -1),
    releaseNote: safeText(latestRelease.changelog),
    sha256: safeText(latestRelease.sha256),
    fileSize: safeNumber(latestRelease.fileSize, 0),
    uploadedAt: toIso(latestRelease.uploadedAt),
    downloadUrl: safeText(latestRelease.downloadUrl) || undefined
  };
}

function mapDevice(item: JsonRecord): DeviceItem {
  const statusRaw = safeText(item.status).toLowerCase();
  const status = statusRaw === "online" || statusRaw === "offline" ? statusRaw : "unknown";
  const location = (item.location as JsonRecord | undefined) ?? {};

  return {
    deviceId: safeText(item.deviceId || item.id),
    deviceType: safeDeviceType(item.deviceType || item.type),
    deviceKey: safeText(item.deviceKey) || undefined,
    deviceName: safeText(item.deviceName || item.alias) || undefined,
    model: safeText(item.model) || undefined,
    osVersion: safeText(item.osVersion) || undefined,
    status,
    lastSeen: optionalIso(item.lastSeen || item.lastSeenAt || item.updatedAt),
    locationName: safeText(item.locationName || location.name) || undefined,
    lat: optionalNumber(item.lat) ?? optionalNumber(location.lat),
    lng: optionalNumber(item.lng) ?? optionalNumber(location.lng),
    groupName: safeText(item.groupName || item.parkName) || undefined,
    installedApps: Array.isArray(item.installedApps)
      ? item.installedApps.map((app) => {
          const info = app as JsonRecord;
          return {
            packageName: safeText(info.packageName),
            versionName: safeText(info.versionName) || undefined,
            versionCode: optionalNumber(info.versionCode)
          };
        })
      : undefined,
    modules: Array.isArray(item.modules)
      ? item.modules
          .map((module) => {
            const info = module as JsonRecord;
            const name = safeText(info.name).trim();
            const portNumber = optionalNumber(info.portNumber);
            if (!name || typeof portNumber !== "number") {
              return null;
            }
            return { name, portNumber };
          })
          .filter((module): module is NonNullable<typeof module> => module !== null)
      : undefined
  };
}

function filterDevices(devices: DeviceItem[], filters: DeviceListFilters): DeviceItem[] {
  let result = devices;

  if (filters.query) {
    const q = filters.query.toLowerCase();
    result = result.filter((d) =>
      [d.deviceId, d.deviceKey, d.deviceName, d.locationName, d.groupName].some((v) => safeText(v).toLowerCase().includes(q))
    );
  }

  return result;
}

function mapCommand(item: JsonRecord): DeviceCommandRecord {
  return {
    id: safeText(item.id || item.commandId),
    deviceId: safeText(item.deviceId),
    type: safeText(item.type),
    status: (safeText(item.status).toUpperCase() || "UNKNOWN") as DeviceCommandRecord["status"],
    payload: (item.payload as Record<string, unknown> | undefined) ?? {},
    createdAt: toIso(item.createdAt),
    updatedAt: toIso(item.updatedAt),
    resultMessage: safeText(item.resultMessage || item.message) || undefined,
    resultCode: Number.isFinite(Number(item.resultCode)) ? Number(item.resultCode) : undefined
  };
}

function parseRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value) {
    return undefined;
  }
  if (typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function mapStoreDeviceSummary(item: JsonRecord): StoreDeviceSummary {
  return {
    deviceId: safeText(item.deviceId || item.device_id),
    deviceName: safeText(item.deviceName || item.device_name) || undefined,
    modelName: safeText(item.modelName || item.model_name) || undefined,
    platform: safeText(item.platform) || undefined,
    osVersion: safeText(item.osVersion || item.os_version) || undefined,
    appStoreVersion: safeText(item.appStoreVersion || item.app_store_version) || undefined,
    ipAddress: safeText(item.ipAddress || item.ip_address) || undefined,
    lastSyncedAt: optionalIso(item.lastSyncedAt || item.last_synced_at),
    installedPackageCount: safeNumber(item.installedPackageCount || item.installed_package_count, 0),
    availableUpdateCount: safeNumber(item.availableUpdateCount || item.available_update_count, 0),
    latestEventAt: optionalIso(item.latestEventAt || item.latest_event_at),
    latestEventType: safeText(item.latestEventType || item.latest_event_type) || undefined,
    latestEventStatus: safeText(item.latestEventStatus || item.latest_event_status) || undefined
  };
}

function mapStoreSyncLog(item: JsonRecord): StoreSyncLog {
  return {
    id: safeText(item.id),
    deviceId: safeText(item.deviceId || item.device_id),
    syncedAt: toIso(item.syncedAt || item.synced_at),
    packageCount: safeNumber(item.packageCount || item.package_count, 0),
    updateCount: safeNumber(item.updateCount || item.update_count, 0),
    appStoreVersion: safeText(item.appStoreVersion || item.app_store_version) || undefined,
    ipAddress: safeText(item.ipAddress || item.ip_address) || undefined
  };
}

function mapStoreUpdateEvent(item: JsonRecord): StoreUpdateEvent {
  const statusRaw = safeText(item.status).toUpperCase();
  const status: StoreUpdateEvent["status"] =
    statusRaw === "SUCCESS" || statusRaw === "FAILED" ? statusRaw : "INFO";

  return {
    id: safeText(item.id),
    deviceId: safeText(item.deviceId || item.device_id),
    packageName: safeText(item.packageName || item.package_name),
    appId: safeText(item.appId || item.app_id) || undefined,
    releaseId: safeText(item.releaseId || item.release_id) || undefined,
    targetVersionName: safeText(item.targetVersionName || item.target_version_name) || undefined,
    targetVersionCode: optionalNumber(item.targetVersionCode || item.target_version_code),
    eventType: safeText(item.eventType || item.event_type),
    status,
    message: safeText(item.message) || undefined,
    metadata: parseRecord(item.metadata),
    createdAt: toIso(item.createdAt || item.created_at)
  };
}

function mapStoreDeviceDetail(item: JsonRecord): StoreDeviceDetail {
  const summary = mapStoreDeviceSummary(item);
  const packages = Array.isArray(item.packages)
    ? item.packages
        .map((pkg) => {
          const raw = pkg as JsonRecord;
          const packageName = safeText(raw.packageName || raw.package_name).trim();
          const versionCode = optionalNumber(raw.versionCode || raw.version_code);
          if (!packageName || typeof versionCode !== "number") {
            return null;
          }
          return {
            packageName,
            versionCode,
            versionName: safeText(raw.versionName || raw.version_name) || undefined,
            syncedAt: optionalIso(raw.syncedAt || raw.synced_at)
          };
        })
        .filter((pkg): pkg is NonNullable<typeof pkg> => pkg !== null)
    : [];

  const recentSyncs = Array.isArray(item.recentSyncs || item.recent_syncs)
    ? ((item.recentSyncs || item.recent_syncs) as JsonRecord[]).map(mapStoreSyncLog)
    : [];

  const recentEvents = Array.isArray(item.recentEvents || item.recent_events)
    ? ((item.recentEvents || item.recent_events) as JsonRecord[]).map(mapStoreUpdateEvent)
    : [];

  return {
    ...summary,
    packages,
    recentSyncs,
    recentEvents
  };
}

export function createAdminApi(config: AdminApiConfig) {
  const baseUrl = config.baseUrl.replace(/\/$/, "");
  let accessToken = safeText(config.accessToken).trim();
  let refreshToken = safeText(config.refreshToken).trim();
  let refreshInFlight: Promise<void> | null = null;

  async function parseJsonOrThrow(response: Response): Promise<JsonRecord> {
    const text = await response.text();
    let json: JsonRecord = {};
    if (text) {
      try {
        json = JSON.parse(text) as JsonRecord;
      } catch {
        json = { message: text };
      }
    }

    if (!response.ok) {
      throw new ApiError(response.status, safeText(json.message) || `${response.status} ${response.statusText}`);
    }

    return json;
  }

  function parseAuthSession(raw: JsonRecord): AdminAuthSession {
    const nextAccessToken = safeText(raw.accessToken).trim();
    const nextRefreshToken = safeText(raw.refreshToken).trim();
    const nextAccessTokenExpiresAt = safeText(raw.accessTokenExpiresAt).trim();
    const nextRefreshTokenExpiresAt = safeText(raw.refreshTokenExpiresAt).trim();

    if (!nextAccessToken || !nextRefreshToken) {
      throw new Error("인증 응답이 올바르지 않습니다.");
    }

    if (!nextAccessTokenExpiresAt || !nextRefreshTokenExpiresAt) {
      throw new Error("토큰 만료시간이 누락되었습니다.");
    }

    const accessExpiresAtDate = new Date(nextAccessTokenExpiresAt);
    const refreshExpiresAtDate = new Date(nextRefreshTokenExpiresAt);
    if (Number.isNaN(accessExpiresAtDate.getTime()) || Number.isNaN(refreshExpiresAtDate.getTime())) {
      throw new Error("토큰 만료시간 형식이 올바르지 않습니다.");
    }

    return {
      accessToken: nextAccessToken,
      refreshToken: nextRefreshToken,
      accessTokenExpiresAt: accessExpiresAtDate.toISOString(),
      refreshTokenExpiresAt: refreshExpiresAtDate.toISOString()
    };
  }

  function applyAuthSession(session: AdminAuthSession | null): void {
    accessToken = session?.accessToken ?? "";
    refreshToken = session?.refreshToken ?? "";
    config.onAuthSession?.(session);
  }

  function clearAuthSession(): void {
    applyAuthSession(null);
    config.onUnauthorized?.();
  }

  async function refreshAuthSession(): Promise<void> {
    if (!refreshToken) {
      throw new ApiError(401, "세션이 만료되었습니다. 다시 로그인해 주세요.");
    }

    const res = await request(
      "/api/admin/refresh",
      {
        method: "POST",
        contentType: "application/json",
        body: JSON.stringify({
          refreshToken
        })
      },
      0,
      false,
      false
    );

    const session = parseAuthSession(res);
    applyAuthSession(session);
  }

  async function ensureRefreshed(): Promise<void> {
    if (!refreshInFlight) {
      refreshInFlight = refreshAuthSession().finally(() => {
        refreshInFlight = null;
      });
    }
    return refreshInFlight;
  }

  async function request(
    path: string,
    options: RequestOptions = {},
    retries = 1,
    requiresAdmin = true,
    allowRefresh = true
  ): Promise<JsonRecord> {
    const headers = new Headers();
    if (requiresAdmin && accessToken) {
      headers.set("x-admin-token", accessToken);
    }
    if (options.contentType) {
      headers.set("content-type", options.contentType);
    }

    const response = await fetch(`${baseUrl}${path}`, {
      method: options.method ?? "GET",
      headers,
      body: options.body ?? null
    });

    if (requiresAdmin && allowRefresh && response.status === 401) {
      try {
        await ensureRefreshed();
      } catch (error) {
        clearAuthSession();
        throw error;
      }
      return request(path, options, retries, requiresAdmin, false);
    }

    if (!response.ok && retries > 0 && response.status >= 500) {
      return request(path, options, retries - 1, requiresAdmin, allowRefresh);
    }

    return parseJsonOrThrow(response);
  }

  async function tryPaths(paths: string[], options: RequestOptions = {}): Promise<JsonRecord> {
    let lastError: unknown;

    for (const path of paths) {
      try {
        return await request(path, options);
      } catch (error) {
        lastError = error;
        if (error instanceof ApiError && error.status === 404) {
          continue;
        }
        throw error;
      }
    }

    throw lastError ?? new Error("Request failed");
  }

  async function uploadViaXhr(
    path: string,
    formData: FormData,
    onProgress?: (p: number) => void,
    allowRefresh = true
  ): Promise<JsonRecord> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", `${baseUrl}${path}`);
      if (accessToken) {
        xhr.setRequestHeader("x-admin-token", accessToken);
      }
      xhr.timeout = 120_000;

      xhr.upload.onprogress = (event) => {
        if (!onProgress || !event.lengthComputable) {
          return;
        }
        const percent = Math.round((event.loaded / event.total) * 100);
        onProgress(percent);
      };

      xhr.onload = () => {
        if (allowRefresh && xhr.status === 401) {
          void ensureRefreshed()
            .then(() => uploadViaXhr(path, formData, onProgress, false))
            .then(resolve)
            .catch((error) => {
              if (error instanceof ApiError && error.status === 401) {
                clearAuthSession();
              }
              reject(error);
            });
          return;
        }

        try {
          const body = xhr.responseText ? (JSON.parse(xhr.responseText) as JsonRecord) : {};
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(body);
            return;
          }
          reject(new ApiError(xhr.status, safeText(body.message) || `Upload failed (${xhr.status})`));
        } catch {
          reject(new ApiError(xhr.status, "Invalid upload response"));
        }
      };

      xhr.onerror = () => reject(new Error(`Upload network error: ${path}`));
      xhr.ontimeout = () => reject(new Error(`Upload timeout: ${path}`));
      xhr.onabort = () => reject(new Error(`Upload aborted: ${path}`));
      xhr.send(formData);
    });
  }

  async function uploadApk(input: {
    file: File;
    packageName?: string;
    versionName?: string;
    versionCode?: number;
    releaseNote?: string;
    onProgress?: (p: number) => void;
  }): Promise<ApkItem> {
    const adminForm = new FormData();
    adminForm.append("apk", input.file);
    if (input.packageName) {
      adminForm.append("packageName", input.packageName);
    }
    if (input.versionName) {
      adminForm.append("versionName", input.versionName);
    }
    if (input.versionCode) {
      adminForm.append("versionCode", String(input.versionCode));
    }
    if (input.releaseNote) {
      adminForm.append("releaseNote", input.releaseNote);
    }

    const legacyForm = new FormData();
    const packageName = input.packageName || input.file.name.replace(/\.apk$/i, "").replace(/[^a-zA-Z0-9_.-]/g, "");
    const appId = packageName.split(".").join("-");

    legacyForm.append("apk", input.file);
    legacyForm.append("appId", appId);
    legacyForm.append("packageName", packageName);
    legacyForm.append("displayName", packageName);
    legacyForm.append("versionName", input.versionName || "1.0.0");
    legacyForm.append("versionCode", String(input.versionCode || 1));
    legacyForm.append("changelog", input.releaseNote || "");
    legacyForm.append("autoUpdate", "true");

    try {
      const legacyRes = await uploadViaXhr("/api/apps/upload", legacyForm, input.onProgress);
      const release = (legacyRes.release as JsonRecord | undefined) ?? {};

      return {
        id: appId,
        appId,
        packageName,
        versionName: safeText(release.versionName),
        versionCode: safeNumber(release.versionCode, -1),
        releaseNote: safeText(release.changelog),
        sha256: safeText(release.sha256),
        fileSize: safeNumber(release.fileSize, 0),
        uploadedAt: toIso(release.uploadedAt),
        downloadUrl: safeText(release.downloadUrl) || undefined
      };
    } catch (error) {
      if (!shouldFallbackUpload(error)) {
        throw error;
      }
    }

    const adminRes = await uploadViaXhr("/admin/apks/upload", adminForm, input.onProgress);
    const item = (adminRes.apk ?? adminRes.release ?? adminRes) as JsonRecord;
    return mapAdminApk(item);
  }

  async function login(input: { id: string; password: string }): Promise<AdminAuthSession> {
    const res = await request(
      "/api/admin/login",
      {
        method: "POST",
        contentType: "application/json",
        body: JSON.stringify(input)
      },
      0,
      false
    );

    const session = parseAuthSession(res);
    applyAuthSession(session);
    return session;
  }

  async function listApks(filters: ApkListFilters = {}): Promise<ApkItem[]> {
    const query = new URLSearchParams();
    if (filters.query) {
      query.set("query", filters.query);
    }
    if (filters.packageName) {
      query.set("packageName", filters.packageName);
    }
    if (filters.latestOnly) {
      query.set("latestOnly", "true");
    }

    try {
      const adminRes = await request(`/admin/apks?${query.toString()}`);
      const list = (adminRes.items as JsonRecord[] | undefined) ?? (adminRes.apks as JsonRecord[] | undefined) ?? [];
      return list.map(mapAdminApk);
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 404) {
        throw error;
      }
    }

    const legacy = await request("/api/apps");
    let items = ((legacy.apps as JsonRecord[] | undefined) ?? []).map(mapLegacyApp);

    if (filters.query) {
      const q = filters.query.toLowerCase();
      items = items.filter((item) => item.packageName.toLowerCase().includes(q) || item.appId?.toLowerCase().includes(q));
    }

    if (filters.packageName) {
      const q = filters.packageName.toLowerCase();
      items = items.filter((item) => item.packageName.toLowerCase().includes(q));
    }

    return items.sort((a, b) => (a.packageName + a.versionCode).localeCompare(b.packageName + b.versionCode));
  }

  async function getApk(apkId: string): Promise<ApkDetail> {
    try {
      const admin = await request(`/admin/apks/${encodeURIComponent(apkId)}`);
      const apk = mapAdminApk((admin.apk as JsonRecord | undefined) ?? admin);
      const versionsRaw = (admin.versions as JsonRecord[] | undefined) ?? [];
      const versions = versionsRaw.map(mapAdminApk);
      return { apk, versions };
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 404) {
        throw error;
      }
    }

    const legacyReleases = await tryPaths([
      `/api/apps/${encodeURIComponent(apkId)}/releases`,
      `/api/apps/${encodeURIComponent(apkId.replace(/\./g, "-"))}/releases`
    ]);

    const releases = ((legacyReleases.releases as JsonRecord[] | undefined) ?? []).map((release) => ({
      id: safeText(release.id),
      appId: safeText(legacyReleases.appId),
      packageName: safeText(release.packageName),
      versionName: safeText(release.versionName),
      versionCode: safeNumber(release.versionCode, -1),
      releaseNote: safeText(release.changelog),
      sha256: safeText(release.sha256),
      fileSize: safeNumber(release.fileSize, 0),
      uploadedAt: toIso(release.uploadedAt),
      downloadUrl: safeText(release.downloadUrl) || undefined
    }));

    return {
      apk: releases[0] ?? null,
      versions: releases
    };
  }

  async function listDevices(filters: DeviceListFilters = {}): Promise<DeviceItem[]> {
    const query = new URLSearchParams();
    if (filters.query) {
      query.set("query", filters.query);
    }
    const adminRes = await request(`/admin/devices?${query.toString()}`);
    const list = ((adminRes.items as JsonRecord[] | undefined) ?? (adminRes.devices as JsonRecord[] | undefined) ?? []).map(mapDevice);
    return filterDevices(list, filters);
  }

  async function getDevice(deviceId: string): Promise<DeviceItem> {
    const adminRes = await request(`/admin/devices/${encodeURIComponent(deviceId)}`);
    return mapDevice((adminRes.device as JsonRecord | undefined) ?? adminRes);
  }

  async function listStoreDevices(filters: { query?: string } = {}): Promise<StoreDeviceSummary[]> {
    const query = new URLSearchParams();
    if (filters.query) {
      query.set("query", filters.query);
    }

    const adminRes = await request(`/admin/store/devices?${query.toString()}`);
    const list =
      ((adminRes.devices as JsonRecord[] | undefined) ??
        (adminRes.items as JsonRecord[] | undefined) ??
        []) as JsonRecord[];

    return list
      .map(mapStoreDeviceSummary)
      .sort((a, b) => Date.parse(b.lastSyncedAt || "") - Date.parse(a.lastSyncedAt || ""));
  }

  async function getStoreDevice(deviceId: string): Promise<StoreDeviceDetail> {
    const adminRes = await request(`/admin/store/devices/${encodeURIComponent(deviceId)}`);
    return mapStoreDeviceDetail((adminRes.device as JsonRecord | undefined) ?? adminRes);
  }

  async function listStoreEvents(filters: {
    deviceId?: string;
    packageName?: string;
    limit?: number;
  } = {}): Promise<StoreUpdateEvent[]> {
    const query = new URLSearchParams();
    if (filters.deviceId) {
      query.set("deviceId", filters.deviceId);
    }
    if (filters.packageName) {
      query.set("packageName", filters.packageName);
    }
    if (typeof filters.limit === "number") {
      query.set("limit", String(filters.limit));
    }

    const adminRes = await request(`/admin/store/events?${query.toString()}`);
    const list =
      ((adminRes.events as JsonRecord[] | undefined) ??
        (adminRes.items as JsonRecord[] | undefined) ??
        []) as JsonRecord[];
    return list.map(mapStoreUpdateEvent);
  }

  async function createDevice(input: CreateDeviceInput): Promise<DeviceItem> {
    const adminRes = await request("/admin/devices", {
      method: "POST",
      contentType: "application/json",
      body: JSON.stringify({
        deviceType: input.deviceType,
        modelName: input.modelName,
        location: {
          name: input.locationName,
          lat: input.lat,
          lng: input.lng
        }
      })
    });

    return mapDevice((adminRes.device as JsonRecord | undefined) ?? adminRes);
  }

  async function previewNextDevice(deviceType: CreateDeviceInput["deviceType"]): Promise<NextDevicePreview> {
    const query = new URLSearchParams({
      deviceType
    });
    const adminRes = await request(`/admin/devices/next-id?${query.toString()}`);

    const deviceId = safeText(adminRes.deviceId).trim();
    if (!deviceId) {
      throw new Error("다음 deviceId 조회에 실패했습니다.");
    }

    const modules = Array.isArray(adminRes.modules)
      ? adminRes.modules
          .map((module) => {
            const info = module as JsonRecord;
            const name = safeText(info.name).trim();
            const portNumber = optionalNumber(info.portNumber);
            if (!name || typeof portNumber !== "number") {
              return null;
            }
            return { name, portNumber };
          })
          .filter((module): module is NonNullable<typeof module> => module !== null)
      : [];

    return {
      deviceId,
      modules
    };
  }

  async function createDeviceCommand(deviceId: string, input: CreateCommandInput): Promise<DeviceCommandRecord> {
    const body = JSON.stringify({
      type: input.type,
      payload: input.payload ?? {},
      requestedBy: input.requestedBy ?? "web-admin"
    });

    try {
      const adminRes = await request(`/admin/devices/${encodeURIComponent(deviceId)}/commands`, {
        method: "POST",
        contentType: "application/json",
        body
      });
      return mapCommand((adminRes.command as JsonRecord | undefined) ?? adminRes);
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 404) {
        throw error;
      }
    }

    const legacyRes = await request("/api/commands", {
      method: "POST",
      contentType: "application/json",
      body: JSON.stringify({
        deviceId,
        type: input.type,
        payload: input.payload ?? {}
      })
    });
    return mapCommand((legacyRes.command as JsonRecord | undefined) ?? legacyRes);
  }

  async function listDeviceCommands(deviceId: string, limit = 50): Promise<DeviceCommandRecord[]> {
    try {
      const adminRes = await request(`/admin/devices/${encodeURIComponent(deviceId)}/commands?limit=${limit}`);
      const commands = ((adminRes.commands as JsonRecord[] | undefined) ?? []).map(mapCommand);
      return commands.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 404) {
        throw error;
      }
    }

    const legacy = await request(`/api/commands?deviceId=${encodeURIComponent(deviceId)}`);
    const commands = ((legacy.commands as JsonRecord[] | undefined) ?? []).map(mapCommand);
    return commands.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).slice(0, limit);
  }

  async function getCommand(commandId: string): Promise<DeviceCommandRecord> {
    try {
      const adminRes = await request(`/admin/commands/${encodeURIComponent(commandId)}`);
      return mapCommand((adminRes.command as JsonRecord | undefined) ?? adminRes);
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 404) {
        throw error;
      }
    }

    const legacy = await request("/api/commands");
    const found = ((legacy.commands as JsonRecord[] | undefined) ?? [])
      .map(mapCommand)
      .find((item) => item.id === commandId);

    if (!found) {
      throw new Error(`Command not found: ${commandId}`);
    }

    return found;
  }

  return {
    login,
    uploadApk,
    listApks,
    getApk,
    listDevices,
    getDevice,
    listStoreDevices,
    getStoreDevice,
    listStoreEvents,
    createDevice,
    previewNextDevice,
    createDeviceCommand,
    listDeviceCommands,
    getCommand
  };
}
