import {
  S3Client,
  HeadObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import * as fs from "node:fs";
import { pipeline } from "node:stream/promises";
import type { Readable } from "node:stream";

export interface StorageOptions {
  endpoint?: string;
  region: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  bucket: string;
  forcePathStyle?: boolean;
}

export class S3StorageService {
  private client: S3Client;
  private bucket: string;

  constructor(options: StorageOptions) {
    if (!options.bucket) {
      throw new Error("Storage bucket name is required.");
    }
    this.bucket = options.bucket;

    const credentials =
      options.accessKeyId && options.secretAccessKey
        ? {
            accessKeyId: options.accessKeyId,
            secretAccessKey: options.secretAccessKey,
          }
        : undefined;

    this.client = new S3Client({
      endpoint: options.endpoint,
      region: options.region,
      credentials,
      forcePathStyle: options.forcePathStyle,
    });
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
    } catch (error: any) {
      if (
        error.name === "NotFound" ||
        error.$metadata?.httpStatusCode === 404
      ) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Downloads an object from S3 and writes it to a local file.
   */
  async downloadObject(key: string, localFilePath: string): Promise<void> {
    const response = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }),
    );

    const body = response.Body as Readable;
    if (!body) {
      throw new Error(
        `Failed to download object: response body is empty for key ${key}`,
      );
    }

    const writeStream = fs.createWriteStream(localFilePath);
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
    const readStream = fs.createReadStream(localFilePath);
    const stat = fs.statSync(localFilePath);

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
export type { Readable };
