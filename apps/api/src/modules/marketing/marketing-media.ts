import crypto from "node:crypto";

import { siteSettings } from "@veolms/config";
import {
  MARKETING_IMAGE_MAX_BYTES,
  type MarketingCardFill,
  type MarketingImageCompleteRequest,
  type MarketingImageContentType,
  type MarketingImagePresignRequest,
  type MarketingImagePresignResponse,
} from "@veolms/contracts";
import type { Database } from "@veolms/database";
import type { S3StorageService } from "@veolms/storage";
import type { Kysely } from "kysely";

import { config } from "../../config.ts";
import { AppError } from "../../lib/errors.ts";
import type { AppServices } from "../../services/index.ts";
import { readLogo } from "../academy/academy-logo.ts";
import { detectImageContentType } from "../avatars/avatar-storage.ts";
import { createCourseService } from "../courses/index.ts";
import { findWorkshopCard } from "../workshops/index.ts";
import { courseUrl, siteUrl } from "./marketing-render.ts";

/**
 * Images a creator uploads for their emails, and the words that fill a
 * course or workshop card. Uploaded images are public (mail apps fetch
 * them) and never overwritten or deleted, so an email already sent keeps
 * showing its pictures.
 *
 * public/marketing/images/{uploadId}.{png|jpg|gif|webp}
 */
const IMAGE_PREFIX = "public/marketing/images/";
const EXTENSIONS: Record<MarketingImageContentType, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
};

export function marketingImageKey(
  uploadId: string,
  contentType: MarketingImageContentType,
): string {
  return `${IMAGE_PREFIX}${uploadId}.${EXTENSIONS[contentType]}`;
}

/** An absolute https address, which mail apps can load; else null. */
function emailImageUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const absolute = url.startsWith("/")
    ? new URL(url, siteSettings(config).webUrl).toString()
    : url;
  return absolute.startsWith("https://") ? absolute : null;
}

function emailImageUrlForUpload(url: string | null): string | null {
  if (!url) return null;
  // Local stacks serve storage over http; the editor still shows it.
  return url.startsWith("/")
    ? new URL(url, siteSettings(config).webUrl).toString()
    : url;
}

function workshopWhen(startsAt: Date | null, timeZone: string | null): string {
  if (!startsAt) return "Live online";
  const when = new Intl.DateTimeFormat("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone: timeZone ?? "Asia/Kolkata",
    timeZoneName: "short",
  }).format(startsAt);
  return `Live · ${when}`;
}

export function createMarketingMedia({
  database,
  services,
}: {
  database: Kysely<Database>;
  services: AppServices;
}) {
  function requireStorage(): S3StorageService {
    const storage = services.storage as S3StorageService | null | undefined;
    if (!storage) {
      throw new AppError(
        503,
        "STORAGE_UNAVAILABLE",
        "Image uploads aren't set up on this server.",
      );
    }
    return storage;
  }

  async function presignImage(
    input: MarketingImagePresignRequest,
  ): Promise<MarketingImagePresignResponse> {
    const uploadId = crypto.randomUUID();
    const uploadUrl = await requireStorage().getPresignedPutUrl(
      marketingImageKey(uploadId, input.contentType),
      input.contentType,
      input.fileSize,
      undefined,
      // Public: the type is bound, so it cannot be stored as anything else.
      { bindContentType: true },
    );
    return { uploadId, uploadUrl };
  }

  /** Checks the uploaded file is the image it claims; answers its address. */
  async function completeImage(
    input: MarketingImageCompleteRequest,
  ): Promise<{ url: string }> {
    const store = requireStorage();
    const key = marketingImageKey(input.uploadId, input.contentType);
    const reject = async (message: string): Promise<never> => {
      await store.deleteObject(key).catch(() => undefined);
      throw new AppError(400, "INVALID_IMAGE_UPLOAD", message);
    };
    const head = await store.headObject(key);
    if (!head) {
      throw new AppError(
        400,
        "INVALID_IMAGE_UPLOAD",
        "The image was not uploaded. Try again.",
      );
    }
    if ((head.contentLength ?? 0) > MARKETING_IMAGE_MAX_BYTES) {
      return await reject("The image must be 5 MB or smaller.");
    }
    const bytes = await readLogo(store, key, MARKETING_IMAGE_MAX_BYTES);
    if (!bytes) return await reject("The image must be 5 MB or smaller.");
    if (detectImageContentType(bytes) !== input.contentType) {
      return await reject("Upload a PNG, JPEG, GIF or WebP image.");
    }
    const url = emailImageUrlForUpload(store.getPublicObjectUrl(key));
    if (!url) {
      return await reject("Images cannot be stored: no public address is set.");
    }
    return { url };
  }

  async function courseCard(courseId: string): Promise<MarketingCardFill> {
    const courses = createCourseService({ database, services });
    const [card] = await courses.listCourseCardsByIds([courseId]);
    const course = await courses.findCourseById(courseId);
    if (!card || !course) {
      throw new AppError(404, "COURSE_NOT_FOUND", "That course is gone.");
    }
    const wide =
      card.thumbnailSrcSet.find((variant) => variant.width >= 640)?.url ??
      card.thumbnailUrl;
    return {
      source: "course",
      sourceId: courseId,
      title: card.title,
      meta: "Online course",
      text: (course.short_description ?? "").trim().slice(0, 600),
      imageUrl: emailImageUrl(wide),
      url: courseUrl(card.slug),
      buttonLabel: "See the course",
    };
  }

  async function workshopCard(workshopId: string): Promise<MarketingCardFill> {
    const workshop = await findWorkshopCard(database, workshopId);
    if (!workshop) {
      throw new AppError(404, "WORKSHOP_NOT_FOUND", "That workshop is gone.");
    }
    return {
      source: "workshop",
      sourceId: workshopId,
      title: workshop.title,
      meta: workshopWhen(workshop.startsAt, workshop.timeZone),
      text: (workshop.summary ?? "").trim().slice(0, 600),
      imageUrl: emailImageUrl(workshop.coverUrl),
      url: `${siteUrl()}/workshops/${encodeURIComponent(workshop.slug)}`,
      buttonLabel: "Save my seat",
    };
  }

  return { presignImage, completeImage, courseCard, workshopCard };
}
