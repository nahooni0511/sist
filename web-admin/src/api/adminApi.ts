import {
  AdminApiConfig,
  ApkDetail,
  ApkItem,
  ApkListFilters,
  CreateCommandInput,
  DeviceCommandRecord,
  DeviceItem,
  DeviceListFilters
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
    deviceKey: safeText(item.deviceKey) || undefined,
    deviceName: safeText(item.deviceName || item.alias) || undefined,
    model: safeText(item.model) || undefined,
    osVersion: safeText(item.osVersion) || undefined,
    status,
    lastSeen: toIso(item.lastSeen || item.lastSeenAt || item.updatedAt),
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
      : undefined
  };
}

function buildDummyDevices(): DeviceItem[] {
  const now = Date.now();
  const toSeen = (minutesAgo: number) => new Date(now - minutesAgo * 60_000).toISOString();

  return [
    {
      deviceId: "park-seoul-001",
      deviceKey: "devkey-park-seoul-001",
      deviceName: "서울숲 A-01",
      model: "Sistrun 32A",
      osVersion: "Android 11",
      status: "online",
      lastSeen: toSeen(1),
      locationName: "서울숲 중앙광장",
      lat: 37.54485,
      lng: 127.03772,
      groupName: "서울숲",
      installedApps: [
        { packageName: "com.sistrun.core_dpc", versionName: "1.3.2", versionCode: 10302 },
        { packageName: "com.sistrun.manager", versionName: "2.4.0", versionCode: 20400 }
      ]
    },
    {
      deviceId: "park-seoul-002",
      deviceKey: "devkey-park-seoul-002",
      deviceName: "서울숲 A-02",
      model: "Sistrun 32A",
      osVersion: "Android 11",
      status: "offline",
      lastSeen: toSeen(142),
      locationName: "서울숲 분수대",
      lat: 37.54349,
      lng: 127.04014,
      groupName: "서울숲",
      installedApps: [
        { packageName: "com.sistrun.core_dpc", versionName: "1.3.1", versionCode: 10301 },
        { packageName: "com.sistrun.manager", versionName: "2.3.8", versionCode: 20308 }
      ]
    },
    {
      deviceId: "park-busan-001",
      deviceKey: "devkey-park-busan-001",
      deviceName: "부산시민공원 B-01",
      model: "Sistrun 32B",
      osVersion: "Android 12",
      status: "online",
      lastSeen: toSeen(4),
      locationName: "부산시민공원 북문",
      lat: 35.1687,
      lng: 129.0576,
      groupName: "부산시민공원",
      installedApps: [
        { packageName: "com.sistrun.core_dpc", versionName: "1.3.2", versionCode: 10302 },
        { packageName: "com.sistrun.manager", versionName: "2.4.0", versionCode: 20400 }
      ]
    },
    {
      deviceId: "park-incheon-001",
      deviceKey: "devkey-park-incheon-001",
      deviceName: "센트럴파크 C-01",
      model: "Sistrun 32A",
      osVersion: "Android 10",
      status: "unknown",
      lastSeen: toSeen(720),
      locationName: "송도 센트럴파크 동측",
      lat: 37.3929,
      lng: 126.6397,
      groupName: "센트럴파크",
      installedApps: [
        { packageName: "com.sistrun.core_dpc", versionName: "1.2.9", versionCode: 10209 },
        { packageName: "com.sistrun.manager", versionName: "2.2.5", versionCode: 20205 }
      ]
    },
    {
      deviceId: "park-daegu-001",
      deviceKey: "devkey-park-daegu-001",
      deviceName: "두류공원 D-01",
      model: "Sistrun 32C",
      osVersion: "Android 12",
      status: "offline",
      lastSeen: toSeen(360),
      locationName: "두류공원 문화예술회관 앞",
      lat: 35.8561,
      lng: 128.557,
      groupName: "두류공원",
      installedApps: [
        { packageName: "com.sistrun.core_dpc", versionName: "1.3.0", versionCode: 10300 },
        { packageName: "com.sistrun.manager", versionName: "2.3.0", versionCode: 20300 }
      ]
    }
  ];
}

