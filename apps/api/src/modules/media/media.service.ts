import type { Permission } from "@veolms/contracts";
import { hasAcademyPermission } from "../authorization/index.ts";
import crypto from "node:crypto";
import type { FastifyBaseLogger } from "fastify";
import type { Kysely } from "kysely";
import type { Database, MediaAssetStatus } from "@veolms/database";
import type {
  LessonResourceDownloadResponse,
  MediaImageVariantManifest,
  MediaSourceResponse,
  MultipartUploadPartUrlsRequest,
  MultipartUploadPartUrlsResponse,
  MultipartUploadStartResponse,
  MultipartUploadStatusResponse,
  PresignMediaRequest,
  VideoPlaybackBootstrap,
  HeroVideoPlayback,
  VideoPlaybackToken,
  VideoQualityLevel,
} from "@veolms/contracts";
import { AppError } from "../../lib/errors.ts";
import type { AppServices } from "../../services/index.ts";
import { ADMIN_ROLE } from "../auth/index.ts";
import { createAccessService, isOpenFreeCourse } from "../access/index.ts";
import type { LessonPositionReader } from "../learning-progress/index.ts";
import { listLessonChaptersForPlayback } from "../courses/chapters/chapters.playback.service.ts";
import { createChapterSyncService } from "../courses/chapters/chapters.service.ts";
import { listLessonSubtitlesForPlayback } from "../courses/subtitles/subtitles.playback.service.ts";
import { findLessonResourceForDownload } from "../courses/curriculum/lesson-resource.download.service.ts";
import * as mediaRepo from "./media.repository.ts";
import { findYoutubeImportProgress } from "./youtube-import/youtube-import.progress.ts";
import { enqueueImageJob } from "@veolms/database";
import { probeVideoSource } from "../../lib/video-prober.ts";
import { getCdnDeliveryUrl } from "../../services/cdn-delivery.ts";
import {
  createMasterManifestCache,
  MASTER_MANIFEST_MAX_BYTES,
} from "./master-manifest-cache.ts";
import {
  createStoryboardPresenceCache,
  STORYBOARD_INDEX_MAX_BYTES,
  storyboardIndexKeyFor,
} from "./storyboard-presence-cache.ts";
import type {
  MediaConvertWebhookPayload,
  MediaConvertWebhookResponse,
} from "./webhooks/mediaconvert-webhook.schema.ts";

export interface MediaServiceOptions {
  database: Kysely<Database>;
  services: AppServices;
  /**
   * Where a learner last was in a lesson's video (the learning-progress
   * module's), for the playback bootstrap's `resumePosition`. Only the
   * media routes pass it; without it the bootstrap leaves the field out.
   */
  lessonPositions?: LessonPositionReader;
}

const VIDEO_QUALITIES: VideoQualityLevel[] = ["360p", "720p", "1080p"];
// S3/R2 require at least 5 MiB per non-final part. 8 MiB keeps a 5 GiB video
// under 10,000 parts while keeping each retry cheap.
const MULTIPART_MIN_PART_SIZE = 8 * 1024 * 1024;
const MULTIPART_MAX_PARTS = 10_000;
const MULTIPART_PART_URL_TTL_SECONDS = 3_600;
// Long enough to start a download after the click, short enough that a
// copied link is of little use to anyone else.
const LESSON_RESOURCE_DOWNLOAD_TTL_SECONDS = 300;
const accessService = createAccessService();
// Shared by every request this process serves; see master-manifest-cache.ts.
const MASTER_MANIFEST_CACHE = createMasterManifestCache();
// Likewise for storyboards; see storyboard-presence-cache.ts.
const STORYBOARD_PRESENCE_CACHE = createStoryboardPresenceCache();

