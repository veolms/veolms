import type { PresignMediaRequest } from "@veolms/contracts";
import { getApiError } from "../../lib/api-error";
import {
  mediaService,
  type UploadProgress,
  type UploadProgressHandler,
} from "./media.service";

const CHECKPOINT_PREFIX = "veolms.video-upload.v1";
const PART_UPLOAD_CONCURRENCY = 4;
const PART_PRESIGN_BATCH_SIZE = 20;

export interface VideoUploadCheckpoint {
  mediaAssetId: string;
  fileSize: number;
  partSize: number;
  totalParts: number;
  visibility: PresignMediaRequest["visibility"];
  updatedAt: number;
}

export interface ResumableVideoUploadOptions {
  file: File;
  visibility?: PresignMediaRequest["visibility"];
  onProgress?: UploadProgressHandler;
  onResuming?: (progress: UploadProgress) => void;
  onCompleting?: () => void;
  signal?: AbortSignal;
  /** Whether an abort means "discard" rather than "pause and keep for later". */
  discardOnAbort?: () => boolean;
}

export interface ResumableVideoUploadResult {
  mediaAssetId: string;
  resumed: boolean;
  uploadedBytes: number;
}

function checkpointKey(
  file: File,
  visibility: PresignMediaRequest["visibility"],
): string {
  return `${CHECKPOINT_PREFIX}:${visibility}:${file.name}:${file.size}:${file.lastModified}`;
}

function getStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readVideoUploadCheckpoint(
  file: File,
  visibility: PresignMediaRequest["visibility"] = "protected",
): VideoUploadCheckpoint | null {
  const storage = getStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(checkpointKey(file, visibility));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<VideoUploadCheckpoint>;
    if (
      typeof parsed.mediaAssetId !== "string" ||
      parsed.fileSize !== file.size ||
      typeof parsed.partSize !== "number" ||
      typeof parsed.totalParts !== "number"
    ) {
      return null;
    }
    return {
      mediaAssetId: parsed.mediaAssetId,
      fileSize: parsed.fileSize,
      partSize: parsed.partSize,
      totalParts: parsed.totalParts,
      visibility,
      updatedAt: typeof parsed.updatedAt === "number" ? parsed.updatedAt : 0,
    };
  } catch {
    return null;
  }
}

function writeVideoUploadCheckpoint(
  file: File,
  checkpoint: VideoUploadCheckpoint,
): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.setItem(
      checkpointKey(file, checkpoint.visibility),
      JSON.stringify(checkpoint),
    );
  } catch {
    // Private browsing or a full quota must not break an upload.
  }
}

function clearVideoUploadCheckpoint(
  file: File,
  visibility: PresignMediaRequest["visibility"],
): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.removeItem(checkpointKey(file, visibility));
  } catch {
    // Ignore storage failures on cleanup.
  }
}

function createAbortError(): Error {
  const error = new Error("The video upload was cancelled.");
  error.name = "AbortError";
  return error;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function expectedPartSize(
  partNumber: number,
  partSize: number,
  fileSize: number,
): number {
  return Math.max(
    0,
    Math.min(partSize, fileSize - (partNumber - 1) * partSize),
  );
}

async function runWithConcurrency<T>(
  items: readonly T[],
  limit: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (true) {
        const index = cursor++;
        if (index >= items.length) return;
        await worker(items[index]!);
      }
    },
  );
  await Promise.all(workers);
}

interface UploadedPart {
  partNumber: number;
  size: number;
}

