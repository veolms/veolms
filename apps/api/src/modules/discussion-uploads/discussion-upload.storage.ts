import { createReadStream } from "node:fs";
import { mkdir, open, stat, unlink } from "node:fs/promises";
import { extname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { pipeline } from "node:stream/promises";

const UPLOAD_DIRECTORY = join(process.cwd(), ".data", "discussion-uploads");

const MIME_EXTENSIONS: Readonly<Record<string, string>> = {
  "image/gif": ".gif",
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "video/mp4": ".mp4",
  "video/quicktime": ".mov",
  "video/webm": ".webm",
};

const EXTENSION_MIME_TYPES: Readonly<Record<string, string>> =
  Object.fromEntries(
    Object.entries(MIME_EXTENSIONS).map(([mimeType, extension]) => [
      extension,
      mimeType,
    ]),
  );

export interface LocalDiscussionUpload {
  fileName: string;
  mimeType: string;
  size: number;
}

export interface LocalDiscussionUploadInput {
  mimeType: string;
  stream: NodeJS.ReadableStream;
}

export async function storeLocalDiscussionUpload({
  mimeType,
  stream,
}: LocalDiscussionUploadInput): Promise<LocalDiscussionUpload> {
  const extension = MIME_EXTENSIONS[mimeType];
  if (!extension) throw new Error("UNSUPPORTED_DISCUSSION_UPLOAD_TYPE");

  await mkdir(UPLOAD_DIRECTORY, { recursive: true });
  const fileName = `${randomUUID()}${extension}`;
  const filePath = join(UPLOAD_DIRECTORY, fileName);
  const fileHandle = await open(filePath, "wx");

  try {
    await pipeline(stream, fileHandle.createWriteStream());
    const fileStats = await stat(filePath);
    return { fileName, mimeType, size: fileStats.size };
  } catch (error) {
    await unlink(filePath).catch(() => undefined);
    throw error;
  } finally {
    await fileHandle.close().catch(() => undefined);
  }
}

export async function getLocalDiscussionUpload(fileName: string) {
  if (!/^[0-9a-f-]{36}\.(?:gif|jpe?g|png|webp|mp4|mov|webm)$/i.test(fileName)) {
    return null;
  }

  const filePath = join(UPLOAD_DIRECTORY, fileName);
  try {
    const fileStats = await stat(filePath);
    if (!fileStats.isFile()) return null;
    return {
      stream: createReadStream(filePath),
      mimeType:
        EXTENSION_MIME_TYPES[extname(fileName).toLowerCase()] ??
        "application/octet-stream",
      size: fileStats.size,
    };
  } catch {
    return null;
  }
}

export async function removeLocalDiscussionUpload(fileName: string) {
  await unlink(join(UPLOAD_DIRECTORY, fileName)).catch(() => undefined);
}

// TODO(storage): replace this local adapter with the production S3-compatible
// object-storage adapter when discussion persistence moves to the backend.
