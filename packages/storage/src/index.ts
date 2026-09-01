import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  type S3ClientConfig,
  S3ServiceException,
  DeleteObjectsCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createReadStream, createWriteStream, statSync } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import type { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

export interface StorageOptions extends Partial<S3ClientConfig> {
  bucket: string;
  endpoint?: string;
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

export interface StorageUploadItem {
  localFilePath: string;
  key: string;
  filename?: string;
  contentType?: string;
}

export class S3StorageService {
  private client: S3Client;
  private bucket: string;

  constructor(options: StorageOptions) {
    if (!options.bucket) {
      throw new Error("Storage bucket name is required.");
    }
    this.bucket = options.bucket;

    if (options.client) {
      this.client = options.client;
    } else {
      const {
        bucket: _bucket,
        client: _client,
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

  /**
   * Verifies if an object exists in storage using Metadata/HEAD operation,
   * returning object metadata or null if not found.
   */
  async headObject(key: string): Promise<{ contentLength?: number } | null> {
    try {
      const response = await this.client.send(
        new HeadObjectCommand({
          Bucket: this.bucket,
          Key: key,
        }),
      );
      return {
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
   * Uploads a local file to S3.
   */
  async uploadFile(
    key: string,
    localFilePath: string,
    contentType: string,
  ): Promise<void> {
    const readStream = createReadStream(localFilePath);
    const stat = statSync(localFilePath);

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: readStream,
        ContentType: contentType,
        ContentLength: stat.size,
      }),
    );
  }

  /**
   * Uploads a batch of files concurrently with retry and exponential backoff.
   */
  async uploadFiles(
    files: readonly StorageUploadItem[],
    concurrency = 16,
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
        const maxRetries = 3;
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
              setTimeout(resolve, 200 * Math.pow(2, attempts)),
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
    concurrency = 16,
  ): Promise<number> {
    const cleanPrefix = s3Prefix.endsWith("/") ? s3Prefix : `${s3Prefix}/`;
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
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType,
      ContentLength: contentLength,
    });
    return getSignedUrl(this.client, command, { expiresIn });
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
