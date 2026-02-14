import { Client, ItemBucketMetadata } from "minio";
import fs from "node:fs";

export type MinioConfig = {
  host: string;
  accessKey: string;
  secretKey: string;
  bucketName: string;
  region?: string;
};

export type ObjectStat = {
  size?: number;
  etag?: string;
  contentType?: string;
  lastModified?: Date;
};

const APK_OBJECT_PREFIX = "apk/";

export class MinioObjectStorage {
  private readonly bucketName: string;
  private readonly client: Client;

  constructor(config: MinioConfig) {
    const parsed = parseHost(config.host);
    this.bucketName = config.bucketName;
    this.client = new Client({
      endPoint: parsed.endPoint,
      port: parsed.port,
      useSSL: parsed.useSSL,
      accessKey: config.accessKey,
      secretKey: config.secretKey,
      region: config.region
    });
  }

  async init(): Promise<void> {
    const exists = await this.client.bucketExists(this.bucketName);
    if (!exists) {
      await this.client.makeBucket(this.bucketName);
    }
  }

  async uploadFile(params: {
    objectName: string;
    localPath: string;
    contentType?: string;
  }): Promise<void> {
    const stream = fs.createReadStream(params.localPath);
    const stats = fs.statSync(params.localPath);
    const metaData: Record<string, string> = {};
    if (params.contentType) {
      metaData["Content-Type"] = params.contentType;
    }

    await this.client.putObject(
      this.bucketName,
      toPreferredObjectKey(params.objectName),
      stream,
      stats.size,
      metaData
    );
  }

  async getObject(objectName: string): Promise<NodeJS.ReadableStream> {
    return this.withObjectFallback(objectName, (key) => this.client.getObject(this.bucketName, key));
  }

  async statObject(objectName: string): Promise<ObjectStat> {
    const stat = await this.withObjectFallback(
      objectName,
      (key) => this.client.statObject(this.bucketName, key)
    );
    const metaData = normalizeMetadata(stat.metaData);
    return {
      size: stat.size,
      etag: stat.etag,
      contentType: metaData["content-type"],
      lastModified: stat.lastModified
    };
  }

  async removeObject(objectName: string): Promise<void> {
    await this.withObjectFallback(objectName, (key) => this.client.removeObject(this.bucketName, key));
  }

  private async withObjectFallback<T>(objectName: string, action: (key: string) => Promise<T>): Promise<T> {
    const candidates = objectKeyCandidates(objectName);
    let lastError: unknown;

    for (const key of candidates) {
      try {
        return await action(key);
      } catch (error) {
        lastError = error;
        if (!isObjectNotFound(error)) {
          throw error;
        }
      }
    }

    throw lastError ?? new Error("Object not found");
  }
}

function normalizeMetadata(metaData: ItemBucketMetadata | null | undefined): Record<string, string> {
  if (!metaData) {
    return {};
  }
  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(metaData)) {
    normalized[key.toLowerCase()] = String(value);
  }
  return normalized;
}

function normalizeObjectName(objectName: string): string {
  return objectName.trim().replace(/^\/+/, "");
}

function toPreferredObjectKey(objectName: string): string {
  const normalized = normalizeObjectName(objectName);
  if (normalized.startsWith(APK_OBJECT_PREFIX)) {
    return normalized;
  }
  return `${APK_OBJECT_PREFIX}${normalized}`;
}

function objectKeyCandidates(objectName: string): string[] {
  const normalized = normalizeObjectName(objectName);
  const preferred = toPreferredObjectKey(normalized);
  if (preferred === normalized) {
    return [preferred];
  }
  return [preferred, normalized];
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

function parseHost(host: string): { endPoint: string; port: number; useSSL: boolean } {
  const raw = host.trim();
  if (!raw) {
    throw new Error("MINIO_HOST 값이 비어 있습니다.");
  }

  if (raw.startsWith("http://") || raw.startsWith("https://")) {
    const url = new URL(raw);
    return {
      endPoint: url.hostname,
      port: url.port ? Number(url.port) : url.protocol === "https:" ? 443 : 80,
      useSSL: url.protocol === "https:"
    };
  }

  const [endpointPart, portPart] = raw.split(":");
  if (!endpointPart) {
    throw new Error("MINIO_HOST 형식이 올바르지 않습니다.");
  }

  if (!portPart) {
    return {
      endPoint: endpointPart,
      port: 9000,
      useSSL: false
    };
  }

  const port = Number(portPart);
  if (!Number.isFinite(port)) {
    throw new Error("MINIO_HOST 포트 값이 숫자가 아닙니다.");
  }

  return {
    endPoint: endpointPart,
    port,
    useSSL: false
  };
}
