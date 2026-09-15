import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  PutBucketCorsCommand,
  S3Client,
  type S3ClientConfig,
  S3ServiceException,
  DeleteObjectsCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createHmac } from "node:crypto";
import { createReadStream, createWriteStream, statSync } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import type { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

function createHmacSignature(secret: string, value: string): string {
  return createHmac("sha256", secret).update(value, "utf8").digest("base64url");
}

function normalizeCdnTokenTtlSeconds(value: number | undefined): number {
  return Math.max(60, Math.min(86_400, Math.floor(value ?? 900)));
}

export interface StorageOptions extends Partial<S3ClientConfig> {
  bucket: string;
  endpoint?: string;
  /** Reject object-storage writes whose key is not visibility-prefixed. */
  requireVisibilityPrefix?: boolean;
  /** Public CDN origin mapped to the storage bucket root, if configured. */
  publicBaseUrl?: string;
  /** Secret shared with the CDN Worker for short-lived HMAC access tokens. */
  cdnSigningSecret?: string;
  /** Lifetime for normal protected-media HMAC tokens issued by this facade. */
  cdnTokenTtlSeconds?: number;
  /** Lifetime for protected HLS segment HMAC tokens issued by this facade. */
  cdnHlsTokenTtlSeconds?: number;
  /** Prefixes served without a token by the CDN Worker. */
  cdnPublicFolders?: readonly string[];
  region?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  forcePathStyle?: boolean;
  client?: S3Client;
  [key: string]: unknown;
}

export interface DownloadObjectOptions {
  signal?: AbortSignal;
}

export interface GetObjectOptions {
  /** Optional inclusive HTTP byte range, for example `bytes=0-31`. */
  range?: string;
}

export interface StorageUploadItem {
  localFilePath: string;
  key: string;
  filename?: string;
  contentType?: string;
}

export type StorageVisibility = "public" | "protected";

/**
 * Returns a normalized key when it starts with the visibility namespace used
 * by the media bucket. Keeping this check in the storage adapter prevents a
 * newly added API upload path from accidentally bypassing CDN access rules.
 */
export function assertVisibilityPrefixedKey(key: string): string {
  const normalized = key.replace(/^\/+/, "");
  if (
    !normalized.startsWith("public/") &&
    !normalized.startsWith("protected/")
  ) {
    throw new Error(
      "Storage object keys must start with public/ or protected/.",
    );
  }
  return normalized;
}

export class S3StorageService {
  private client: S3Client;
  private bucket: string;
  private publicBaseUrl: string | null;
  private cdnSigningSecret: string | null;
  private cdnTokenTtlSeconds: number;
  private cdnHlsTokenTtlSeconds: number;
  private cdnPublicFolders: readonly string[];
  private requireVisibilityPrefix: boolean;
  private bucketCorsEnsured: Promise<void> | null = null;

  constructor(options: StorageOptions) {
    if (!options.bucket) {
      throw new Error("Storage bucket name is required.");
    }
    this.bucket = options.bucket;
    this.publicBaseUrl =
      options.publicBaseUrl?.trim().replace(/\/+$/, "") || null;
    this.cdnSigningSecret = options.cdnSigningSecret?.trim() || null;
    this.cdnTokenTtlSeconds = normalizeCdnTokenTtlSeconds(
      options.cdnTokenTtlSeconds,
    );
    this.cdnHlsTokenTtlSeconds = normalizeCdnTokenTtlSeconds(
      options.cdnHlsTokenTtlSeconds,
    );
    this.requireVisibilityPrefix = options.requireVisibilityPrefix ?? false;
    this.cdnPublicFolders = (
      options.cdnPublicFolders ?? [
        "public",
        "thumbnails",
        "course-hls",
        "course-videos",
      ]
    )
      .map((folder) => folder.trim().replace(/^\/+|\/+$/g, ""))
      .filter(Boolean);

    if (options.client) {
      this.client = options.client;
    } else {
      const {
        bucket: _bucket,
        client: _client,
        requireVisibilityPrefix: _requireVisibilityPrefix,
        publicBaseUrl: _publicBaseUrl,
        cdnSigningSecret: _cdnSigningSecret,
        cdnTokenTtlSeconds: _cdnTokenTtlSeconds,
        cdnHlsTokenTtlSeconds: _cdnHlsTokenTtlSeconds,
        cdnPublicFolders: _cdnPublicFolders,
        accessKeyId,
        secretAccessKey,
        region = "us-east-1",
        endpoint,
        forcePathStyle,
        credentials: explicitCredentials,
        ...restClientOptions
      } = options;

      const credentials =
        explicitCredentials ??
        (accessKeyId && secretAccessKey
          ? {
              accessKeyId,
              secretAccessKey,
            }
          : undefined);

      this.client = new S3Client({
        region,
        endpoint,
        forcePathStyle,
        credentials,
        ...restClientOptions,
      });
    }
  }

  getClient(): S3Client {
    return this.client;
  }

  getBucket(): string {
    return this.bucket;
  }

  private keyForWrite(key: string): string {
    return this.requireVisibilityPrefix
      ? assertVisibilityPrefixedKey(key)
      : key;
  }

  /**
   * Resolves a storage key against the configured public CDN origin. This is
   * intentionally opt-in; callers must never infer a public URL from the
   * private S3 endpoint.
   */
  getPublicObjectUrl(key: string): string | null {
    if (!this.publicBaseUrl) return null;

    const encodedKey = key
      .replace(/^\/+/, "")
      .split("/")
      .map((segment) => encodeURIComponent(segment))
      .join("/");
    return `${this.publicBaseUrl}/${encodedKey}`;
  }

  /** Resolves a storage key against the configured CDN URL. */
  getCdnObjectUrl(key: string, token?: string): string | null {
    const url = this.getPublicObjectUrl(key);
    if (!url) return null;
    if (!token) return url;

    const hashIndex = url.indexOf("#");
    const hash = hashIndex === -1 ? "" : url.slice(hashIndex);
    const withoutHash = hashIndex === -1 ? url : url.slice(0, hashIndex);
    const separator = withoutHash.includes("?") ? "&" : "?";
    return `${withoutHash}${separator}veo_token=${encodeURIComponent(token)}${hash}`;
  }

  /** Returns whether the object is in a configured public prefix. */
  isCdnPublicKey(key: string): boolean {
    const normalized = key.replace(/^\/+/, "");
    return this.cdnPublicFolders.some(
      (folder) => normalized === folder || normalized.startsWith(`${folder}/`),
    );
  }

  /** Creates a Worker-compatible HMAC token scoped to a key or key prefix. */
  createCdnAccessToken(key: string, expiresAt?: number): string | null {
    if (!this.cdnSigningSecret) return null;
    const normalizedKey = key.replace(/^\/+|\/+$/g, "");
    if (!normalizedKey) return null;
    const expiry =
      expiresAt ?? Math.floor(Date.now() / 1000) + this.cdnTokenTtlSeconds;
    const payload = Buffer.from(
      JSON.stringify({ v: 1, k: normalizedKey, e: Math.floor(expiry) }),
      "utf8",
    ).toString("base64url");
    const signature = createHmacSignature(this.cdnSigningSecret, payload);
    return `${payload}.${signature}`;
  }

  getCdnTokenTtlSeconds(): number {
    return this.cdnTokenTtlSeconds;
  }

  getCdnHlsTokenTtlSeconds(): number {
    return this.cdnHlsTokenTtlSeconds;
  }

  /**
   * Verifies if an object exists in storage using Metadata/HEAD operation,
   * returning object metadata or null if not found.
   */
  async headObject(
    key: string,
  ): Promise<{ contentLength?: number; contentType?: string } | null> {
    try {
      const response = await this.client.send(
        new HeadObjectCommand({
          Bucket: this.bucket,
          Key: key,
        }),
      );
      return {
        contentLength: response.ContentLength,
        contentType: response.ContentType,
      };
    } catch (error: unknown) {
      if (
        error instanceof S3ServiceException &&
        error.$metadata.httpStatusCode === 404
      ) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Downloads an object from S3 and writes it to a local file.
   */
  async downloadObject(
    key: string,
    localFilePath: string,
    options?: DownloadObjectOptions,
  ): Promise<void> {
    const response = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }),
      { abortSignal: options?.signal },
    );

    const body = response.Body as Readable;
    if (!body) {
      throw new Error(
        `Failed to download object: response body is empty for key ${key}`,
      );
    }

    const writeStream = createWriteStream(localFilePath);
    await pipeline(body, writeStream);
  }

  /**
   * Uploads a local file to S3/R2 with automatic retries on network drop.
   */
  async uploadFile(
    key: string,
    localFilePath: string,
    contentType: string,
  ): Promise<void> {
    const storageKey = this.keyForWrite(key);
    const fileBuffer = await readFile(localFilePath);

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: storageKey,
        Body: fileBuffer,
        ContentType: contentType,
        ContentLength: fileBuffer.byteLength,
      }),
    );
  }

  /**
   * Uploads a batch of files concurrently with retry and exponential backoff.
   */
  async uploadFiles(
    files: readonly StorageUploadItem[],
    concurrency = 6,
  ): Promise<number> {
    if (files.length === 0) {
      return 0;
    }

    let uploadedCount = 0;
    let cursor = 0;

    const uploadWorker = async (): Promise<void> => {
      while (cursor < files.length) {
        const itemIndex = cursor++;
        const item = files[itemIndex];
        if (!item) {
          break;
        }

        const filename = item.filename ?? item.localFilePath;
        const contentType = item.contentType ?? getMimeType(filename);

        let attempts = 0;
        const maxRetries = 5;
        while (true) {
          try {
            await this.uploadFile(item.key, item.localFilePath, contentType);
            uploadedCount++;
            break;
          } catch (err) {
            attempts++;
            if (attempts >= maxRetries) {
              throw err;
            }
            await new Promise((resolve) =>
              setTimeout(resolve, 500 * Math.pow(2, attempts)),
            );
          }
        }
      }
    };

    const workerCount = Math.min(
      Math.max(1, Math.floor(concurrency)),
      files.length,
    );
    const workers = Array.from({ length: workerCount }, () => uploadWorker());
    await Promise.all(workers);

    return uploadedCount;
  }

  /**
   * Uploads an entire local directory to S3 under the specified prefix.
   */
  async uploadDirectory(
    localDirectory: string,
    s3Prefix: string,
    concurrency = 6,
  ): Promise<number> {
    const cleanPrefix = this.requireVisibilityPrefix
      ? `${this.keyForWrite(s3Prefix).replace(/\/+$/, "")}/`
      : s3Prefix.endsWith("/")
        ? s3Prefix
        : `${s3Prefix}/`;
    const fileList: StorageUploadItem[] = [];

    const collectFiles = async (
      currentDir: string,
      relativePath: string,
    ): Promise<void> => {
      const entries = await readdir(currentDir);

      for (const entry of entries) {
        const fullPath = join(currentDir, entry);
        const entryRelPath = relativePath ? `${relativePath}/${entry}` : entry;
        const fileStat = await stat(fullPath);

        if (fileStat.isDirectory()) {
          await collectFiles(fullPath, entryRelPath);
        } else if (fileStat.isFile()) {
          fileList.push({
            localFilePath: fullPath,
            key: `${cleanPrefix}${entryRelPath}`,
            filename: entry,
          });
        }
      }
    };

    await collectFiles(localDirectory, "");
    return this.uploadFiles(fileList, concurrency);
  }

  /**
   * Configures S3 bucket CORS to allow direct browser uploads (PUT, GET, HEAD, POST, DELETE).
   *
   * The bucket-wide setting never changes per-upload, so the actual S3 call is
   * made at most once per process — repeat callers (e.g. every presigned
   * upload request) await the same cached result instead of re-issuing it.
   */
  async ensureBucketCors(): Promise<void> {
    if (!this.bucketCorsEnsured) {
      this.bucketCorsEnsured = this.client
        .send(
          new PutBucketCorsCommand({
            Bucket: this.bucket,
            CORSConfiguration: {
              CORSRules: [
                {
                  AllowedHeaders: ["*"],
                  AllowedMethods: ["GET", "HEAD", "PUT", "POST", "DELETE"],
                  AllowedOrigins: ["*"],
                  ExposeHeaders: ["ETag", "Content-Length", "Content-Type"],
                  MaxAgeSeconds: 3600,
                },
              ],
            },
          }),
        )
        .then(
          () => undefined,
          (error) => {
            // Clear the cache so a future call can retry, but do not expose a
            // presigned URL while the bucket is known not to support CORS.
            this.bucketCorsEnsured = null;
            throw error;
          },
        );
    }
    await this.bucketCorsEnsured;
  }

  /**
   * Generates a presigned PUT URL for direct browser-to-S3 uploads.
   *
   * The URL is single-use and expires after `expiresIn` seconds (default 300).
   * Callers must set Content-Type on the PUT request to match `contentType`.
   */
  async getPresignedPutUrl(
    key: string,
    contentType: string,
    contentLength?: number,
    expiresIn = 300,
  ): Promise<string> {
    const storageKey = this.keyForWrite(key);
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: storageKey,
      ContentType: contentType,
      ContentLength: contentLength,
    });
    return getSignedUrl(this.client, command, {
      expiresIn,
      unhoistableHeaders: new Set(["content-length"]),
    });
  }

  /**
   * Uploads an in-memory object. Used by API-proxied uploads that already
   * have the bytes (discussion attachments) rather than a local file path.
   */
  async putObject(
    key: string,
    body: Buffer | Readable,
    contentType: string,
    contentLength?: number,
  ): Promise<void> {
    const storageKey = this.keyForWrite(key);
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: storageKey,
        Body: body,
        ContentType: contentType,
        ContentLength: contentLength,
      }),
    );
  }

  /**
   * Streams an object for authenticated API serving. Returns null on 404.
   */
  async getObject(
    key: string,
    options?: GetObjectOptions,
  ): Promise<{
    body: Readable;
    contentType?: string;
    contentLength?: number;
  } | null> {
    try {
      const response = await this.client.send(
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Range: options?.range,
        }),
      );
      const body = response.Body as Readable | undefined;
      if (!body) return null;
      return {
        body,
        contentType: response.ContentType,
        contentLength: response.ContentLength,
      };
    } catch (error: unknown) {
      if (
        error instanceof S3ServiceException &&
        error.$metadata.httpStatusCode === 404
      ) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Deletes an object from S3.
   */
  async deleteObject(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }),
    );
  }

  /**
   * Deletes multiple objects in the provider's maximum batch size. Object
   * deletion is idempotent, which makes this safe for retention retries.
   */
  async deleteObjects(keys: string[]): Promise<void> {
    const uniqueKeys = [...new Set(keys.filter((key) => key.length > 0))];
    for (let offset = 0; offset < uniqueKeys.length; offset += 1_000) {
      const batch = uniqueKeys.slice(offset, offset + 1_000);
      const response = await this.client.send(
        new DeleteObjectsCommand({
          Bucket: this.bucket,
          Delete: {
            Objects: batch.map((Key) => ({ Key })),
            Quiet: true,
          },
        }),
      );

      if (response.Errors && response.Errors.length > 0) {
        throw new Error(
          `Failed to delete ${response.Errors.length} storage object(s).`,
        );
      }
    }
  }

  /**
   * Deletes every object below a prefix, paging through object storage and
   * batching deletes so large HLS outputs do not require one API call each.
   */
  async deletePrefix(prefix: string): Promise<void> {
    if (!prefix) {
      return;
    }

    let continuationToken: string | undefined;
    do {
      const response = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: prefix,
          ContinuationToken: continuationToken,
        }),
      );
      const keys = (response.Contents ?? [])
        .map((object) => object.Key)
        .filter((key): key is string => Boolean(key));
      await this.deleteObjects(keys);
      continuationToken = response.IsTruncated
        ? response.NextContinuationToken
        : undefined;
    } while (continuationToken);
  }
}

export function getMimeType(filename: string): string {
  if (filename.endsWith(".m3u8")) {
    return "application/vnd.apple.mpegurl";
  }
  if (filename.endsWith(".ts")) {
    return "video/mp2t";
  }
  if (filename.endsWith(".mp4")) {
    return "video/mp4";
  }
  if (filename.endsWith(".jpg") || filename.endsWith(".jpeg")) {
    return "image/jpeg";
  }
  if (filename.endsWith(".png")) {
    return "image/png";
  }
  if (filename.endsWith(".json")) {
    return "application/json";
  }
  return "application/octet-stream";
}

export type { Readable, S3Client, S3ClientConfig };