function filterDevices(devices: DeviceItem[], filters: DeviceListFilters): DeviceItem[] {
  let result = devices;

  if (filters.query) {
    const q = filters.query.toLowerCase();
    result = result.filter((d) =>
      [d.deviceId, d.deviceKey, d.deviceName, d.locationName, d.groupName].some((v) => safeText(v).toLowerCase().includes(q))
    );
  }

  if (filters.status && filters.status !== "all") {
    result = result.filter((d) => d.status === filters.status);
  }

  if (filters.hasLocation) {
    result = result.filter((d) => Number.isFinite(d.lat) && Number.isFinite(d.lng));
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

export function createAdminApi(config: AdminApiConfig) {
  const baseUrl = config.baseUrl.replace(/\/$/, "");

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

  async function request(path: string, options: RequestOptions = {}, retries = 1): Promise<JsonRecord> {
    const headers = new Headers();
    headers.set("x-admin-token", config.adminToken);
    if (options.contentType) {
      headers.set("content-type", options.contentType);
    }

    const response = await fetch(`${baseUrl}${path}`, {
      method: options.method ?? "GET",
      headers,
      body: options.body ?? null
    });

    if (!response.ok && retries > 0 && response.status >= 500) {
      return request(path, options, retries - 1);
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

  async function uploadViaXhr(path: string, formData: FormData, onProgress?: (p: number) => void): Promise<JsonRecord> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", `${baseUrl}${path}`);
      xhr.setRequestHeader("x-admin-token", config.adminToken);
      xhr.timeout = 120_000;

      xhr.upload.onprogress = (event) => {
        if (!onProgress || !event.lengthComputable) {
          return;
        }
        const percent = Math.round((event.loaded / event.total) * 100);
        onProgress(percent);
      };

      xhr.onload = () => {
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
    let lastError: unknown;
    const query = new URLSearchParams();
    if (filters.query) {
      query.set("query", filters.query);
    }
    if (filters.status && filters.status !== "all") {
      query.set("status", filters.status);
    }
    if (filters.hasLocation) {
      query.set("hasLocation", "true");
    }

    try {
      const adminRes = await request(`/admin/devices?${query.toString()}`);
      const list = ((adminRes.items as JsonRecord[] | undefined) ?? (adminRes.devices as JsonRecord[] | undefined) ?? []).map(mapDevice);
      if (list.length > 0) {
        return filterDevices(list, filters);
      }
    } catch (error) {
      lastError = error;
      if (!(error instanceof ApiError) || error.status !== 404) {
        // Fall through to legacy endpoints and, in dev, seeded data.
      }
    }

    try {
      const legacy = await request("/api/commands");
      const commands = ((legacy.commands as JsonRecord[] | undefined) ?? []).map(mapCommand);
      const now = Date.now();
      const byDevice = new Map<string, DeviceItem>();

      commands.forEach((command) => {
        if (!command.deviceId) {
          return;
        }
        const lastSeen = Date.parse(command.updatedAt);
        const prev = byDevice.get(command.deviceId);
        const status: DeviceItem["status"] = now - lastSeen < 5 * 60_000 ? "online" : "offline";
        if (!prev || Date.parse(prev.lastSeen || "1970-01-01") < lastSeen) {
          byDevice.set(command.deviceId, {
            deviceId: command.deviceId,
            deviceName: command.deviceId,
            status,
            lastSeen: command.updatedAt,
            model: "unknown",
            osVersion: "unknown"
          });
        }
      });

      const legacyDevices = filterDevices(Array.from(byDevice.values()), filters);
      if (legacyDevices.length > 0) {
        return legacyDevices;
      }
    } catch (error) {
      lastError = error;
      // Ignore and fallback to seeded demo data in development.
    }

    if (!import.meta.env.DEV) {
      if (lastError) {
        throw lastError;
      }
      return [];
    }

    return filterDevices(buildDummyDevices(), filters);
  }

  async function getDevice(deviceId: string): Promise<DeviceItem> {
    try {
      const adminRes = await request(`/admin/devices/${encodeURIComponent(deviceId)}`);
      return mapDevice((adminRes.device as JsonRecord | undefined) ?? adminRes);
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 404) {
        throw error;
      }
    }

    const devices = await listDevices();
    const found = devices.find((d) => d.deviceId === deviceId);
    if (!found) {
      throw new Error(`Device not found: ${deviceId}`);
    }
    return found;
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
    uploadApk,
    listApks,
    getApk,
    listDevices,
    getDevice,
    createDeviceCommand,
    listDeviceCommands,
    getCommand
  };
}
