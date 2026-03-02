import { Platform } from "react-native";
import {
  AppListResponse,
  StoreApp,
  StoreEventInput,
  StoreSyncPackage,
  StoreSyncResponse,
  StoreSyncUpdate
} from "./types";

function normalizeBaseUrl(value: string): string {
  return value.trim().replace(/\/$/, "");
}

const envBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();
const platformBaseUrls =
  Platform.OS === "android"
    ? ["http://10.0.2.2:4000", "http://127.0.0.1:4000", "http://localhost:4000"]
    : ["http://localhost:4000"];

const BASE_URL_CANDIDATES = Array.from(
  new Set([envBaseUrl, ...platformBaseUrls].filter((value): value is string => Boolean(value)).map(normalizeBaseUrl))
);

export const API_BASE_URL = BASE_URL_CANDIDATES[0] ?? "http://localhost:4000";
let activeBaseUrl = API_BASE_URL;
let consecutiveFailures = 0;
let circuitOpenedAtMs = 0;

const CIRCUIT_BREAKER_THRESHOLD = 3;
const CIRCUIT_BREAKER_COOLDOWN_MS = 20_000;
const RETRY_MAX_ATTEMPTS = 3;
const RETRY_BACKOFF_BASE_MS = 500;
const APPS_CACHE_TTL_MS = 30_000;

let appsCache: {
  fetchedAtMs: number;
  apps: StoreApp[];
} | null = null;

type JsonRecord = Record<string, unknown>;

class RequestError extends Error {
  readonly retryable: boolean;