/** Reads a small text object, giving up past `maxBytes`. */
async function readStorageText(
  storage: AppServices["storage"],
  key: string,
  maxBytes: number,
): Promise<string | null> {
  const file = await storage.getObject(key);
  if (!file) return null;
  if (file.contentLength !== undefined && file.contentLength > maxBytes) {
    file.body.destroy();
    return null;
  }
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of file.body) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += buffer.length;
    if (bytes > maxBytes) {
      file.body.destroy();
      return null;
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

type PlaybackUser = {
  id: string;
  roles?: readonly string[];
  /** Answer as for a learner: see `LEARNER_VIEW_HEADER`. */
  learnerView?: boolean;
};

/**
 * `Content-Disposition` that makes a browser save the file under `fileName`.
 * The quoted name is an ASCII fallback; `filename*` carries the real name
 * for browsers that understand it (RFC 6266).
 */
function buildAttachmentDisposition(fileName: string): string {
  const asciiName =
    fileName
      .replace(/[^\x20-\x7e]/g, "_")
      .replace(/["\\]/g, "_")
      .trim() || "download";
  const encodedName = encodeURIComponent(fileName).replace(
    /['()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `attachment; filename="${asciiName}"; filename*=UTF-8''${encodedName}`;
}

function normalizeOutputPrefix(outputPrefix: string): string {
  return outputPrefix.replace(/^\/+|\/+$/g, "");
}

function isYoutubeImportMedia(metadata: unknown): boolean {
  return (
    typeof metadata === "object" &&
    metadata !== null &&
    (metadata as { source?: unknown }).source === "youtube"
  );
}

function resolveMediaVisibility(storageKey: string): "public" | "protected" {
  return storageKey.replace(/^\/+/, "").startsWith("public/")
    ? "public"
    : "protected";
}

const IMAGE_EXTENSION_BY_MIME_TYPE: Readonly<Record<string, string>> = {
  "image/avif": "avif",
  "image/gif": "gif",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/svg+xml": "svg",
  "image/webp": "webp",
};

function resolveImageExtension(filename: string, contentType: string): string {
  const filenameExtension = /\.([a-z0-9]{1,12})$/iu.exec(filename)?.[1];
  if (filenameExtension) return filenameExtension.toLowerCase();

  const normalizedContentType = contentType
    .toLowerCase()
    .split(";", 1)[0]
    ?.trim();
  const knownExtension = normalizedContentType
    ? IMAGE_EXTENSION_BY_MIME_TYPE[normalizedContentType]
    : undefined;
  if (knownExtension) return knownExtension;

  const mimeSubtype = normalizedContentType?.split("/", 2)[1] ?? "";
  return mimeSubtype.replace(/[^a-z0-9]/giu, "").slice(0, 12) || "bin";
}

/**
 * File extensions a publicly stored object's address may end in. A public
 * object is fetched by address, and a delivery layer may choose how to serve
 * it from the ending, so the ending comes from this list or is left off:
 * never from whatever the uploaded file happened to be called.
 */
const PUBLIC_IMAGE_EXTENSIONS: ReadonlySet<string> = new Set([
  "avif",
  "bmp",
  "gif",
  "heic",
  "heif",
  "ico",
  "jpeg",
  "jpg",
  "png",
  "tif",
  "tiff",
  "webp",
]);
const PUBLIC_VIDEO_EXTENSIONS: ReadonlySet<string> = new Set([
  "3gp",
  "avi",
  "flv",
  "m2ts",
  "m4v",
  "mkv",
  "mov",
  "mp4",
  "mpeg",
  "mpg",
  "mts",
  "ogv",
  "ts",
  "webm",
  "wmv",
]);

function resolvePublicImageExtension(
  filename: string,
  contentType: string,
): string {
  const fromFile = resolveImageExtension(filename, contentType);
  if (PUBLIC_IMAGE_EXTENSIONS.has(fromFile)) return fromFile;

  const fromType =
    IMAGE_EXTENSION_BY_MIME_TYPE[baseMimeType(contentType)] ?? "";
  return PUBLIC_IMAGE_EXTENSIONS.has(fromType) ? fromType : "bin";
}

function baseMimeType(contentType: string): string {
  return contentType.split(";", 1)[0]?.trim().toLowerCase() ?? "";
}

/** Storage answered that the multipart upload no longer exists. */
function isNoSuchUploadError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "NoSuchUpload" || /NoSuchUpload/i.test(error.message))
  );
}

/** The object key a newly presigned upload will be written to. */
function resolveUploadStorageKey(
  ownerId: string,
  payload: PresignMediaRequest,
  mediaId: string,
): string {
  const ext = payload.filename.includes(".")
    ? payload.filename
        .split(".")
        .pop()
        ?.replace(/[^a-z0-9]/giu, "")
        .toLowerCase()
    : "";
  const isPublic = payload.visibility === "public";
  const visibilityPrefix = isPublic ? "public" : "protected";
  const imageExtension = isPublic
    ? resolvePublicImageExtension(payload.filename, payload.contentType)
    : resolveImageExtension(payload.filename, payload.contentType);
  const fileExtension =
    isPublic && !(ext && PUBLIC_VIDEO_EXTENSIONS.has(ext)) ? "" : ext;

  return payload.type === "image"
    ? `${visibilityPrefix}/thumbnails/${mediaId}/original.${imageExtension}`
    : `${visibilityPrefix}/media/${ownerId}/${mediaId}${fileExtension ? `.${fileExtension}` : ""}`;
}

/**
 * Picks a part size that covers the whole file within the object store's
 * 10,000-part limit and is a whole number of MiB, so every resume computes
 * byte ranges identically.
 */
function resolveMultipartPartSize(fileSize: number): number {
  const minimumForPartLimit = Math.ceil(fileSize / MULTIPART_MAX_PARTS);
  const mebibyte = 1024 * 1024;
  return Math.max(
    MULTIPART_MIN_PART_SIZE,
    Math.ceil(minimumForPartLimit / mebibyte) * mebibyte,
  );
}

function resolveImageThumbnailPrefix(
  storageKey: string,
  mediaId: string,
): string {
  const visibilityPrefix = `${resolveMediaVisibility(storageKey)}/`;
  return `${visibilityPrefix}thumbnails/${mediaId}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getPersistedImageVariantKey(
  metadata: unknown,
  width: number,
): string | null {
  if (!isRecord(metadata)) return null;

  if (!Array.isArray(metadata.variants)) return null;
  const matchingVariant = metadata.variants.find(
    (item) => isRecord(item) && item.width === width,
  );
  if (!isRecord(matchingVariant) || typeof matchingVariant.key !== "string") {
    return null;
  }
  return matchingVariant.key.trim() || null;
}

function isSafeHlsPath(path: string): boolean {
  const segments = path.split("/");
  return (
    segments.length > 0 &&
    segments.every(
      (segment) => segment.length > 0 && segment !== "." && segment !== "..",
    ) &&
    /\.(?:m3u8|ts|m4s|mp4|aac|vtt)$/i.test(path)
  );
}

/** Postgres unique_violation (23505), as raised by the pg driver via node-postgres. */
function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === "23505"
  );
}

function hlsContentType(path: string): string {
  if (/\.m3u8$/i.test(path)) return "application/vnd.apple.mpegurl";
  if (/\.ts$/i.test(path)) return "video/mp2t";
  if (/\.m4s$/i.test(path)) return "video/iso.segment";
  if (/\.mp4$/i.test(path)) return "video/mp4";
  if (/\.aac$/i.test(path)) return "audio/aac";
  if (/\.vtt$/i.test(path)) return "text/vtt";
  return "application/octet-stream";
}

/**
 * What an author is told when transcoding failed. The stored error is the
 * provider's or dispatcher's own text and is not for clients.
 */
const VIDEO_JOB_FAILED_MESSAGE = "Video processing failed. Please try again.";

/** One answer for every webhook authentication failure. */
const WEBHOOK_UNAUTHORIZED_MESSAGE = "Webhook authentication failed.";

/** A video asset as `getVideoAssetPlayback` needs it. */
export interface VideoAssetForPlayback {
  id: string;
  type: string | null;
  status: string | null;
  storageKey: string | null;
  durationSeconds: number | string | null;
}

export function createMediaService({
  database,
  services,
  lessonPositions,
}: MediaServiceOptions) {
  const chapterSyncService = createChapterSyncService({ database, services });

  /**
   * Pre-signs an S3/storage upload URL for media asset creation.
   */
  async function presignMediaUpload(
    ownerId: string,
    payload: PresignMediaRequest,
  ) {
    const mediaId = crypto.randomUUID();
    const isPublic = payload.visibility === "public";
    const storageKey = resolveUploadStorageKey(ownerId, payload, mediaId);

    // The request was only allowed to declare a picture or a video for a
    // public upload. The type is signed into the URL as well: otherwise the
    // upload itself could still be sent as a web page and be stored, and
    // served to visitors, as one.
    const uploadUrl = await services.storage.getPresignedPutUrl(
      storageKey,
      payload.contentType,
      payload.fileSize,
      undefined,
      { bindContentType: isPublic },
    );

    await services.storage.ensureBucketCors();

    await mediaRepo.insertMediaAsset(database, {
      id: mediaId,
      owner_id: ownerId,
      type: payload.type,
      storage_provider: "s3",
      storage_key: storageKey,
      original_filename: payload.filename,
      mime_type: payload.contentType,
      size_bytes: payload.fileSize,
      status: "uploading",
    });

    return {
      uploadUrl,
      mediaAssetId: mediaId,
    };
  }

  /**
   * Starts a resumable multipart upload for a video. The returned media id is
   * the anchor a client stores locally: after a reload it asks the API which
   * parts storage already has and uploads only the rest.
   */
  async function startMultipartUpload(
    ownerId: string,
    payload: PresignMediaRequest,
    logger?: FastifyBaseLogger,
  ): Promise<MultipartUploadStartResponse> {
    if (payload.type !== "video") {
      throw new AppError(
        400,
        "MULTIPART_UNSUPPORTED",
        "Only videos can be uploaded in resumable parts.",
      );
    }

    const mediaId = crypto.randomUUID();
    const storageKey = resolveUploadStorageKey(ownerId, payload, mediaId);
    const partSize = resolveMultipartPartSize(payload.fileSize);
    const totalParts = Math.ceil(payload.fileSize / partSize);

    let uploadId: string;
    try {
      uploadId = await services.storage.createMultipartUpload(
        storageKey,
        payload.contentType,
      );
    } catch (error) {
      logger?.error(
        { err: error },
        "Storage rejected the multipart upload start",
      );
      throw new AppError(
        503,
        "STORAGE_UNAVAILABLE",
        "The storage service rejected the upload request. Check the storage configuration and try again.",
      );
    }

    try {
      await mediaRepo.insertMediaAsset(database, {
        id: mediaId,
        owner_id: ownerId,
        type: payload.type,
        storage_provider: "s3",
        storage_key: storageKey,
        original_filename: payload.filename,
        mime_type: payload.contentType,
        size_bytes: payload.fileSize,
        status: "uploading",
        upload_id: uploadId,
        upload_part_size: partSize,
      });
    } catch (error) {
      // Never leave an orphaned multipart upload behind when the asset row
      // could not be written.
      await services.storage
        .abortMultipartUpload(storageKey, uploadId)
        .catch(() => undefined);
      throw error;
    }

    await services.storage.ensureBucketCors();

    return { mediaAssetId: mediaId, partSize, totalParts };
  }

  /** The in-flight multipart asset, authorized for the caller. */
  async function findMultipartUpload(
    mediaId: string,
    ownerId: string,
    userRoles?: readonly string[],
  ) {
    const isAdmin = await reachesAllMedia(ownerId, userRoles, "manage");
    const media = await mediaRepo.findMediaAssetSummaryById(
      database,
      mediaId,
      isAdmin ? undefined : ownerId,
    );

    if (!media) {
      throw new AppError(404, "MEDIA_NOT_FOUND", "Media asset not found.");
    }
    if (media.status !== "uploading") {
      throw new AppError(
        409,
        "UPLOAD_ALREADY_COMPLETED",
        "This upload has already been completed.",
      );
    }
    if (!media.upload_id || !media.upload_part_size) {
      throw new AppError(
        409,
        "MULTIPART_UPLOAD_NOT_ACTIVE",
        "This media asset has no resumable upload in progress.",
      );
    }

    return media;
  }

  function multipartGeometry(media: {
    size_bytes: number | string;
    upload_part_size: number | null;
  }) {
    const fileSize = Number(media.size_bytes);
    const partSize = Number(media.upload_part_size);
    return {
      fileSize,
      partSize,
      totalParts: Math.max(1, Math.ceil(fileSize / partSize)),
    };
  }

  /**
   * The size storage must report for a part. Every part is `partSize` bytes
   * except the last, which carries the remainder. Checking this before joining
   * stops a client from bypassing the declared file size through a part URL.
   */
  function expectedMultipartPartSize(
    partNumber: number,
    partSize: number,
    fileSize: number,
  ) {
    return Math.min(partSize, fileSize - (partNumber - 1) * partSize);
  }

  /** What storage already holds, so a client can resume from that point. */
  async function getMultipartUploadStatus(
    mediaId: string,
    ownerId: string,
    userRoles?: readonly string[],
  ): Promise<MultipartUploadStatusResponse> {
    const media = await findMultipartUpload(mediaId, ownerId, userRoles);
    const { fileSize, partSize, totalParts } = multipartGeometry(media);

    try {
      const parts = await services.storage.listMultipartUploadParts(
        media.storage_key,
        media.upload_id!,
      );
      return {
        partSize,
        totalParts,
        uploadedParts: parts.filter(
          (part) =>
            part.partNumber >= 1 &&
            part.partNumber <= totalParts &&
            part.size ===
              expectedMultipartPartSize(part.partNumber, partSize, fileSize),
        ),
      };
    } catch (error) {
      if (!isNoSuchUploadError(error)) throw error;
      await mediaRepo.updateMediaAssetUploadSession(database, mediaId, {
        uploadId: null,
        partSize: null,
      });
      throw new AppError(
        409,
        "UPLOAD_SESSION_EXPIRED",
        "This upload session has expired. Start the upload again.",
      );
    }
  }

  /** Fresh presigned URLs for the parts a client still has to send. */
  async function presignMultipartUploadParts(
    mediaId: string,
    payload: MultipartUploadPartUrlsRequest,
    ownerId: string,
    userRoles?: readonly string[],
  ): Promise<MultipartUploadPartUrlsResponse> {
    const media = await findMultipartUpload(mediaId, ownerId, userRoles);
    const { totalParts } = multipartGeometry(media);
    const invalidPart = payload.partNumbers.find(
      (partNumber) => partNumber > totalParts,
    );
    if (invalidPart !== undefined) {
      throw new AppError(
        400,
        "INVALID_PART_NUMBER",
        `Part ${invalidPart} is outside this upload's ${totalParts} parts.`,
      );
    }

    const parts = await Promise.all(
      payload.partNumbers.map(async (partNumber) => ({
        partNumber,
        url: await services.storage.getPresignedUploadPartUrl(
          media.storage_key,
          media.upload_id!,
          partNumber,
          MULTIPART_PART_URL_TTL_SECONDS,
        ),
      })),
    );

    return { parts };
  }

  /**
   * Joins the uploaded parts and confirms the asset exactly like a
   * single-request upload, so transcoding starts through the same path.
   */
  async function completeMultipartUpload(
    mediaId: string,
    ownerId: string,
    logger?: FastifyBaseLogger,
    userRoles?: readonly string[],
  ): Promise<{ status: MediaAssetStatus }> {
    const media = await findMultipartUpload(mediaId, ownerId, userRoles);
    const { fileSize, partSize, totalParts } = multipartGeometry(media);

    // Storage is the authority on which parts exist and their ETags. Reading
    // them here means completion does not depend on the browser being allowed
    // to read ETag response headers through CORS. Parts with the wrong size are
    // treated as missing so a client cannot join a file larger than declared.
    let uploadedParts: Array<{ partNumber: number; etag: string }>;
    try {
      const listed = await services.storage.listMultipartUploadParts(
        media.storage_key,
        media.upload_id!,
      );
      uploadedParts = listed
        .filter(
          (part) =>
            part.partNumber >= 1 &&
            part.partNumber <= totalParts &&
            part.size ===
              expectedMultipartPartSize(part.partNumber, partSize, fileSize),
        )
        .map((part) => ({ partNumber: part.partNumber, etag: part.etag }))
        .sort((left, right) => left.partNumber - right.partNumber);
    } catch (error) {
      if (!isNoSuchUploadError(error)) throw error;
      await mediaRepo.updateMediaAssetUploadSession(database, mediaId, {
        uploadId: null,
        partSize: null,
      });
      throw new AppError(
        409,
        "UPLOAD_SESSION_EXPIRED",
        "This upload session has expired. Start the upload again.",
      );
    }

    if (uploadedParts.length !== totalParts) {
      throw new AppError(
        400,
        "MULTIPART_PARTS_INCOMPLETE",
        "Every part must be uploaded before the upload can be completed.",
      );
    }

    try {
      await services.storage.completeMultipartUpload(
        media.storage_key,
        media.upload_id!,
        uploadedParts,
      );
    } catch (error) {
      if (!isNoSuchUploadError(error)) throw error;
      await mediaRepo.updateMediaAssetUploadSession(database, mediaId, {
        uploadId: null,
        partSize: null,
      });
      throw new AppError(
        409,
        "UPLOAD_SESSION_EXPIRED",
        "This upload session has expired. Start the upload again.",
      );
    }

    await mediaRepo.updateMediaAssetUploadSession(database, mediaId, {
      uploadId: null,
      partSize: null,
    });

    return await confirmUpload(mediaId, ownerId, logger, userRoles);
  }

  /**
   * Abandons an interrupted upload: discards its parts and the unattached
   * media row. Already-completed uploads are left untouched.
   */
  async function abortMultipartUpload(
    mediaId: string,
    ownerId: string,
    userRoles?: readonly string[],
    logger?: FastifyBaseLogger,
  ): Promise<{ aborted: true }> {
    const isAdmin = await reachesAllMedia(ownerId, userRoles, "manage");
    const media = await mediaRepo.findMediaAssetSummaryById(
      database,
      mediaId,
      isAdmin ? undefined : ownerId,
    );

    if (!media) {
      throw new AppError(404, "MEDIA_NOT_FOUND", "Media asset not found.");
    }

    if (media.upload_id) {
      try {
        await services.storage.abortMultipartUpload(
          media.storage_key,
          media.upload_id,
        );
      } catch (error) {
        // The row (and its upload id) is about to go, so a bucket lifecycle
        // rule is the last line of defence for the parts storage still holds.
        logger?.warn(
          { err: error, mediaId, storageKey: media.storage_key },
          "Failed to abort multipart upload; storage may keep the parts",
        );
      }
    }

    if (media.status === "uploading") {
      await mediaRepo.deleteMediaAssets(database, [mediaId]);
    } else {
      await mediaRepo.updateMediaAssetUploadSession(database, mediaId, {
        uploadId: null,
        partSize: null,
      });
    }

    return { aborted: true };
  }

  /**
   * Verifies that a media file is uploaded and exists, then sets status to 'uploaded'.
   * If it's a video, automatically queues and triggers transcoding.
   */
  /**
   * Admin, or a team role that reaches every course: "view" lets reviewers
   * and editors play and download any course's media; "manage" lets those
   * who edit every course's content handle uploads that are not their own.
   */
  async function reachesAllMedia(
    userId: string | null | undefined,
    userRoles: readonly string[] | undefined,
    purpose: "view" | "manage",
  ): Promise<boolean> {
    if (userRoles?.some((role) => role.toLowerCase() === ADMIN_ROLE)) {
      return true;
    }
    if (!userId) return false;
    const keys: Permission[] =
      purpose === "view"
        ? ["course.preview"]
        : [
            "course.curriculum.update",
            "lesson.video.update",
            "course.thumbnail.update",
            "lesson.thumbnail.update",
          ];
    for (const key of keys) {
      if (await hasAcademyPermission(database, userId, key)) return true;
    }
    return false;
  }

  async function confirmUpload(
    mediaId: string,
    ownerId: string,
    logger?: FastifyBaseLogger,
    userRoles?: readonly string[],
  ): Promise<{ status: MediaAssetStatus }> {
    const isAdmin = await reachesAllMedia(ownerId, userRoles, "manage");
    const media = await mediaRepo.findMediaAssetSummaryById(
      database,
      mediaId,
      isAdmin ? undefined : ownerId,
    );

    if (!media) {
      throw new AppError(404, "MEDIA_NOT_FOUND", "Media asset not found.");
    }

    if (media.status !== "uploading") {
      return { status: media.status };
    }

    const metadata = await services.storage.headObject(media.storage_key);

    if (!metadata) {
      throw new AppError(
        400,
        "FILE_NOT_FOUND",
        "File could not be found in storage.",
      );
    }

    // A public object is served to anyone under the type it was stored
    // with. The signed upload URL already holds that to the declared type;
    // this refuses, and removes, one that differs all the same.
    if (
      resolveMediaVisibility(media.storage_key) === "public" &&
      metadata.contentType &&
      baseMimeType(metadata.contentType) !== baseMimeType(media.mime_type)
    ) {
      await services.storage
        .deleteObject(media.storage_key)
        .catch(() => undefined);
      throw new AppError(
        400,
        "FILE_TYPE_MISMATCH",
        "Uploaded file type does not match the type that was declared.",
      );
    }

    const presignedSize = Number(media.size_bytes);
    if (
      metadata.contentLength !== undefined &&
      presignedSize > 0 &&
      metadata.contentLength !== presignedSize
    ) {
      throw new AppError(
        400,
        "FILE_SIZE_MISMATCH",
        "Uploaded file size does not match presigned size.",
      );
    }

    if (
      presignedSize <= 0 &&
      metadata.contentLength !== undefined &&
      metadata.contentLength > 0
    ) {
      await mediaRepo.updateMediaAssetProbedDetails(database, mediaId, {
        size_bytes: metadata.contentLength,
      });
      media.size_bytes = metadata.contentLength;
    }

    await mediaRepo.updateMediaAssetStatus(database, mediaId, "uploaded");

    if (media.type === "image") {
      const jobId = crypto.randomUUID();
      await enqueueImageJob(database, { id: jobId, media_id: mediaId });
      await mediaRepo.updateMediaAssetStatus(database, mediaId, "processing");
      return { status: "processing" };
    }

    // Once video is uploaded, automatically queue and dispatch it for processing
    if (media.type === "video" && logger) {
      await queueTranscodeJob(mediaId, ownerId, logger, userRoles);
    }

    return { status: "uploaded" };
  }

  /**
   * Triggers transcoding job if not already ready or processing.
   * Always dispatches to the queue and triggers Lambda if configured.
   * If a job already exists and is active, it does not re-trigger.
   */
  async function queueTranscodeJob(
    mediaId: string,
    ownerId: string,
    logger?: FastifyBaseLogger,
    userRoles?: readonly string[],
  ): Promise<{ should202: boolean; jobId: string | null }> {
    const isAdmin = await reachesAllMedia(ownerId, userRoles, "manage");
    const media = await mediaRepo.findMediaAssetById(
      database,
      mediaId,
      isAdmin ? undefined : ownerId,
    );

    if (!media) {
      throw new AppError(
        400,
        "INVALID_MEDIA",
        "Selected media asset is invalid or unauthorized.",
      );
    }

    if (media.type !== "video") {
      return { should202: false, jobId: null };
    }

    // A YouTube import is packaged by its own worker, never transcoded:
    // attaching one (to a new lesson, or again) only waits for it.
    if (isYoutubeImportMedia(media.metadata)) {
      return { should202: media.status !== "ready", jobId: null };
    }

    if (
      media.status !== "uploaded" &&
      media.status !== "ready" &&
      media.status !== "failed"
    ) {
      throw new AppError(
        400,
        "MEDIA_NOT_UPLOADED",
        "Video file must be uploaded and confirmed first.",
      );
    }

    if (media.status === "failed") {
      await mediaRepo.updateMediaAssetStatus(database, media.id, "uploaded");
    }

    const existingJob = await mediaRepo.findVideoJobStateByVideoId(
      database,
      media.id,
    );

    // If job already exists and is active or completed, don't trigger again
    if (existingJob) {
      if (
        existingJob.status === "queued" ||
        existingJob.status === "provisioning" ||
        existingJob.status === "processing"
      ) {
        logger?.info(
          {
            jobId: existingJob.id,
            videoId: media.id,
            status: existingJob.status,
          },
          "Video job already active. Skipping duplicate trigger.",
        );
        return { should202: true, jobId: existingJob.id };
      }

      if (existingJob.status === "completed") {
        logger?.info(
          { jobId: existingJob.id, videoId: media.id },
          "Video job already completed. Skipping duplicate trigger.",
        );
        if (media.status !== "ready") {
          await mediaRepo.updateMediaAssetStatus(database, media.id, "ready");
        }
        return { should202: false, jobId: existingJob.id };
      }
    }

    const jobId = crypto.randomUUID();
    const now = new Date();
    const outputPrefix = `${resolveMediaVisibility(media.storage_key)}/transcoded/${media.id}`;

    let videoSize = Number(media.size_bytes) || 0;
    let width = media.width;
    let height = media.height;
    let durationSeconds = media.duration_seconds;
    let videoMetadata: Record<string, unknown> | null = null;

    // Check if probe is needed before dispatching (missing size, dimensions, or duration)
    if (videoSize <= 0 || !width || !height || !durationSeconds) {
      try {
        const presignedUrl = await services.storage.getPresignedGetUrl(
          media.storage_key,
        );
        logger?.info(
          { mediaId: media.id, storageKey: media.storage_key },
          "[media-service] Probing video source with ffprobe to extract size and dimensions before dispatch",
        );
        const probed = await probeVideoSource(presignedUrl, {
          onWarning: (message) => logger?.warn({ mediaId: media.id }, message),
        });
        if (probed) {
          if (videoSize <= 0 && probed.sizeBytes > 0) {
            videoSize = probed.sizeBytes;
          }
          if (!width && probed.width > 0) {
            width = probed.width;
          }
          if (!height && probed.height > 0) {
            height = probed.height;
          }
          if (!durationSeconds && probed.durationSeconds > 0) {
            durationSeconds = probed.durationSeconds;
          }
          videoMetadata = {
            width: width ?? undefined,
            height: height ?? undefined,
            durationSeconds: durationSeconds ?? undefined,
            codec: probed.codec,
            fps: probed.fps,
            bitrate: probed.bitrate,
          };

          await mediaRepo.updateMediaAssetProbedDetails(database, media.id, {
            size_bytes: videoSize,
            width: width ?? null,
            height: height ?? null,
            duration_seconds: durationSeconds ?? null,
            metadata: {
              ...(typeof media.metadata === "object" && media.metadata !== null
                ? media.metadata
                : {}),
              probed: {
                codec: probed.codec,
                fps: probed.fps,
                bitrate: probed.bitrate,
              },
            },
          });
        }
      } catch (probeErr) {
        logger?.warn(
          { err: probeErr, mediaId: media.id },
          "[media-service] Video probe encountered error, continuing with available metadata",
        );
      }
    }

    if (videoSize <= 0) {
      try {
        const head = await services.storage.headObject(media.storage_key);
        if (head?.contentLength && head.contentLength > 0) {
          videoSize = head.contentLength;
          await mediaRepo.updateMediaAssetProbedDetails(database, media.id, {
            size_bytes: videoSize,
          });
        }
      } catch {
        // Ignore
      }
    }

    try {
      await mediaRepo.insertVideoJob(database, {
        id: jobId,
        video_id: media.id,
        video_key: media.storage_key,
        output_prefix: outputPrefix,
        video_size: videoSize,
        video_metadata: videoMetadata,
        qualities: VIDEO_QUALITIES,
        status: "queued",
        created_at: now,
      });
    } catch (insertErr) {
      if (isUniqueViolation(insertErr)) {
        const raceWinner = await mediaRepo.findVideoJobStateByVideoId(
          database,
          media.id,
        );
        if (raceWinner) {
          logger?.info(
            { jobId: raceWinner.id, videoId: media.id },
            "Lost the race to queue this video's transcode job. Reusing the concurrent job instead.",
          );
          return { should202: true, jobId: raceWinner.id };
        }
      }
      throw insertErr;
    }

    // Dispatch the transcoding job (always queue, and trigger lambda if configured)
    try {
      const dispatchResult = await services.videoDispatch.dispatch({
        action: "claim",
        jobId,
        videoId: media.id,
        videoKey: media.storage_key,
        outputPrefix,
        qualities: VIDEO_QUALITIES,
        videoSize,
        videoMetadata: videoMetadata ?? undefined,
        thumbnailDestination: `public/thumbnails/${media.id}/original.webp`,
      });
      if (dispatchResult?.providerJobId) {
        // Cancellation must address the provider by ITS job id.
        await mediaRepo.setVideoJobProviderJobId(
          database,
          jobId,
          dispatchResult.providerJobId,
        );
      }
      logger?.info(
        { jobId, mediaId: media.id },
        "Video transcoding job queued and dispatched successfully",
      );
    } catch (dispatchErr) {
      const message =
        dispatchErr instanceof Error ? dispatchErr.message : "Dispatch failed.";
      logger?.error(
        { err: dispatchErr, jobId, mediaId: media.id },
        "Failed to dispatch video transcoding job; marking job as failed",
      );
      await mediaRepo.updateVideoJobStatus(database, jobId, {
        status: "failed",
        error_message: message,
        failed_at: new Date(),
      });
      await mediaRepo.updateMediaAssetStatus(database, media.id, "failed");
    }

    return { should202: true, jobId };
  }

  async function retryTranscodeJob(
    mediaId: string,
    ownerId: string,
    logger?: FastifyBaseLogger,
    userRoles?: readonly string[],
  ) {
    const isAdmin = await reachesAllMedia(ownerId, userRoles, "manage");
    const media = await mediaRepo.findMediaAssetSummaryById(
      database,
      mediaId,
      isAdmin ? undefined : ownerId,
    );
    if (!media || media.type !== "video") {
      throw new AppError(404, "MEDIA_NOT_FOUND", "Video asset not found.");
    }
    if (media.status !== "failed" && media.status !== "uploaded") {
      throw new AppError(
        409,
        "MEDIA_NOT_RETRYABLE",
        "This video is not in a retryable state.",
      );
    }

    const job = await mediaRepo.findVideoJobByVideoId(database, mediaId);
    if (!job) return queueTranscodeJob(mediaId, ownerId, logger, userRoles);
    if (["queued", "provisioning", "processing"].includes(job.status)) {
      return { should202: true, jobId: job.id };
    }

    await mediaRepo.updateVideoJobStatus(database, job.id, {
      status: "queued",
      progress_percent: 0,
      error_message: null,
      failed_at: null,
    });
    await mediaRepo.updateMediaAssetStatus(database, mediaId, "uploaded");

    let retryVideoSize = Number(media.size_bytes) || job.video_size || 0;
    let width = media.width;
    let height = media.height;
    let durationSeconds = media.duration_seconds;
    let retryVideoMetadata: Record<string, unknown> | null =
      (job.video_metadata as Record<string, unknown> | null) ?? null;

    if (retryVideoSize <= 0 || !width || !height || !durationSeconds) {
      try {
        const presignedUrl = await services.storage.getPresignedGetUrl(
          media.storage_key,
        );
        const probed = await probeVideoSource(presignedUrl, {
          onWarning: (message) => logger?.warn({ mediaId: media.id }, message),
        });
        if (probed) {
          if (retryVideoSize <= 0 && probed.sizeBytes > 0) {
            retryVideoSize = probed.sizeBytes;
          }
          if (!width && probed.width > 0) width = probed.width;
          if (!height && probed.height > 0) height = probed.height;
          if (!durationSeconds && probed.durationSeconds > 0) {
            durationSeconds = probed.durationSeconds;
          }
          retryVideoMetadata = {
            width: width ?? undefined,
            height: height ?? undefined,
            durationSeconds: durationSeconds ?? undefined,
            codec: probed.codec,
            fps: probed.fps,
            bitrate: probed.bitrate,
          };
          await mediaRepo.updateMediaAssetProbedDetails(database, media.id, {
            size_bytes: retryVideoSize,
            width: width ?? null,
            height: height ?? null,
            duration_seconds: durationSeconds ?? null,
          });
        }
      } catch {
        // Ignore probe error on retry
      }
    }

    try {
      const dispatchResult = await services.videoDispatch.dispatch({
        action: "claim",
        jobId: job.id,
        videoId: mediaId,
        videoKey: media.storage_key,
        outputPrefix: job.output_prefix,
        qualities: job.qualities,
        videoSize: retryVideoSize,
        videoMetadata: retryVideoMetadata ?? undefined,
        thumbnailDestination: `public/thumbnails/${mediaId}/original.webp`,
      });
      if (dispatchResult?.providerJobId) {
        await mediaRepo.setVideoJobProviderJobId(
          database,
          job.id,
          dispatchResult.providerJobId,
        );
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Dispatch failed.";
      await mediaRepo.updateVideoJobStatus(database, job.id, {
        status: "failed",
        error_message: message,
        failed_at: new Date(),
      });
      await mediaRepo.updateMediaAssetStatus(database, mediaId, "failed");
      throw error;
    }
    logger?.info({ jobId: job.id, mediaId }, "Video transcoding retry queued");
    return { should202: true, jobId: job.id };
  }

  async function cancelTranscodeJob(
    mediaId: string,
    ownerId: string,
    logger?: FastifyBaseLogger,
    userRoles?: readonly string[],
  ) {
    const isAdmin = await reachesAllMedia(ownerId, userRoles, "manage");
    const media = await mediaRepo.findMediaAssetSummaryById(
      database,
      mediaId,
      isAdmin ? undefined : ownerId,
    );
    if (!media || media.type !== "video") {
      throw new AppError(404, "MEDIA_NOT_FOUND", "Video asset not found.");
    }

    const job = await mediaRepo.findVideoJobByVideoId(database, mediaId);
    if (!job) {
      throw new AppError(
        409,
        "MEDIA_JOB_NOT_FOUND",
        "No transcoding job exists for this video.",
      );
    }
    if (!["queued", "provisioning", "processing"].includes(job.status)) {
      throw new AppError(
        409,
        "MEDIA_NOT_CANCELLABLE",
        "This video is no longer being transcoded.",
      );
    }

    try {
      await services.videoDispatch.dispatch({
        status: "cancelled",
        jobId: job.id,
        // The provider cancels by ITS job id, not our internal uuid.
        providerJobId: job.provider_job_id ?? undefined,
        videoId: mediaId,
        videoKey: job.video_key,
        outputPrefix: job.output_prefix,
        deleteFiles: true,
        deleteMedia: false,
      });
    } catch (error) {
      logger?.error(
        { err: error, jobId: job.id, mediaId },
        "Failed to dispatch video cancellation cleanup",
      );
      throw error;
    }

    // In serverful/local mode the fleet manager watches the database directly;
    // in serverless mode the cancellation event above performs this update.
    await mediaRepo.updateVideoJobStatus(database, job.id, {
      status: "cancelled",
    });
    await mediaRepo.updateMediaAssetStatus(database, mediaId, "failed");

    return { cancelled: true, jobId: job.id };
  }

  /**
   * Retrieves a single media asset by ID with optional owner verification.
   * Inter-module API method (Rule 11 compliance).
   */
  async function getMediaAsset(
    mediaId: string,
    ownerId?: string,
    userRoles?: readonly string[],
  ) {
    const isAdmin = await reachesAllMedia(ownerId, userRoles, "manage");
    return await mediaRepo.findMediaAssetById(
      database,
      mediaId,
      isAdmin ? undefined : ownerId,
    );
  }

  async function getImageVariantManifest(
    mediaId: string,
    ownerId?: string,
    userRoles?: readonly string[],
  ): Promise<MediaImageVariantManifest> {
    const media = await getMediaAsset(mediaId, ownerId, userRoles);
    if (!media || media.type !== "image") {
      throw new AppError(404, "MEDIA_NOT_FOUND", "Image asset not found.");
    }

    const metadata = isRecord(media.metadata) ? media.metadata : {};
    const variants = Array.isArray(metadata.variants)
      ? metadata.variants.flatMap((variant) => {
          if (!isRecord(variant)) return [];
          const width = variant.width;
          const height = variant.height;
          return typeof width === "number" &&
            Number.isInteger(width) &&
            width > 0 &&
            typeof height === "number" &&
            Number.isInteger(height) &&
            height > 0
            ? [{ width, height }]
            : [];
        })
      : [];

    return {
      width: media.width,
      height: media.height,
      variants: variants.sort((left, right) => left.width - right.width),
    };
  }

  /**
   * Retrieves multiple media assets by IDs with optional owner verification.
   * Inter-module API method (Rule 11 compliance).
   */
  async function getMediaAssets(
    mediaIds: string[],
    ownerId?: string,
    userRoles?: readonly string[],
  ) {
    const isAdmin = await reachesAllMedia(ownerId, userRoles, "manage");
    return await mediaRepo.findMediaAssetsByIds(
      database,
      mediaIds,
      isAdmin ? undefined : ownerId,
    );
  }

  /**
   * Where a video came from (the YouTube video it was imported from), for
   * whoever may manage it: its owner, or staff who manage every course.
   */
  async function getMediaSource(
    mediaId: string,
    ownerId: string,
    userRoles?: readonly string[],
  ): Promise<MediaSourceResponse> {
    const isAdmin = await reachesAllMedia(ownerId, userRoles, "manage");
    const media = await mediaRepo.findMediaAssetById(
      database,
      mediaId,
      isAdmin ? undefined : ownerId,
    );
    if (!media) {
      throw new AppError(404, "MEDIA_NOT_FOUND", "Media asset not found.");
    }
    const source = await mediaRepo.findMediaSource(database, mediaId);
    return {
      source: source
        ? {
            provider: source.provider,
            externalId: source.external_id,
            url: source.source_url,
            title: source.title,
            channel: source.channel,
          }
        : null,
    };
  }

  /**
   * Fetches transcoding progress for a video asset.
   */
  async function getVideoJobProgress(
    videoId: string,
    ownerId?: string,
    userRoles?: readonly string[],
  ) {
    const isAdmin = await reachesAllMedia(ownerId, userRoles, "manage");
    // This runs every 1.5s for each open progress stream, so it reads only
    // the two statuses and the percentage, in one query.
    const progress = await mediaRepo.findVideoJobProgress(
      database,
      videoId,
      isAdmin ? undefined : ownerId,
    );
    if (!progress) {
      throw new AppError(404, "MEDIA_NOT_FOUND", "Media asset not found.");
    }

    if (!progress.job_id || !progress.job_status) {
      // A video being imported from YouTube has no transcode job until the
      // import finishes; its import job reports the progress instead.
      const imported = await findYoutubeImportProgress(database, videoId);
      if (imported) return imported;
      throw new AppError(
        404,
        "JOB_NOT_FOUND",
        "Video transcoding job not found.",
      );
    }

    let status = progress.job_status;
    let progressPercent = Number(progress.progress_percent ?? 0);

    if (status === "completed" && progress.media_status !== "ready") {
      await mediaRepo.updateMediaAssetStatus(database, videoId, "ready");
    } else if (status === "failed" && progress.media_status !== "failed") {
      await mediaRepo.updateMediaAssetStatus(database, videoId, "failed");
    } else if (progress.media_status === "ready" && status !== "completed") {
      status = "completed";
      progressPercent = 100;
      await mediaRepo
        .updateVideoJobStatus(database, progress.job_id, {
          status: "completed",
          progress_percent: 100,
        })
        .catch(() => {});
    }

    return {
      status,
      // The worker reports live FFmpeg progress to worker_monitoring. The
      // video_jobs value is the durable fallback used before a worker is
      // assigned and after the worker is released.
      progressPercent: Math.max(0, Math.min(100, Math.floor(progressPercent))),
      // video_jobs.error_message holds the provider's or dispatcher's own
      // text (AWS account ids, role and queue ARNs, bucket paths). It stays
      // in the database and the logs; the author sees a fixed message.
      error: status === "failed" ? VIDEO_JOB_FAILED_MESSAGE : null,
    };
  }

  async function assertPlaybackAccess(
    context: {
      course_id: string;
      course_status: string;
      course_creator_id: string | null;
      pricing_type: string | null;
      access_type: string | null;
      is_preview: boolean;
      is_published?: boolean;
      /** The course's first published lesson. */
      is_first_lesson?: boolean;
    },
    user?: PlaybackUser,
  ): Promise<void> {
    const isOwner = Boolean(user && context.course_creator_id === user.id);
    const isAdmin =
      isOwner || (await reachesAllMedia(user?.id, user?.roles, "view"));

    if (isOwner || isAdmin) return;

    // An archived course plays on for a learner who holds access to it.
    // Nobody else is played anything from it, a preview lesson included.
    if (
      !(await accessService.isCourseOpenToLearner(database, user?.id, {
        id: context.course_id,
        status: context.course_status,
      }))
    ) {
      throw new AppError(404, "COURSE_NOT_FOUND", "Course not found.");
    }

    if (context.is_published === false) {
      throw new AppError(404, "LESSON_NOT_FOUND", "Lesson not found.");
    }

    // Preview lessons are public. A free course that is not
    // access-restricted is open to anyone who is signed in; a visitor who
    // is not gets its first lesson only.
    if (context.is_preview) return;
    if (
      isOpenFreeCourse(context) &&
      (user || context.is_first_lesson === true)
    ) {
      return;
    }

    if (!user) {
      throw new AppError(
        401,
        "UNAUTHORIZED",
        "Authentication is required to play this lesson.",
      );
    }

    const hasAccess = await accessService.hasActiveAccess(
      database,
      user.id,
      context.course_id,
    );
    if (!hasAccess) {
      throw new AppError(
        403,
        "COURSE_ACCESS_DENIED",
        "You do not have access to this course.",
      );
    }
  }

  /**
   * `media` is the asset as the playback context read it alongside the
   * lesson; its fields are null when the lesson's media row is gone.
   */
  async function getReadyPlaybackOutput(
    mediaId: string,
    media: {
      media_type: string | null;
      media_status: string | null;
      media_storage_key: string | null;
    },
    options: { verifyManifest?: boolean } = {},
  ) {
    if (media.media_type !== "video" || media.media_storage_key === null) {
      throw new AppError(404, "MEDIA_NOT_FOUND", "Video asset not found.");
    }

    if (media.media_status !== "ready") {
      throw new AppError(
        409,
        "MEDIA_NOT_READY",
        "This video is still being prepared.",
      );
    }

    const outputPrefix = normalizeOutputPrefix(media.media_storage_key);
    const latestOutput = await mediaRepo.findLatestVideoOutput(
      database,
      mediaId,
    );
    const manifestKey = normalizeOutputPrefix(
      latestOutput?.master_playlist_path || `${outputPrefix}/master.m3u8`,
    );
    if (options.verifyManifest !== false) {
      const manifest = await services.storage.headObject(manifestKey);
      if (!manifest) {
        throw new AppError(
          409,
          "MEDIA_NOT_READY",
          "This video is still being prepared.",
        );
      }
    }

    // A new transcode adds a new output row; its id tells the copies apart.
    return { outputPrefix, manifestKey, outputVersion: latestOutput?.id ?? "" };
  }

  function getDirectDelivery(storageKey: string) {
    return getCdnDeliveryUrl(services.storage, storageKey);
  }

  /**
   * Whether the asset is the thumbnail or trailer of an archived course the
   * viewer holds access to. Such a course is no longer public, so its
   * picture and trailer are not either, but its learners still open it.
   */
  async function isMediaOfHeldArchivedCourse(
    mediaId: string,
    userId: string | undefined,
  ): Promise<boolean> {
    if (!userId) return false;
    const courseIds = await mediaRepo.listArchivedCourseIdsShowingMedia(
      database,
      mediaId,
    );
    for (const courseId of courseIds) {
      if (await accessService.hasActiveAccess(database, userId, courseId)) {
        return true;
      }
    }
    return false;
  }

  async function getMediaDelivery(
    mediaId: string,
    requestingUserId?: string,
    userRoles?: readonly string[],
  ) {
    const isAdmin = await reachesAllMedia(requestingUserId, userRoles, "view");
    const media = await mediaRepo.findMediaAssetSummaryById(database, mediaId);
    if (!media) {
      throw new AppError(404, "MEDIA_NOT_FOUND", "Media asset not found.");
    }

    const isPublic = await mediaRepo.isMediaAttachedToPublishedCourse(
      database,
      mediaId,
    );
    if (
      !isPublic &&
      media.owner_id !== requestingUserId &&
      !isAdmin &&
      !(await isMediaOfHeldArchivedCourse(mediaId, requestingUserId))
    ) {
      throw new AppError(404, "MEDIA_NOT_FOUND", "Media asset not found.");
    }

    const delivery = getDirectDelivery(media.storage_key);
    let thumbnailUrl: string | undefined;
    if (media.type === "video") {
      try {
        thumbnailUrl = getDirectDelivery(
          `public/thumbnails/${media.id}/original.webp`,
        ).url;
      } catch {
        // Ignore
      }
    }
    return {
      url: delivery.url,
      ...(delivery.expiresAt ? { expiresAt: delivery.expiresAt } : {}),
      ...(thumbnailUrl ? { thumbnailUrl } : {}),
    };
  }

  /**
   * Whether the viewer may download a course's lesson files. Being able to
   * watch a lesson is not enough: a preview lesson, and a free course's
   * first lesson, play for anyone, signed in or not. The files are for the
   * people the course itself is open to: its owner, an administrator, a
   * signed-in learner on a free course that is not restricted, and a
   * learner who holds access.
   */
  async function assertResourceDownloadAccess(
    context: {
      course_id: string;
      course_creator_id: string | null;
      pricing_type: string | null;
      access_type: string | null;
    },
    user?: PlaybackUser,
  ): Promise<void> {
    const isOwner = Boolean(user && context.course_creator_id === user.id);
    const isAdmin =
      isOwner || (await reachesAllMedia(user?.id, user?.roles, "view"));
    if (isOwner || isAdmin) return;

    if (!user) {
      throw new AppError(
        401,
        "UNAUTHORIZED",
        "Sign in to download this lesson's resources.",
      );
    }

    if (isOpenFreeCourse(context)) return;

    const hasAccess = await accessService.hasActiveAccess(
      database,
      user.id,
      context.course_id,
    );
    if (!hasAccess) {
      throw new AppError(
        403,
        "COURSE_ACCESS_DENIED",
        "You do not have access to this course.",
      );
    }
  }

  /**
   * Resolves a lesson by its public number and applies the access rules of
   * watching it. A lesson's resources go through this too, and then through
   * assertResourceDownloadAccess, which asks for more.
   */
  async function resolveAuthorizedLesson(
    courseIdOrSlug: string,
    lessonNumber: number,
    user?: PlaybackUser,
  ) {
    if (!Number.isInteger(lessonNumber) || lessonNumber < 1) {
      throw new AppError(404, "LESSON_NOT_FOUND", "Lesson not found.");
    }

    const isUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        courseIdOrSlug,
      );
    const course = await (isUuid
      ? mediaRepo.findPlaybackCourseById(database, courseIdOrSlug)
      : mediaRepo.findPlaybackCourseBySlug(database, courseIdOrSlug));

    if (!course) {
      throw new AppError(404, "COURSE_NOT_FOUND", "Course not found.");
    }

    const isOwner = Boolean(user && user.id === course.creator_id);
    const isAdmin =
      isOwner || (await reachesAllMedia(user?.id, user?.roles, "view"));
    const canManageCourse = isOwner || isAdmin;

    if (
      !canManageCourse &&
      !(await accessService.isCourseOpenToLearner(database, user?.id, course))
    ) {
      throw new AppError(404, "COURSE_NOT_FOUND", "Course not published.");
    }

    const context = await mediaRepo.findPlaybackLessonContext(
      database,
      course.id,
      lessonNumber,
      // Lesson numbers count the lessons the viewer is shown, so a manager
      // in their Student view is counted through published lessons only,
      // as the course overview and the resume context count them.
      { includeUnpublished: canManageCourse && !user?.learnerView },
    );
    if (!context) {
      throw new AppError(404, "LESSON_NOT_FOUND", "Lesson not found.");
    }

    // Lesson numbers count the published lessons in order, so number one is
    // the course's first lesson for everyone this rule applies to.
    await assertPlaybackAccess(
      { ...context, is_first_lesson: lessonNumber === 1 },
      user,
    );
    return context;
  }

  async function resolveAuthorizedPlaybackLesson(
    courseIdOrSlug: string,
    lessonNumber: number,
    user?: PlaybackUser,
  ) {
    const context = await resolveAuthorizedLesson(
      courseIdOrSlug,
      lessonNumber,
      user,
    );
    if (!context.content_media_id) {
      throw new AppError(
        404,
        "MEDIA_NOT_FOUND",
        "This lesson does not have a playable video.",
      );
    }

    return context;
  }

  /**
   * Gives a learner who has the course a link to download one of a lesson's
   * resources. A lesson does not need a video to have resources.
   */
  async function getLessonResourceDownload(
    courseIdOrSlug: string,
    lessonNumber: number,
    resourceId: string,
    user?: PlaybackUser,
  ): Promise<LessonResourceDownloadResponse> {
    const lesson = await resolveAuthorizedLesson(
      courseIdOrSlug,
      lessonNumber,
      user,
    );
    await assertResourceDownloadAccess(lesson, user);

    const resource = await findLessonResourceForDownload(
      database,
      lesson.lesson_id,
      resourceId,
    );
    if (!resource) {
      throw new AppError(404, "RESOURCE_NOT_FOUND", "Resource not found.");
    }

    const media = await mediaRepo.findMediaAssetSummaryById(
      database,
      resource.media_asset_id,
    );
    if (!media) {
      throw new AppError(404, "RESOURCE_NOT_FOUND", "Resource not found.");
    }

    const fileName = media.original_filename || resource.title;
    const url = await services.storage.getPresignedGetUrl(
      media.storage_key,
      LESSON_RESOURCE_DOWNLOAD_TTL_SECONDS,
      { responseContentDisposition: buildAttachmentDisposition(fileName) },
    );
    return { url };
  }

  function createPlaybackSegmentToken(
    manifestKey: string,
  ): VideoPlaybackToken | null {
    const manifestPrefix = manifestKey.replace(/\/[^/]+$/u, "");
    if (services.storage.isCdnPublicKey(manifestPrefix)) return null;

    // A token is its expiry plus a signature of the folder, so two learners
    // given one in the same second would share it, and the CDN binds a token
    // to the first client that uses it. Spreading expiries over up to a
    // quarter of the lifetime (at most an hour) keeps their tokens apart.
    const ttlSeconds = services.storage.getCdnHlsTokenTtlSeconds();
    const expiryJitterSeconds = crypto.randomInt(
      0,
      Math.max(1, Math.min(3_600, Math.floor(ttlSeconds / 4))),
    );
    const expiresAt =
      Math.floor(Date.now() / 1000) + ttlSeconds - expiryJitterSeconds;
    const token = services.storage.createCdnAccessToken(
      manifestPrefix,
      expiresAt,
    );
    if (!token) {
      throw new AppError(
        503,
        "CDN_NOT_CONFIGURED",
        "Protected media delivery is not configured.",
      );
    }
    return { token, expiresAt };
  }

  /**
   * The HLS master playlist or DASH MPD to hand the player with its
   * bootstrap, when it can be had within a few hundred milliseconds. Never
   * fails the bootstrap.
   */
  async function readInlinedMasterManifest(
    manifestKey: string,
    outputVersion: string,
    logger?: FastifyBaseLogger,
  ): Promise<string | undefined> {
    if (!/\.(?:m3u8|mpd)$/iu.test(manifestKey)) return undefined;
    try {
      // Keyed by output too: a re-transcode writes the same key, and the
      // cached copy of the old manifest must not outlive it.
      const text = await MASTER_MANIFEST_CACHE.resolve(
        `${manifestKey}#${outputVersion}`,
        () =>
          readStorageText(
            services.storage,
            manifestKey,
            MASTER_MANIFEST_MAX_BYTES,
          ),
      );
      if (text === undefined) {
        logger?.debug(
          { manifestKey },
          "Master playlist not inlined; the player fetches it from the CDN.",
        );
      }
      return text;
    } catch (error) {
      logger?.warn(
        { err: error, manifestKey },
        "Master playlist inline failed.",
      );
      return undefined;
    }
  }

  /**
   * The CDN address of the video's storyboard index when one was made from
   * this output. Never fails the bootstrap.
   */
  async function readStoryboardUrl(
    manifestKey: string,
    outputVersion: string,
    logger?: FastifyBaseLogger,
  ): Promise<string | undefined> {
    const indexKey = storyboardIndexKeyFor(manifestKey);
    try {
      const indexPath = await STORYBOARD_PRESENCE_CACHE.resolve(
        indexKey,
        outputVersion,
        (key) =>
          readStorageText(services.storage, key, STORYBOARD_INDEX_MAX_BYTES),
      );
      if (indexPath === false) return undefined;
      // Not known yet (slow or failed read) is offered too, as the folder's
      // own index; see storyboard-presence-cache.ts.
      const playerIndexKey =
        indexPath === null
          ? indexKey
          : indexKey.replace(/index\.json$/u, indexPath);
      return services.storage.getCdnObjectUrl(playerIndexKey) ?? undefined;
    } catch (error) {
      logger?.warn({ err: error, indexKey }, "Storyboard lookup failed.");
      return undefined;
    }
  }

  async function getPlaybackBootstrap(
    courseIdOrSlug: string,
    lessonNumber: number,
    user?: PlaybackUser,
    options: {
      inlineManifest?: boolean;
      storyboard?: boolean;
      /** Include where this learner last was in the video. */
      resume?: boolean;
      /** Include the video's subtitle tracks. */
      subtitles?: boolean;
      logger?: FastifyBaseLogger;
    } = {},
  ): Promise<VideoPlaybackBootstrap> {
    const context = await resolveAuthorizedPlaybackLesson(
      courseIdOrSlug,
      lessonNumber,
      user,
    );

    // Chapter stills are an enhancement; never let them block playback.
    // They depend only on the authorized lesson, so the read overlaps the
    // output lookup below instead of following it.
    const chapterRowsPromise = listLessonChaptersForPlayback(
      database,
      context.lesson_id,
    ).catch(() => []);
    // Subtitles are optional too: a failed read plays without them.
    const subtitleRowsPromise = options.subtitles
      ? listLessonSubtitlesForPlayback(
          database,
          context.lesson_id,
          context.content_media_id!,
        ).catch((error: unknown) => {
          options.logger?.warn({ err: error }, "Subtitle lookup failed.");
          return [];
        })
      : Promise.resolve([]);

    // The transcode worker only marks a job completed after publishing its
    // output. Avoid an extra storage HEAD round-trip on every first play;
    // the CDN manifest request itself remains the authoritative final check.
    const { manifestKey, outputVersion } = await getReadyPlaybackOutput(
      context.content_media_id!,
      context,
      { verifyManifest: false },
    );
    const manifestUrl = services.storage.getCdnObjectUrl(manifestKey);
    if (!manifestUrl) {
      throw new AppError(
        503,
        "CDN_NOT_CONFIGURED",
        "Media delivery is not configured.",
      );
    }
    const playbackToken = createPlaybackSegmentToken(manifestKey);
    // Read alongside the chapters; access has already been checked above.
    const inlinedMasterManifestPromise = options.inlineManifest
      ? readInlinedMasterManifest(manifestKey, outputVersion, options.logger)
      : Promise.resolve(undefined);
    const storyboardUrlPromise = options.storyboard
      ? readStoryboardUrl(manifestKey, outputVersion, options.logger)
      : Promise.resolve(undefined);
    // Where this learner left the video, from whichever device. Optional:
    // a failure plays from wherever this browser says.
    const resumePositionPromise =
      options.resume && user && lessonPositions
        ? lessonPositions
            .findLessonPosition(user.id, context.course_id, context.lesson_id)
            .catch(() => null)
        : Promise.resolve(null);
    const [
      chapterRows,
      inlinedMasterManifest,
      storyboardUrl,
      resumePosition,
      subtitleRows,
    ] = await Promise.all([
      chapterRowsPromise,
      inlinedMasterManifestPromise,
      storyboardUrlPromise,
      resumePositionPromise,
      subtitleRowsPromise,
    ]);
    // The playback token covers the video's folder only, so a track kept
    // anywhere else could not be loaded and is left out.
    const outputFolder = manifestKey.replace(/[^/]+$/u, "");
    const subtitles = subtitleRows.flatMap((track) => {
      if (!track.storage_key.startsWith(outputFolder)) return [];
      const url = services.storage.getCdnObjectUrl(track.storage_key);
      return url
        ? [
            {
              url,
              language: track.language,
              label: track.label,
              kind: track.kind,
            },
          ]
        : [];
    });
    const chapters = chapterRows.map((chapter) => {
      let thumbnailUrl: string | undefined;
      if (chapter.thumbnail_key) {
        try {
          thumbnailUrl = getDirectDelivery(chapter.thumbnail_key).url;
        } catch {
          // Thumbnails are optional; play without one.
        }
      }
      return {
        title: chapter.title,
        startSeconds: chapter.start_seconds,
        ...(thumbnailUrl ? { thumbnailUrl } : {}),
      };
    });
    return {
      version: 1,
      courseSlug: context.course_slug,
      lessonId: context.lesson_id,
      mediaKey: `${encodeURIComponent(context.course_slug)}-lesson-${lessonNumber}`,
      manifestUrl,
      ...(playbackToken
        ? {
            segmentToken: playbackToken.token,
            segmentTokenExpiresAt: playbackToken.expiresAt,
          }
        : {}),
      ...(context.duration_seconds !== null &&
      context.duration_seconds !== undefined
        ? { duration: Number(context.duration_seconds) }
        : {}),
      ...(chapters.length > 0 ? { chapters } : {}),
      title: context.lesson_title,
      source: "paid-bootstrap-api",
      ...(inlinedMasterManifest ? { inlinedMasterManifest } : {}),
      ...(storyboardUrl ? { storyboardUrl } : {}),
      ...(resumePosition
        ? {
            resumePosition: {
              seconds: resumePosition.seconds,
              savedAt: resumePosition.savedAt.toISOString(),
            },
          }
        : {}),
      ...(subtitles.length > 0 ? { subtitles } : {}),
    };
  }

  async function getPlaybackToken(
    courseIdOrSlug: string,
    lessonNumber: number,
    user?: PlaybackUser,
  ): Promise<VideoPlaybackToken> {
    const context = await resolveAuthorizedPlaybackLesson(
      courseIdOrSlug,
      lessonNumber,
      user,
    );
    const { manifestKey } = await getReadyPlaybackOutput(
      context.content_media_id!,
      context,
      { verifyManifest: false },
    );
    const playbackToken = createPlaybackSegmentToken(manifestKey);
    if (!playbackToken) {
      throw new AppError(
        409,
        "CDN_TOKEN_NOT_REQUIRED",
        "This lesson does not require a protected playback token.",
      );
    }
    return playbackToken;
  }

  async function getHlsStream(
    mediaId: string,
    requestedPath: string,
    user?: PlaybackUser,
  ) {
    const context = await mediaRepo.findPlaybackMediaContext(database, mediaId);
    if (!context) {
      throw new AppError(404, "MEDIA_NOT_FOUND", "Video asset not found.");
    }

    await assertPlaybackAccess(context, user);
    const { outputPrefix } = await getReadyPlaybackOutput(mediaId, context, {
      verifyManifest: false,
    });
    const hlsPath = requestedPath.replace(/^\/+/, "");
    if (!isSafeHlsPath(hlsPath)) {
      throw new AppError(404, "MEDIA_NOT_FOUND", "HLS resource not found.");
    }

    const file = await services.storage.getObject(`${outputPrefix}/${hlsPath}`);
    if (!file) {
      throw new AppError(404, "MEDIA_NOT_FOUND", "HLS resource not found.");
    }

    return {
      stream: file.body,
      contentType: hlsContentType(hlsPath),
      contentLength: file.contentLength,
      isManifest: /\.m3u8$/i.test(hlsPath),
      // Only what a signed-out visitor may play is cacheable for everyone.
      isPublic:
        context.course_status === "published" &&
        (context.is_preview ||
          (isOpenFreeCourse(context) && context.is_first_lesson === true)),
    };
  }

  /**
   * Streams one responsive variant of an image.
   *
   * Access rule: an image is servable to anyone when it is the thumbnail of
   * a published course (it renders as a plain <img> on public, logged-out
   * pages). Anything else — draft-course images, unattached uploads — is
   * only servable to its owner or an admin. `requestingUserId` is undefined
   * for anonymous requests. `isPublic` tells the caller which case applied,
   * so a privately served image is never marked cacheable by shared caches.
   *
   * Returns MEDIA_NOT_FOUND (not 403) for an authorization failure too, so
   * a caller can't distinguish "doesn't exist" from "exists but isn't
   * yours" by probing IDs.
   */
  async function getImageVariantStream(
    mediaId: string,
    width: number,
    requestingUserId?: string,
    userRoles?: readonly string[],
  ) {
    const media = await mediaRepo.findMediaAssetById(database, mediaId);
    if (!media || media.type !== "image")
      throw new AppError(404, "MEDIA_NOT_FOUND", "Image asset not found.");
    const isAdmin = await reachesAllMedia(requestingUserId, userRoles, "view");
    const isPublic = await mediaRepo.isMediaAttachedToPublishedCourse(
      database,
      mediaId,
    );
    if (
      !isPublic &&
      media.owner_id !== requestingUserId &&
      !isAdmin &&
      !(await isMediaOfHeldArchivedCourse(mediaId, requestingUserId))
    )
      throw new AppError(404, "MEDIA_NOT_FOUND", "Media asset not found.");
    const variants =
      isRecord(media.metadata) && Array.isArray(media.metadata.variants)
        ? media.metadata.variants
        : [];
    const variant = variants.find(
      (item) =>
        typeof item === "object" &&
        item !== null &&
        "width" in item &&
        item.width === width,
    );
    if (!variant)
      throw new AppError(404, "MEDIA_NOT_FOUND", "Image variant not found.");
    const variantKey =
      getPersistedImageVariantKey(media.metadata, width) ??
      `${resolveImageThumbnailPrefix(media.storage_key, media.id)}/${width}.webp`;
    const file = await services.storage.getObject(variantKey);
    if (!file)
      throw new AppError(
        404,
        "FILE_NOT_FOUND",
        "Image variant not found in storage.",
      );
    return {
      stream: file.body,
      contentType: "image/webp",
      contentLength: file.contentLength,
      isPublic,
    };
  }

  async function handleMediaConvertWebhook({
    headers,
    rawBody,
    body,
    logger,
  }: {
    headers: Record<string, string | undefined>;
    rawBody?: Buffer | string;
    body: MediaConvertWebhookPayload;
    logger?: FastifyBaseLogger;
  }): Promise<MediaConvertWebhookResponse> {
    // Every authentication failure answers the same way: an unauthenticated
    // caller learns neither whether a secret is configured nor which check
    // rejected it. The reason goes to the log instead.
    const webhookSecret = services.config?.MEDIACONVERT_WEBHOOK_SECRET;
    if (!webhookSecret) {
      logger?.warn(
        "[mediaconvert-webhook] Rejected: MEDIACONVERT_WEBHOOK_SECRET is not configured",
      );
      throw new AppError(401, "UNAUTHORIZED", WEBHOOK_UNAUTHORIZED_MESSAGE);
    }

    const signatureHeader =
      headers["x-fleet-signature"] ||
      headers["x-hub-signature-256"] ||
      headers["x-mediaconvert-signature"];
    if (!signatureHeader) {
      logger?.warn("[mediaconvert-webhook] Rejected: no signature header");
      throw new AppError(401, "UNAUTHORIZED", WEBHOOK_UNAUTHORIZED_MESSAGE);
    }
    const rawPayload = rawBody
      ? typeof rawBody === "string"
        ? rawBody
        : rawBody.toString("utf-8")
      : typeof body === "string"
        ? body
        : JSON.stringify(body);

    const expectedSignature = `sha256=${crypto
      .createHmac("sha256", webhookSecret)
      .update(rawPayload)
      .digest("hex")}`;

    const sigBuf = Buffer.from(signatureHeader);
    const expBuf = Buffer.from(expectedSignature);
    if (
      sigBuf.length !== expBuf.length ||
      !crypto.timingSafeEqual(sigBuf, expBuf)
    ) {
      logger?.warn("[mediaconvert-webhook] Rejected: signature mismatch");
      throw new AppError(401, "UNAUTHORIZED", WEBHOOK_UNAUTHORIZED_MESSAGE);
    }

    const eventDetail = body?.detail || body;
    const userMetadata = eventDetail?.userMetadata || body?.userMetadata || {};
    const statusRaw = String(
      eventDetail?.status || body?.status || "",
    ).toUpperCase();
    const jobId =
      userMetadata.jobId || eventDetail?.jobId || body?.jobId || undefined;
    const videoId =
      userMetadata.videoId ||
      eventDetail?.videoId ||
      body?.videoId ||
      undefined;
    const errorMessage =
      eventDetail?.errorMessage || body?.errorMessage || null;

    // Chapter thumbnail captures are not transcode jobs: they have no
    // video_jobs row and must never touch media or job status.
    if (userMetadata.jobKind === "chapter-thumbnails") {
      const isComplete = statusRaw === "COMPLETE" || statusRaw === "COMPLETED";
      const times = String(userMetadata.chapterThumbnailTimes ?? "")
        .split(",")
        .filter((value) => value.trim() !== "")
        .map((value) => Number(value))
        .filter((value) => Number.isInteger(value) && value >= 0);
      if (isComplete && videoId && times.length > 0) {
        await chapterSyncService.completeThumbnailCapture(videoId, times);
      } else if (!isComplete) {
        logger?.warn(
          { videoId, status: statusRaw, error: errorMessage },
          "[mediaconvert-webhook] Chapter thumbnail capture did not complete",
        );
      }
      return { success: true, status: statusRaw.toLowerCase() };
    }

    if (!jobId && !videoId) {
      throw new AppError(
        400,
        "BAD_REQUEST",
        "Webhook payload must contain jobId or videoId.",
      );
    }

    const isUuid = (val?: string) =>
      typeof val === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        val,
      );

    let job:
      Awaited<ReturnType<typeof mediaRepo.findVideoJobStateById>> | undefined;
    if (jobId && isUuid(jobId)) {
      job = await mediaRepo.findVideoJobStateById(database, jobId);
    }
    if (!job && videoId && isUuid(videoId)) {
      job = await mediaRepo.findVideoJobStateByVideoId(database, videoId);
    }

    if (!job) {
      logger?.warn(
        { jobId, videoId, status: statusRaw },
        "[mediaconvert-webhook] Video job not found for webhook callback",
      );
      return { success: false, status: statusRaw.toLowerCase(), jobId };
    }

    if (statusRaw === "COMPLETE" || statusRaw === "COMPLETED") {
      if (job.status === "cancelled") {
        logger?.info(
          { jobId: job.id, videoId: job.video_id },
          "[mediaconvert-webhook] Ignoring completion callback for cancelled job",
        );
        return { success: true, status: "cancelled", jobId: job.id };
      }

      // The fleet retries completion callbacks and may deliver them more
      // than once; video_outputs has no unique key, so re-processing would
      // insert a duplicate output row.
      if (job.status === "completed") {
        return { success: true, status: "completed", jobId: job.id };
      }

      const outputGroupDetails =
        eventDetail?.outputGroupDetails || body?.outputGroupDetails;
      // The thumbnail FILE_GROUP also reports its .webp in playlistFilePaths,
      // so select the group that carries the HLS .m3u8 playlist.
      const isHlsPlaylist = (path: string) => /\.m3u8$/i.test(path);
      const firstOutput =
        outputGroupDetails?.find((group) =>
          group.playlistFilePaths?.some(isHlsPlaylist),
        ) ?? outputGroupDetails?.[0];
      const playlistPaths =
        firstOutput?.playlistFilePaths?.filter(isHlsPlaylist);
      const rawMasterPath =
        playlistPaths?.[0] ||
        body?.masterPlaylistPath ||
        `${normalizeOutputPrefix(job.output_prefix)}/master.m3u8`;

      let normalizedMaster = rawMasterPath;
      if (normalizedMaster.startsWith("s3://")) {
        const withoutS3 = normalizedMaster.slice(5);
        const slashIdx = withoutS3.indexOf("/");
        normalizedMaster =
          slashIdx !== -1 ? withoutS3.slice(slashIdx + 1) : withoutS3;
      }
      normalizedMaster = normalizeOutputPrefix(normalizedMaster);

      const durationMs = firstOutput?.outputDetails?.[0]?.durationInMs;
      const durationSeconds =
        body?.durationSeconds ||
        (durationMs ? Math.round(durationMs / 1000) : undefined);

      await mediaRepo.updateVideoJobStatus(database, job.id, {
        status: "completed",
        progress_percent: 100,
        error_message: null,
      });

      await mediaRepo.updateMediaAssetStatus(database, job.video_id, "ready");

      if (durationSeconds) {
        await mediaRepo.updateMediaAssetDuration(
          database,
          job.video_id,
          durationSeconds,
        );
      }

      const outputId = crypto.randomUUID();
      await mediaRepo.insertVideoOutput(database, {
        id: outputId,
        video_id: job.video_id,
        master_playlist_path: normalizedMaster,
        created_at: new Date(),
      });
      services.analyticsEvents?.emit("media.video.ready", {
        mediaId: job.video_id,
        manifestKey: normalizedMaster,
        outputId,
        at: new Date(),
      });

      // The duration is only reliable now, so chapters authored before the
      // upload finished are derived (and their frames requested) here.
      try {
        const readyMedia = await mediaRepo.findMediaAssetSummaryById(
          database,
          job.video_id,
        );
        if (readyMedia) {
          await chapterSyncService.syncChaptersForMedia(
            {
              id: readyMedia.id,
              status: "ready",
              durationSeconds:
                readyMedia.duration_seconds === null ||
                readyMedia.duration_seconds === undefined
                  ? null
                  : Number(readyMedia.duration_seconds),
              storageKey: readyMedia.storage_key,
              masterPlaylistKey: normalizedMaster,
            },
            logger,
          );
        }
      } catch (err) {
        logger?.warn(
          { err, videoId: job.video_id },
          "[mediaconvert-webhook] Failed to sync lesson chapters",
        );
      }

      logger?.info(
        {
          jobId: job.id,
          videoId: job.video_id,
          masterPlaylist: normalizedMaster,
        },
        "[mediaconvert-webhook] Video job successfully marked as completed",
      );
      return { success: true, status: "completed", jobId: job.id };
    }

    if (statusRaw === "ERROR" || statusRaw === "FAILED") {
      await mediaRepo.updateVideoJobStatus(database, job.id, {
        status: "failed",
        error_message: errorMessage || "MediaConvert transcoding failed.",
        failed_at: new Date(),
      });
      await mediaRepo.updateMediaAssetStatus(database, job.video_id, "failed");
      logger?.warn(
        { jobId: job.id, videoId: job.video_id, error: errorMessage },
        "[mediaconvert-webhook] Video job marked as failed",
      );
      return { success: true, status: "failed", jobId: job.id };
    }

    if (statusRaw === "PROGRESSING" || statusRaw === "PROCESSING") {
      // Guard against out-of-order progress webhooks downgrading terminal statuses
      if (job.status === "completed") {
        return { success: true, status: "completed", jobId: job.id };
      }
      if (job.status === "failed" || job.status === "cancelled") {
        return { success: true, status: job.status, jobId: job.id };
      }

      const progressPercent =
        typeof eventDetail?.jobPercentComplete === "number"
          ? eventDetail.jobPercentComplete
          : typeof body?.progressPercent === "number"
            ? body.progressPercent
            : 50;

      await mediaRepo.markVideoJobProcessing(database, job.id, progressPercent);
      return { success: true, status: "processing", jobId: job.id };
    }

    if (statusRaw === "CANCELED" || statusRaw === "CANCELLED") {
      await mediaRepo.updateVideoJobStatus(database, job.id, {
        status: "cancelled",
      });
      await mediaRepo.updateMediaAssetStatus(database, job.video_id, "failed");
      return { success: true, status: "cancelled", jobId: job.id };
    }

    return { success: true, status: statusRaw.toLowerCase(), jobId: job.id };
  }

  /**
   * Playback for a video asset whose viewer the caller has already
   * authorized (the home page's hero video, which an admin made public).
   * No course or lesson access rule is applied here.
   */
  async function getVideoAssetPlayback(
    media: VideoAssetForPlayback,
    details: { mediaKey: string; title?: string | null },
  ): Promise<HeroVideoPlayback> {
    const { manifestKey, outputVersion } = await getReadyPlaybackOutput(
      media.id,
      {
        media_type: media.type,
        media_status: media.status,
        media_storage_key: media.storageKey,
      },
      { verifyManifest: false },
    );
    const manifestUrl = services.storage.getCdnObjectUrl(manifestKey);
    if (!manifestUrl) {
      throw new AppError(
        503,
        "CDN_NOT_CONFIGURED",
        "Media delivery is not configured.",
      );
    }
    const playbackToken = createPlaybackSegmentToken(manifestKey);
    // The seek previews, as a lesson's (read from a cache, never failing).
    const storyboardUrl = await readStoryboardUrl(manifestKey, outputVersion);
    return {
      mediaKey: details.mediaKey,
      manifestUrl,
      ...(playbackToken
        ? {
            segmentToken: playbackToken.token,
            segmentTokenExpiresAt: playbackToken.expiresAt,
          }
        : {}),
      ...(media.durationSeconds !== null
        ? { duration: Number(media.durationSeconds) }
        : {}),
      ...(details.title ? { title: details.title } : {}),
      ...(storyboardUrl ? { storyboardUrl } : {}),
    };
  }

  /** A fresh segment token for `getVideoAssetPlayback`'s stream. */
  async function getVideoAssetPlaybackToken(
    media: VideoAssetForPlayback,
  ): Promise<VideoPlaybackToken> {
    const { manifestKey } = await getReadyPlaybackOutput(
      media.id,
      {
        media_type: media.type,
        media_status: media.status,
        media_storage_key: media.storageKey,
      },
      { verifyManifest: false },
    );
    const playbackToken = createPlaybackSegmentToken(manifestKey);
    if (!playbackToken) {
      throw new AppError(
        409,
        "CDN_TOKEN_NOT_REQUIRED",
        "This video does not require a protected playback token.",
      );
    }
    return playbackToken;
  }

  return {
    reachesAllMedia,
    presignMediaUpload,
    startMultipartUpload,
    getMultipartUploadStatus,
    presignMultipartUploadParts,
    completeMultipartUpload,
    abortMultipartUpload,
    confirmUpload,
    queueTranscodeJob,
    retryTranscodeJob,
    cancelTranscodeJob,
    getMediaAsset,
    getMediaAssets,
    getImageVariantManifest,
    getMediaSource,
    getVideoJobProgress,
    getPlaybackBootstrap,
    getPlaybackToken,
    getVideoAssetPlayback,
    getVideoAssetPlaybackToken,
    getLessonResourceDownload,
    getMediaDelivery,
    getHlsStream,
    getImageVariantStream,
    handleMediaConvertWebhook,
  };
}

export type MediaService = ReturnType<typeof createMediaService>;
