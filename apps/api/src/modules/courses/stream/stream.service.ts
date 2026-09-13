import type { Kysely } from "kysely";
import type { Database } from "@veolms/database";
import type { StreamResponse } from "@veolms/contracts";
import type { S3StorageService } from "@veolms/storage";
import { AppError } from "../../../lib/errors.ts";
import { ADMIN_ROLE } from "../../auth/index.ts";
import type { AppServices } from "../../../services/index.ts";
import * as curriculumRepo from "../curriculum/curriculum.repository.ts";
import * as courseRepo from "../course/course.repository.ts";
import * as enrollmentRepo from "../../commerce/enrollments/enrollment.repository.ts";
import {
  createAccessService,
  type AccessService,
} from "../../access/access.service.ts";
import * as mediaRepo from "../../media/media.repository.ts";
import type { StreamUserContext } from "./stream.types.ts";

export interface StreamServiceOptions {
  database: Kysely<Database>;
  services?: AppServices;
  accessService?: AccessService;
  storage?: S3StorageService;
  storageService?: S3StorageService;
}

export function createStreamService({
  database,
  services,
  accessService = createAccessService(),
  storage,
  storageService = storage ?? services?.storage,
}: StreamServiceOptions) {
  /**
   * Retrieves the streaming URL for a lecture after verifying user enrollment.
   */
  async function getLectureStreamUrl(
    lectureId: string,
    user: StreamUserContext,
    courseId?: string,
  ): Promise<StreamResponse> {
    // 1. Fetch the lecture from curriculum repository
    const lesson = courseId
      ? await curriculumRepo.findLessonById(database, lectureId, courseId)
      : await curriculumRepo.findLessonByIdOnly(database, lectureId);
    if (!lesson) {
      throw new AppError(404, "LECTURE_NOT_FOUND", "Lecture not found.");
    }

    // 2. Fetch parent course from course repository
    const course = await courseRepo.findCourseById(database, lesson.course_id);
    if (!course) {
      throw new AppError(404, "COURSE_NOT_FOUND", "Course not found.");
    }

    const isCreator = Boolean(
      course.creator_id && course.creator_id === user.id,
    );
    const isAdmin = Boolean(user.roles && user.roles.includes(ADMIN_ROLE));

    // 3. Course publication status check
    if (course.status !== "published" && !isCreator && !isAdmin) {
      throw new AppError(404, "COURSE_NOT_FOUND", "Course is not published.");
    }

    // 4. Enrollment & Access verification
    if (!isCreator && !isAdmin) {
      const enrollment = await enrollmentRepo.findActiveEnrollment(
        database,
        user.id,
        course.id,
      );

      let hasAccess = Boolean(enrollment);
      if (!hasAccess) {
        hasAccess = await accessService.hasActiveAccess(
          database,
          user.id,
          course.id,
        );
      }

      if (!hasAccess) {
        throw new AppError(
          403,
          "NOT_ENROLLED",
          "You must be enrolled in this course to stream this lecture.",
        );
      }
    }

    // 5. Validate streamable media asset & lesson publication
    if (!lesson.is_published && !isCreator && !isAdmin) {
      throw new AppError(404, "LECTURE_NOT_FOUND", "Lecture is not published.");
    }

    if (lesson.content_type !== "video" || !lesson.content_media_id) {
      throw new AppError(
        400,
        "LECTURE_NOT_STREAMABLE",
        "Lecture does not have streamable video content.",
      );
    }

    const mediaAsset = await mediaRepo.findMediaAssetById(
      database,
      lesson.content_media_id,
    );
    if (!mediaAsset) {
      throw new AppError(
        404,
        "MEDIA_NOT_FOUND",
        "Video media asset not found.",
      );
    }

    // 6. Determine streaming playlist or video file key
    const videoOutputs = await mediaRepo.findVideoOutputsByVideoIds(database, [
      mediaAsset.id,
    ]);
    const videoOutput = videoOutputs[0];

    let storageKey: string;
    let format: "hls" | "mp4" = "mp4";

    if (videoOutput?.master_playlist_path) {
      storageKey = videoOutput.master_playlist_path;
      format = "hls";
    } else if (isCreator || isAdmin) {
      // Creators and admins can preview direct raw upload before transcoding completes
      storageKey = mediaAsset.storage_key;
      format = "mp4";
    } else {
      // For enrolled learners and other users, return processing error until HLS is ready
      throw new AppError(
        409,
        "VIDEO_PROCESSING",
        "Video is currently processing. Please check back shortly.",
      );
    }

    // 7. Streaming URL resolution
    let streamUrl: string;
    if (storageKey.startsWith("https://")) {
      streamUrl = storageKey;
    } else {
      if (!storageService) {
        throw new AppError(
          500,
          "STORAGE_SERVICE_UNAVAILABLE",
          "Storage service is not available to generate streaming URL.",
        );
      }

      let key = storageKey;
      if (key.startsWith("http://")) {
        try {
          const url = new URL(key);
          let pathname = url.pathname.replace(/^\/+/, "");
          const bucket = storageService.getBucket?.();
          if (bucket && pathname.startsWith(`${bucket}/`)) {
            pathname = pathname.slice(bucket.length + 1);
          }
          key = pathname;
        } catch {
          key = key.replace(/^http:\/\/[^/]+\/?/, "");
        }
      } else {
        key = key.replace(/^\/+/, "");
      }

      let signedUrl = await storageService.getPresignedGetUrl(key);
      if (signedUrl.startsWith("http://")) {
        signedUrl = signedUrl.replace(/^http:\/\//i, "https://");
      }
      streamUrl = signedUrl;
    }

    return {
      streamUrl,
      lectureId: lesson.id,
      courseId: course.id,
      mediaAssetId: mediaAsset.id,
      contentType: lesson.content_type,
      format,
    };
  }

  return {
    getLectureStreamUrl,
  };
}

export type StreamService = ReturnType<typeof createStreamService>;