function uploadPart(
  url: string,
  body: Blob,
  partNumber: number,
  signal: AbortSignal,
  onLoaded: (loaded: number) => void,
): Promise<UploadedPart> {
  return new Promise<UploadedPart>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let settled = false;

    const cleanup = () => {
      signal.removeEventListener("abort", abortUpload);
    };
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      callback();
    };
    const abortUpload = () => {
      xhr.abort();
      finish(() => reject(createAbortError()));
    };

    if (signal.aborted) {
      reject(createAbortError());
      return;
    }

    signal.addEventListener("abort", abortUpload, { once: true });
    xhr.open("PUT", url, true);
    xhr.withCredentials = false;
    xhr.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable) onLoaded(event.loaded);
    });

    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        finish(() => resolve({ partNumber, size: body.size }));
        return;
      }
      finish(() =>
        reject(
          new Error(
            `Storage upload failed with status ${xhr.status || "unknown"}.`,
          ),
        ),
      );
    });

    xhr.addEventListener("error", () =>
      finish(() => reject(new Error("The media upload was interrupted."))),
    );
    xhr.addEventListener("timeout", () =>
      finish(() => reject(new Error("The media upload timed out."))),
    );
    xhr.addEventListener("abort", () => {
      if (!settled) finish(() => reject(createAbortError()));
    });

    xhr.send(body);
  });
}

/**
 * Uploads a video in resumable parts. A checkpoint in local storage ties the
 * chosen file to the API's media asset; when the same file is chosen again,
 * the parts storage already accepted are skipped and only the rest is sent.
 */
