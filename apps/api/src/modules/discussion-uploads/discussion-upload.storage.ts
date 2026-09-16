import { createReadStream } from "node:fs";
import { mkdir, open, stat, unlink, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { pipeline } from "node:stream/promises";
import type { Readable } from "node:stream";
import type { S3StorageService } from "@veolms/storage";
import { config } from "../../config.ts";

const UPLOAD_DIRECTORY = join(process.cwd(), ".data", "discussion-uploads");
const OBJECT_PREFIX = "protected/discussion-uploads";
export const DISCUSSION_UPLOAD_URL_PREFIX = "/api/v1/discussion-uploads";

export const DISCUSSION_ALLOWED_MIME_TYPES = [
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/json",
] as const;

export const DISCUSSION_ALLOWED_EXTENSIONS_BY_MIME: Readonly<
  Record<string, readonly string[]>
> = {
  "image/gif": [".gif"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/webp": [".webp"],
  "video/mp4": [".mp4"],
  "video/quicktime": [".mov"],
  "video/webm": [".webm"],
  "application/pdf": [".pdf"],
  "application/msword": [".doc"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [
    ".docx",
  ],
  "application/vnd.ms-excel": [".xls"],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [
    ".xlsx",
  ],
  "application/vnd.ms-powerpoint": [".ppt"],
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": [
    ".pptx",
  ],
  "text/plain": [".txt", ".text"],
  "text/markdown": [".md"],
  "text/csv": [".csv"],
  "application/json": [".json"],
};

export const DISCUSSION_DEFAULT_EXTENSION_FOR_MIME: Readonly<
  Record<string, string>
> = {
  "image/gif": ".gif",
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "video/mp4": ".mp4",
  "video/quicktime": ".mov",
  "video/webm": ".webm",
  "application/pdf": ".pdf",
  "application/msword": ".doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    ".docx",
  "application/vnd.ms-excel": ".xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
  "application/vnd.ms-powerpoint": ".ppt",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation":
    ".pptx",
  "text/plain": ".txt",
  "text/markdown": ".md",
  "text/csv": ".csv",
  "application/json": ".json",
};

const EXTENSION_MIME_TYPES: Readonly<Record<string, string>> = {
  ...Object.fromEntries(
    Object.entries(DISCUSSION_DEFAULT_EXTENSION_FOR_MIME).map(
      ([mimeType, extension]) => [extension, mimeType],
    ),
  ),
  ".jpeg": "image/jpeg",
  ".text": "text/plain",
};

export function isSupportedDiscussionUploadMimeType(mimeType: string): boolean {
  return Object.prototype.hasOwnProperty.call(
    DISCUSSION_ALLOWED_EXTENSIONS_BY_MIME,
    mimeType,
  );
}

export function isAllowedExtensionForMimeType(
  extension: string,
  mimeType: string,
): boolean {
  const allowed = DISCUSSION_ALLOWED_EXTENSIONS_BY_MIME[mimeType];
  if (!allowed) return false;
  return allowed.includes(extension.toLowerCase());
}

export function getDiscussionAttachmentDisposition(
  mimeType: string,
  originalFileName?: string,
): string {
  const safeName = (originalFileName || "attachment")
    .replace(/["\r\n\\]/g, "_")
    .trim();
  const isInlineMedia =
    mimeType.startsWith("image/") || mimeType.startsWith("video/");
  const dispositionType = isInlineMedia ? "inline" : "attachment";
  return `${dispositionType}; filename="${safeName}"`;
}

const SAFE_FILE_NAME = /^[0-9a-f-]{36}\.[A-Za-z0-9]{1,16}$/i;

export function isSafeDiscussionUploadFileName(fileName: string): boolean {
  return SAFE_FILE_NAME.test(fileName);
}

export function discussionUploadPublicUrl(fileName: string): string {
  return `${DISCUSSION_UPLOAD_URL_PREFIX}/${encodeURIComponent(fileName)}`;
}

export interface StoredDiscussionUpload {
  fileName: string;
  mimeType: string;
  size: number;
}

export interface DiscussionUploadFile {
  stream: Readable;
  mimeType: string;
  size: number;
}

export interface DiscussionUploadStore {
  putFromStream(input: {
    mimeType: string;
    stream: NodeJS.ReadableStream;
  }): Promise<StoredDiscussionUpload>;
  putFromBuffer(input: {
    fileName: string;
    mimeType: string;
    data: Buffer;
  }): Promise<StoredDiscussionUpload>;
  get(fileName: string): Promise<DiscussionUploadFile | null>;
  remove(fileName: string): Promise<void>;
}

export function discussionUploadStorageKey(fileName: string): string {
  return `${OBJECT_PREFIX}/${fileName}`;
}

function diskPath(fileName: string): string {
  return join(UPLOAD_DIRECTORY, fileName);
}

function mimeFromFileName(
  fileName: string,
  fallback = "application/octet-stream",
): string {
  return EXTENSION_MIME_TYPES[extname(fileName).toLowerCase()] ?? fallback;
}

function shouldUseObjectStorage(): boolean {
  return Boolean(
    config.STORAGE_ACCESS_KEY_ID && config.STORAGE_SECRET_ACCESS_KEY,
  );
}

export function createDiscussionUploadStore(
  objectStorage: S3StorageService,
): DiscussionUploadStore {
  const s3 = shouldUseObjectStorage() ? objectStorage : null;

  async function writeDiskFile(
    fileName: string,
    mimeType: string,
    writer: (filePath: string) => Promise<void>,
  ): Promise<StoredDiscussionUpload> {
    await mkdir(UPLOAD_DIRECTORY, { recursive: true });
    const filePath = diskPath(fileName);
    try {
      await writer(filePath);
      const fileStats = await stat(filePath);
      if (s3) {
        await s3.uploadFile(
          discussionUploadStorageKey(fileName),
          filePath,
          mimeType,
        );
      }
      return { fileName, mimeType, size: fileStats.size };
    } catch (error) {
      await unlink(filePath).catch(() => undefined);
      throw error;
    }
  }

  return {
    async putFromStream({ mimeType, stream }) {
      const extension = DISCUSSION_DEFAULT_EXTENSION_FOR_MIME[mimeType];
      if (!extension) throw new Error("UNSUPPORTED_DISCUSSION_UPLOAD_TYPE");

      const fileName = `${randomUUID()}${extension}`;
      return writeDiskFile(fileName, mimeType, async (filePath) => {
        const fileHandle = await open(filePath, "wx");
        try {
          await pipeline(stream, fileHandle.createWriteStream());
        } finally {
          await fileHandle.close().catch(() => undefined);
        }
      });
    },

    async putFromBuffer({ fileName, mimeType, data }) {
      if (!isSafeDiscussionUploadFileName(fileName)) {
        throw new Error("UNSUPPORTED_DISCUSSION_UPLOAD_TYPE");
      }

      if (!isSupportedDiscussionUploadMimeType(mimeType)) {
        throw new Error("UNSUPPORTED_DISCUSSION_UPLOAD_TYPE");
      }

      if (s3) {
        await s3.putObject(
          discussionUploadStorageKey(fileName),
          data,
          mimeType,
          data.length,
        );
        return { fileName, mimeType, size: data.length };
      }

      return writeDiskFile(fileName, mimeType, async (filePath) => {
        await writeFile(filePath, data, { flag: "wx" });
      });
    },

    async get(fileName) {
      if (!isSafeDiscussionUploadFileName(fileName)) return null;

      if (s3) {
        const object = await s3.getObject(discussionUploadStorageKey(fileName));
        if (object) {
          return {
            stream: object.body,
            mimeType: object.contentType ?? mimeFromFileName(fileName, ""),
            size: object.contentLength ?? 0,
          };
        }
      }

      const filePath = diskPath(fileName);
      try {
        const fileStats = await stat(filePath);
        if (!fileStats.isFile()) return null;
        return {
          stream: createReadStream(filePath),
          mimeType: mimeFromFileName(fileName, "application/octet-stream"),
          size: fileStats.size,
        };
      } catch {
        return null;
      }
    },

    async remove(fileName) {
      if (!isSafeDiscussionUploadFileName(fileName)) return;
      await unlink(diskPath(fileName)).catch(() => undefined);
      if (s3) {
        await s3
          .deleteObject(discussionUploadStorageKey(fileName))
          .catch(() => undefined);
      }
    },
  };
}