  constructor(message: string, retryable: boolean) {
    super(message);
    this.retryable = retryable;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function safeText(value: unknown, fallback = ""): string {
  if (typeof value === "string") {
    return value;
  }
  if (value === null || value === undefined) {
    return fallback;
  }
  return String(value);
}

function safeNumber(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeApp(raw: Record<string, unknown>): StoreApp | null {
  const release = (raw.latestRelease as Record<string, unknown> | undefined) ?? {};

  const appId = safeText(raw.appId).trim();
  const packageName = safeText(raw.packageName).trim();
  const displayName = safeText(raw.displayName).trim() || packageName;

  if (!appId || !packageName) {
    return null;
  }

  return {
    appId,
    packageName,
    displayName,
    latestRelease: {
      id: safeText(release.id) || `${appId}-${safeNumber(release.versionCode, 0)}`,
      versionName: safeText(release.versionName, "0.0.0"),
      versionCode: safeNumber(release.versionCode, 0),
      changelog: safeText(release.changelog),
      autoUpdate: Boolean(release.autoUpdate),
      uploadedAt: safeText(release.uploadedAt),
      fileSize: safeNumber(release.fileSize, 0),
      sha256: safeText(release.sha256),
      downloadUrl: safeText(release.downloadUrl),
      signerSha256: safeText(release.signerSha256 || release.signer_sha256) || undefined
    }
  };
}

function normalizeSyncUpdate(raw: Record<string, unknown>): StoreSyncUpdate | null {
  const appId = safeText(raw.appId).trim();
  const releaseId = safeText(raw.releaseId).trim();
  const packageName = safeText(raw.packageName).trim();
  if (!appId || !releaseId || !packageName) {
    return null;
  }

  return {
    appId,
    releaseId,
    packageName,
    displayName: safeText(raw.displayName) || packageName,
    installedVersionCode: safeNumber(raw.installedVersionCode, -1),
    targetVersionCode: safeNumber(raw.targetVersionCode, 0),
    targetVersionName: safeText(raw.targetVersionName, "0.0.0"),
    changelog: safeText(raw.changelog),
    sha256: safeText(raw.sha256),
    fileSize: safeNumber(raw.fileSize, 0),
    uploadedAt: safeText(raw.uploadedAt),
    autoUpdate: Boolean(raw.autoUpdate),
    downloadUrl: safeText(raw.downloadUrl),
    signerSha256: safeText(raw.signerSha256 || raw.signer_sha256) || undefined
  };
}

function shouldRetryByError(error: unknown): boolean {
  if (error instanceof RequestError) {
    return error.retryable;
  }
  return true;
}

function isCircuitOpen(): boolean {
  if (consecutiveFailures < CIRCUIT_BREAKER_THRESHOLD) {
    return false;
  }
  return Date.now() - circuitOpenedAtMs < CIRCUIT_BREAKER_COOLDOWN_MS;
}

function recordFailure(): void {
  consecutiveFailures += 1;
  if (consecutiveFailures >= CIRCUIT_BREAKER_THRESHOLD && circuitOpenedAtMs <= 0) {
    circuitOpenedAtMs = Date.now();
  }
}

function recordSuccess(): void {
  consecutiveFailures = 0;
  circuitOpenedAtMs = 0;
}

async function requestWithFallback<T>(runner: (baseUrl: string) => Promise<T>): Promise<T> {
  if (isCircuitOpen()) {
    throw new Error("서버 일시 장애(circuit open). 잠시 후 다시 시도해 주세요.");
  }

  const orderedBaseUrls = [activeBaseUrl, ...BASE_URL_CANDIDATES.filter((baseUrl) => baseUrl !== activeBaseUrl)];
  let lastError: unknown = null;

  for (const baseUrl of orderedBaseUrls) {
    for (let attempt = 1; attempt <= RETRY_MAX_ATTEMPTS; attempt += 1) {
      try {
        const result = await runner(baseUrl);
        activeBaseUrl = baseUrl;
        recordSuccess();
        return result;
      } catch (error) {
        lastError = error;
        if (!shouldRetryByError(error)) {
          recordFailure();
          throw error;
        }

        if (attempt < RETRY_MAX_ATTEMPTS) {
          const backoff = RETRY_BACKOFF_BASE_MS * 2 ** (attempt - 1);
          await sleep(backoff);
          continue;
        }
      }
    }
  }

  recordFailure();
  throw lastError ?? new Error("요청 실패");
}

async function parseJsonResponse(response: Response): Promise<JsonRecord> {
  const text = await response.text();
  if (!text) {
    return {};
  }
  try {
    return JSON.parse(text) as JsonRecord;
  } catch {
    return { message: text };
  }
}

async function postJson(path: string, body: JsonRecord): Promise<JsonRecord> {
  return requestWithFallback(async (baseUrl) => {
    let response: Response;
    try {
      response = await fetch(`${baseUrl}${path}`, {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify(body)
      });
    } catch (error) {
      throw new RequestError(error instanceof Error ? error.message : "네트워크 오류", true);
    }

    const payload = await parseJsonResponse(response);
    if (!response.ok) {
      throw new RequestError(
        safeText(payload.message) || `요청 실패 (${response.status})`,
        response.status >= 500
      );
    }

    return payload;
  });
}

async function getJson(path: string, signal?: AbortSignal): Promise<JsonRecord> {
  return requestWithFallback(async (baseUrl) => {
    let response: Response;
    try {
      response = await fetch(`${baseUrl}${path}`, {
        method: "GET",
        signal
      });
    } catch (error) {
      throw new RequestError(error instanceof Error ? error.message : "네트워크 오류", true);
    }

    const payload = await parseJsonResponse(response);
    if (!response.ok) {
      throw new RequestError(
        safeText(payload.message) || `요청 실패 (${response.status})`,
        response.status >= 500
      );
    }

    return payload;
  });
}

export function getCurrentApiBaseUrl(): string {
  return activeBaseUrl;
}

export async function fetchStoreApps(signal?: AbortSignal): Promise<StoreApp[]> {
  if (appsCache && Date.now() - appsCache.fetchedAtMs < APPS_CACHE_TTL_MS) {
    return appsCache.apps;
  }

  const payload = (await getJson("/api/apps", signal)) as AppListResponse;
  const apps = Array.isArray(payload.apps) ? payload.apps : [];

  const normalizedApps = apps
    .map((item) => normalizeApp(item as Record<string, unknown>))
    .filter((item): item is StoreApp => item !== null)
    .sort((a, b) => a.displayName.localeCompare(b.displayName));

  appsCache = {
    fetchedAtMs: Date.now(),
    apps: normalizedApps
  };
  return normalizedApps;
}

export async function syncStoreDevice(input: {
  deviceId: string;
  deviceName?: string;
  modelName?: string;
  platform?: string;
  osVersion?: string;
  appStoreVersion?: string;
  ipAddress?: string;
  packages: StoreSyncPackage[];
}): Promise<StoreSyncResponse> {
  const payload = await postJson("/api/store/devices/sync", {
    deviceId: input.deviceId,
    deviceName: input.deviceName,
    modelName: input.modelName,
    platform: input.platform,
    osVersion: input.osVersion,
    appStoreVersion: input.appStoreVersion,
    ipAddress: input.ipAddress,
    packages: input.packages
  });

  const updates = Array.isArray(payload.updates)
    ? payload.updates
        .map((item) => normalizeSyncUpdate(item as Record<string, unknown>))
        .filter((item): item is StoreSyncUpdate => item !== null)
    : [];

  return {
    deviceId: safeText(payload.deviceId, input.deviceId),
    syncedAt: safeText(payload.syncedAt),
    updates
  };
}

export async function postStoreEvent(deviceId: string, input: StoreEventInput): Promise<void> {
  await postJson(`/api/store/devices/${encodeURIComponent(deviceId)}/events`, {
    packageName: input.packageName,
    appId: input.appId,
    releaseId: input.releaseId,
    targetVersionName: input.targetVersionName,
    targetVersionCode: input.targetVersionCode,
    eventType: input.eventType,
    status: input.status,
    message: input.message,
    metadata: input.metadata
  });
}