export async function uploadVideoResumable(
  options: ResumableVideoUploadOptions,
): Promise<ResumableVideoUploadResult> {
  const visibility = options.visibility ?? "protected";
  const { file, signal = new AbortController().signal } = options;
  const totalBytes = file.size;

  let mediaAssetId: string | null = null;
  let partSize = 0;
  let totalParts = 0;
  let completed = new Map<number, { partNumber: number; size: number }>();
  let resumed = false;

  const existing = readVideoUploadCheckpoint(file, visibility);
  if (existing) {
    try {
      const status = await mediaService.getMultipartUploadStatus(
        existing.mediaAssetId,
      );
      mediaAssetId = existing.mediaAssetId;
      partSize = status.partSize;
      totalParts = status.totalParts;
      completed = new Map(
        status.uploadedParts
          .filter((part) => part.partNumber <= totalParts)
          .map((part) => [part.partNumber, part]),
      );
      resumed = completed.size > 0;
    } catch (error) {
      const apiError = getApiError(error);
      if (apiError.code === "UPLOAD_ALREADY_COMPLETED") {
        // The parts were joined but the checkpoint was not cleared (for
        // example the tab closed right after completion). Reuse that asset.
        clearVideoUploadCheckpoint(file, visibility);
        options.onProgress?.({
          loadedBytes: totalBytes,
          totalBytes,
          percent: 100,
        });
        return {
          mediaAssetId: existing.mediaAssetId,
          resumed: true,
          uploadedBytes: totalBytes,
        };
      }
      if (apiError.code === "MULTIPART_UPLOAD_NOT_ACTIVE") {
        // The parts were joined and the session was cleared, but confirmation
        // failed before the asset became usable. Try confirmation again rather
        // than starting a second upload and orphaning the joined object.
        try {
          await mediaService.confirmUpload(existing.mediaAssetId);
          clearVideoUploadCheckpoint(file, visibility);
          options.onProgress?.({
            loadedBytes: totalBytes,
            totalBytes,
            percent: 100,
          });
          return {
            mediaAssetId: existing.mediaAssetId,
            resumed: true,
            uploadedBytes: totalBytes,
          };
        } catch (confirmationError) {
          const confirmationApiError = getApiError(confirmationError);
          const canDiscard =
            confirmationApiError.code === "FILE_NOT_FOUND" ||
            confirmationApiError.code === "FILE_SIZE_MISMATCH" ||
            confirmationApiError.code === "FILE_TYPE_MISMATCH" ||
            confirmationApiError.code === "MEDIA_NOT_FOUND";
          if (!canDiscard) throw confirmationError;
        }
      }
      if (apiError.status !== 404 && apiError.status !== 409) {
        // A transient failure must not throw away the checkpoint: retrying
        // should still resume the parts that are already in storage.
        throw error;
      }
      // The server-side session expired or no longer exists; start a new one.
      clearVideoUploadCheckpoint(file, visibility);
      mediaAssetId = null;
    }
  }

  if (!mediaAssetId) {
    const started = await mediaService.startMultipartVideoUpload({
      filename: file.name,
      contentType: file.type,
      fileSize: file.size,
      visibility,
    });
    mediaAssetId = started.mediaAssetId;
    partSize = started.partSize;
    totalParts = started.totalParts;
    completed = new Map();
    writeVideoUploadCheckpoint(file, {
      mediaAssetId,
      fileSize: file.size,
      partSize,
      totalParts,
      visibility,
      updatedAt: Date.now(),
    });
  }

  const loadedByPart = new Map<number, number>();
  let lastProgress: UploadProgress = {
    loadedBytes: 0,
    totalBytes,
    percent: 0,
  };

  const emitProgress = () => {
    let loadedBytes = 0;
    for (const part of completed.values()) {
      loadedBytes += expectedPartSize(part.partNumber, partSize, totalBytes);
    }
    for (const [partNumber, loaded] of loadedByPart) {
      if (completed.has(partNumber)) continue;
      loadedBytes += Math.min(
        loaded,
        expectedPartSize(partNumber, partSize, totalBytes),
      );
    }
    loadedBytes = Math.min(loadedBytes, totalBytes);
    lastProgress = {
      loadedBytes,
      totalBytes,
      percent: totalBytes
        ? Math.min(100, Math.round((loadedBytes / totalBytes) * 100))
        : 0,
    };
    options.onProgress?.(lastProgress);
  };

  emitProgress();
  if (resumed) options.onResuming?.(lastProgress);

  const controller = new AbortController();
  const onExternalAbort = () => controller.abort();
  if (signal.aborted) controller.abort();
  else signal.addEventListener("abort", onExternalAbort, { once: true });

  try {
    const missing: number[] = [];
    for (let partNumber = 1; partNumber <= totalParts; partNumber += 1) {
      if (!completed.has(partNumber)) missing.push(partNumber);
    }

    for (
      let offset = 0;
      offset < missing.length;
      offset += PART_PRESIGN_BATCH_SIZE
    ) {
      const batch = missing.slice(offset, offset + PART_PRESIGN_BATCH_SIZE);
      const signed = await mediaService.presignMultipartUploadParts(
        mediaAssetId,
        batch,
      );
      const urlByPart = new Map(
        signed.parts.map((part) => [part.partNumber, part.url]),
      );

      await runWithConcurrency(
        batch,
        PART_UPLOAD_CONCURRENCY,
        async (partNumber) => {
          const url = urlByPart.get(partNumber);
          if (!url) {
            throw new Error(
              `Storage did not return a URL for upload part ${partNumber}.`,
            );
          }
          const start = (partNumber - 1) * partSize;
          const end = Math.min(start + partSize, totalBytes);
          const blob = file.slice(start, end);
          const result = await uploadPart(
            url,
            blob,
            partNumber,
            controller.signal,
            (loaded) => {
              loadedByPart.set(partNumber, loaded);
              emitProgress();
            },
          );
          loadedByPart.delete(partNumber);
          completed.set(partNumber, result);
          emitProgress();
        },
      );
    }

    options.onCompleting?.();
    const parts = [...completed.values()].sort(
      (left, right) => left.partNumber - right.partNumber,
    );
    if (parts.length !== totalParts) {
      throw new Error(
        "Some parts were not uploaded. The upload can be resumed.",
      );
    }

    await mediaService.completeMultipartUpload(mediaAssetId);
    clearVideoUploadCheckpoint(file, visibility);

    options.onProgress?.({
      loadedBytes: totalBytes,
      totalBytes,
      percent: 100,
    });

    return { mediaAssetId, resumed, uploadedBytes: totalBytes };
  } catch (error) {
    controller.abort();
    if (isAbortError(error) && options.discardOnAbort?.() && mediaAssetId) {
      clearVideoUploadCheckpoint(file, visibility);
      await mediaService
        .abortMultipartUpload(mediaAssetId)
        .catch(() => undefined);
    }
    throw error;
  } finally {
    signal.removeEventListener("abort", onExternalAbort);
  }
}
