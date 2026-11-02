import { cacheTags, invalidateCache } from "@veolms/api-core";
import type { Permission } from "@veolms/contracts";
import crypto from "node:crypto";
import type { FastifyBaseLogger } from "fastify";
import type { Kysely } from "kysely";
import type { Database } from "@veolms/database";
import type {
  CreateCourseLessonRequest,
  UpdateCourseLessonRequest,
  CreateLessonResourceRequest,
} from "@veolms/contracts";
import { AppError } from "../../../lib/errors.ts";
import type { AppServices } from "../../../services/index.ts";
import * as curriculumRepo from "./curriculum.repository.ts";
import * as courseRepo from "../course/course.repository.ts";
import {
  cancelLessonYoutubeImports,
  createMediaService,
} from "../../media/index.ts";
import { createLessonProgressResetService } from "../../learning-progress/index.ts";
import { createChapterSyncService } from "../chapters/chapters.service.ts";
import {
  assertOptimisticUpdate,
  getCourseAndVerifyOwner as verifyCourseOwner,
} from "../shared/courses.utils.ts";
import { givesLessonItsFirstMedia } from "./lesson-first-media.ts";

export interface CurriculumServiceOptions {
  database: Kysely<Database>;
  services: AppServices;
}

export function createCurriculumService({
  database,
  services,
}: CurriculumServiceOptions) {
  const mediaService = createMediaService({ database, services });
  const chapterSyncService = createChapterSyncService({ database, services });
  const lessonProgressResetService = createLessonProgressResetService({
    database,
  });

  /**
   * Re-derives a lesson's chapters from its description. Chapters are a
   * convenience on top of the lesson, so a failure here never fails the save.
   */
  async function syncLessonChapters(
    lessonId: string,
    description: string | null,
    videoMediaId: string | null,
    logger?: FastifyBaseLogger,
  ) {
    try {
      const media = videoMediaId
        ? await mediaService.getMediaAsset(videoMediaId)
        : undefined;
      await chapterSyncService.syncLessonChapters({
        lessonId,
        description,
        media: media
          ? {
              id: media.id,
              status: media.status,
              durationSeconds:
                media.duration_seconds === null ||
                media.duration_seconds === undefined
                  ? null
                  : Number(media.duration_seconds),
              storageKey: media.storage_key,
            }
          : null,
        logger,
      });
    } catch (err) {
      logger?.warn({ err, lessonId }, "Failed to sync lesson chapters");
    }
  }

  function getCourseAndVerifyOwner(
    courseId: string,
    creatorId: string,
    userRoles: readonly string[] | undefined,
    permission: Permission,
  ) {
    return verifyCourseOwner(
      database,
      courseId,
      creatorId,
      userRoles,
      permission,
    );
  }

  // --- Sections ---

  async function createCourseSection(
    courseId: string,
    creatorId: string,
    title: string,
    userRoles?: readonly string[],
  ) {
    await getCourseAndVerifyOwner(
      courseId,
      creatorId,
      userRoles,
      "course.curriculum.update",
    );

    const maxPos = await curriculumRepo.findMaxSectionPosition(
      database,
      courseId,
    );
    const position = (maxPos?.max ?? -1) + 1;
    const sectionId = crypto.randomUUID();
    const now = new Date();

    await curriculumRepo.insertSection(database, {
      id: sectionId,
      course_id: courseId,
      title,
      position,
      created_at: now,
      updated_at: now,
    });

    return { id: sectionId, title };
  }

  async function updateCourseSection(
    courseId: string,
    sectionId: string,
    creatorId: string,
    title?: string,
    userRoles?: readonly string[],
  ) {
    await getCourseAndVerifyOwner(
      courseId,
      creatorId,
      userRoles,
      "course.curriculum.update",
    );

    const section = await curriculumRepo.findSectionById(
      database,
      sectionId,
      courseId,
    );
    if (!section) {
      throw new AppError(404, "SECTION_NOT_FOUND", "Section not found.");
    }

    await curriculumRepo.updateSection(database, sectionId, courseId, {
      title,
      updated_at: new Date(),
    });

    return { success: true };
  }

  async function deleteCourseSection(
    courseId: string,
    sectionId: string,
    creatorId: string,
    userRoles?: readonly string[],
  ) {
    await getCourseAndVerifyOwner(
      courseId,
      creatorId,
      userRoles,
      "course.curriculum.update",
    );

    const section = await curriculumRepo.findSectionById(
      database,
      sectionId,
      courseId,
    );
    if (!section) {
      throw new AppError(404, "SECTION_NOT_FOUND", "Section not found.");
    }

    await database.transaction().execute(async (trx) => {
      const now = new Date();
      await curriculumRepo.softDeleteSection(trx, sectionId, courseId, now);

      const lessons = await curriculumRepo.findLessonsBySectionId(
        trx,
        sectionId,
      );
      const lessonIds = lessons.map((l) => l.id);

      if (lessonIds.length > 0) {
        await curriculumRepo.softDeleteLessonsBySectionId(trx, sectionId, now);
        await curriculumRepo.softDeleteResourcesByLessonIds(
          trx,
          lessonIds,
          now,
        );
      }
    });

    return { success: true };
  }

  async function reorderCourseSections(
    courseId: string,
    creatorId: string,
    orderedSectionIds: string[],
    version: number,
    userRoles?: readonly string[],
  ) {
    const course = await getCourseAndVerifyOwner(
      courseId,
      creatorId,
      userRoles,
      "course.curriculum.update",
    );
    if (course.version !== version) {
      throw new AppError(
        409,
        "OPTIMISTIC_LOCK_CONFLICT",
        "Course state is out of sync. Please reload.",
      );
    }

    const currentSections = await curriculumRepo.findSectionsByCourseId(
      database,
      courseId,
    );
    const currentSectionIds = new Set(currentSections.map((s) => s.id));
    if (
      currentSections.length !== orderedSectionIds.length ||
      !orderedSectionIds.every((id) => currentSectionIds.has(id))
    ) {
      throw new AppError(
        400,
        "INVALID_SECTION_LIST",
        "Ordered section IDs list does not match this course's sections.",
      );
    }

    await database.transaction().execute(async (trx) => {
      const now = new Date();
      const updateResult = await courseRepo.updateCourse(
        trx,
        courseId,
        version,
        {
          version: version + 1,
          updated_at: now,
        },
      );
      assertOptimisticUpdate(updateResult);

      for (let i = 0; i < orderedSectionIds.length; i++) {
        await curriculumRepo.updateSectionPosition(
          trx,
          orderedSectionIds[i]!,
          courseId,
          i,
          now,
        );
      }
    });

    return { success: true };
  }

  // --- Lessons ---

  async function createCourseLesson(
    courseId: string,
    sectionId: string,
    creatorId: string,
    payload: CreateCourseLessonRequest,
    userRoles?: readonly string[],
  ) {
    await getCourseAndVerifyOwner(
      courseId,
      creatorId,
      userRoles,
      "lesson.create",
    );

    const section = await curriculumRepo.findSectionById(
      database,
      sectionId,
      courseId,
    );
    if (!section) {
      throw new AppError(404, "SECTION_NOT_FOUND", "Section not found.");
    }

    const maxPos = await curriculumRepo.findMaxLessonPosition(
      database,
      sectionId,
    );
    const position = (maxPos?.max ?? -1) + 1;
    const lessonId = crypto.randomUUID();
    const now = new Date();

    await curriculumRepo.insertLesson(database, {
      id: lessonId,
      course_id: courseId,
      section_id: sectionId,
      title: payload.title,
      description: payload.description ?? null,
      content_type: payload.contentType,
      position,
      is_preview: false,
      is_published: true,
      created_at: now,
      updated_at: now,
    });

    return { id: lessonId };
  }

  async function updateCourseLesson(
    courseId: string,
    lessonId: string,
    creatorId: string,
    payload: UpdateCourseLessonRequest,
    logger: FastifyBaseLogger,
    userRoles?: readonly string[],
  ) {
    await getCourseAndVerifyOwner(
      courseId,
      creatorId,
      userRoles,
      "lesson.details.update",
    );

    const lesson = await curriculumRepo.findLessonById(
      database,
      lessonId,
      courseId,
    );
    if (!lesson) {
      throw new AppError(404, "LESSON_NOT_FOUND", "Lesson not found.");
    }

    const effectiveContentType = payload.contentType ?? lesson.content_type;
    const effectiveMediaId =
      effectiveContentType === "quiz"
        ? null
        : payload.contentMediaId !== undefined
          ? payload.contentMediaId
          : lesson.content_media_id;

    const mediaChanged =
      payload.contentMediaId !== undefined &&
      payload.contentMediaId !== lesson.content_media_id;
    const typeChanged =
      payload.contentType !== undefined &&
      payload.contentType !== lesson.content_type;

    if (effectiveMediaId && (mediaChanged || typeChanged)) {
      const media = await mediaService.getMediaAsset(
        effectiveMediaId,
        creatorId,
        userRoles,
      );
      if (!media) {
        throw new AppError(400, "INVALID_MEDIA", "Media asset not found.");
      }

      if (media.type !== effectiveContentType) {
        throw new AppError(
          400,
          "TYPE_MISMATCH",
          `Media asset type '${media.type}' does not match lesson content type '${effectiveContentType}'.`,
        );
      }
    }

    const now = new Date();
    const lessonUpdate = {
      title: payload.title,
      description: payload.description,
      content_type: payload.contentType,
      content_media_id:
        effectiveContentType === "quiz" ? null : payload.contentMediaId,
      is_preview: payload.isPreview,
      is_published: payload.isPublished,
      updated_at: now,
    };
    if (givesLessonItsFirstMedia(lesson.content_media_id, effectiveMediaId)) {
      // A lesson with no video is finished by opening it. Now that it has
      // one, nobody has watched it: learners' progress on the lesson is
      // cleared together with the change, or neither happens. Learners who
      // passed the lesson's quiz keep theirs (see the reset service).
      await database.transaction().execute(async (trx) => {
        await curriculumRepo.updateLesson(
          trx,
          lessonId,
          courseId,
          lessonUpdate,
        );
        await lessonProgressResetService.clearLessonProgress(trx, lessonId);
      });
    } else {
      await curriculumRepo.updateLesson(
        database,
        lessonId,
        courseId,
        lessonUpdate,
      );
    }

    if (payload.description !== undefined || mediaChanged || typeChanged) {
      await syncLessonChapters(
        lessonId,
        payload.description !== undefined
          ? payload.description
          : lesson.description,
        effectiveContentType === "video" ? (effectiveMediaId ?? null) : null,
        logger,
      );
    }

    let transcodeJobInfo: {
      should202: boolean;
      jobId: string | null;
    } | null = null;
    if (
      effectiveMediaId &&
      (mediaChanged || typeChanged) &&
      effectiveContentType === "video"
    ) {
      transcodeJobInfo = await mediaService.queueTranscodeJob(
        effectiveMediaId,
        creatorId,
        logger,
        userRoles,
      );
    }

    return { accepted: Boolean(transcodeJobInfo?.should202) };
  }

  async function deleteCourseLesson(
    courseId: string,
    lessonId: string,
    creatorId: string,
    userRoles?: readonly string[],
  ) {
    await getCourseAndVerifyOwner(
      courseId,
      creatorId,
      userRoles,
      "lesson.delete",
    );

    const lesson = await curriculumRepo.findLessonById(
      database,
      lessonId,
      courseId,
    );
    if (!lesson) {
      throw new AppError(404, "LESSON_NOT_FOUND", "Lesson not found.");
    }

    await database.transaction().execute(async (trx) => {
      const now = new Date();
      await curriculumRepo.softDeleteLesson(trx, lessonId, courseId, now);
      await curriculumRepo.softDeleteResourcesByLessonId(trx, lessonId, now);
    });
    // An unfinished YouTube import into the lesson has nowhere to go now.
    // The lesson is already deleted, so a failure here does not undo that.
    await cancelLessonYoutubeImports(database, services, lessonId).catch(
      () => undefined,
    );

    return { success: true };
  }

  async function reorderSectionLessons(
    courseId: string,
    sectionId: string,
    creatorId: string,
    orderedLessonIds: string[],
    version: number,
    userRoles?: readonly string[],
  ) {
    const course = await getCourseAndVerifyOwner(
      courseId,
      creatorId,
      userRoles,
      "lesson.reorder",
    );
    if (course.version !== version) {
      throw new AppError(
        409,
        "OPTIMISTIC_LOCK_CONFLICT",
        "Course state is out of sync. Please reload.",
      );
    }

    const section = await curriculumRepo.findSectionById(
      database,
      sectionId,
      courseId,
    );
    if (!section) {
      throw new AppError(404, "SECTION_NOT_FOUND", "Section not found.");
    }

    const currentLessons = await curriculumRepo.findLessonsBySection(
      database,
      sectionId,
    );
    const currentLessonIds = new Set(currentLessons.map((l) => l.id));
    if (
      currentLessons.length !== orderedLessonIds.length ||
      !orderedLessonIds.every((id) => currentLessonIds.has(id))
    ) {
      throw new AppError(
        400,
        "INVALID_LESSON_LIST",
        "Ordered lesson IDs list does not match this section's lessons.",
      );
    }

    await database.transaction().execute(async (trx) => {
      const now = new Date();
      const updateResult = await courseRepo.updateCourse(
        trx,
        courseId,
        version,
        {
          version: version + 1,
          updated_at: now,
        },
      );
      assertOptimisticUpdate(updateResult);

      for (let i = 0; i < orderedLessonIds.length; i++) {
        await curriculumRepo.updateLessonPosition(
          trx,
          orderedLessonIds[i]!,
          sectionId,
          i,
          now,
        );
      }
    });

    return { success: true };
  }

  // --- Resources ---

  async function addLessonResource(
    courseId: string,
    lessonId: string,
    creatorId: string,
    payload: CreateLessonResourceRequest,
    userRoles?: readonly string[],
  ) {
    await getCourseAndVerifyOwner(
      courseId,
      creatorId,
      userRoles,
      "course.curriculum.update",
    );

    const lesson = await curriculumRepo.findLessonById(
      database,
      lessonId,
      courseId,
    );
    if (!lesson) {
      throw new AppError(404, "LESSON_NOT_FOUND", "Lesson not found.");
    }

    const media = await mediaService.getMediaAsset(
      payload.mediaAssetId,
      creatorId,
      userRoles,
    );
    if (!media) {
      throw new AppError(400, "INVALID_MEDIA", "Media asset not found.");
    }
    if (media.status === "uploading") {
      throw new AppError(
        409,
        "MEDIA_NOT_READY",
        "Media upload is still in progress.",
      );
    }
    if (media.status === "failed") {
      throw new AppError(
        409,
        "MEDIA_NOT_READY",
        "Media asset is not available.",
      );
    }

    const maxPos = await curriculumRepo.findMaxResourcePosition(
      database,
      lessonId,
    );
    const position = (maxPos?.max ?? -1) + 1;
    const resourceId = crypto.randomUUID();
    const now = new Date();

    await curriculumRepo.insertResource(database, {
      id: resourceId,
      lesson_id: lessonId,
      media_asset_id: payload.mediaAssetId,
      title: payload.title,
      description: payload.description ?? null,
      position,
      created_at: now,
    });

    return {
      id: resourceId,
      mediaAssetId: payload.mediaAssetId,
      title: payload.title,
      mediaAsset: {
        originalFilename: media.original_filename,
        mimeType: media.mime_type,
        sizeBytes: Number(media.size_bytes),
        status: media.status,
      },
    };
  }

  async function removeLessonResource(
    courseId: string,
    resourceId: string,
    creatorId: string,
    userRoles?: readonly string[],
  ) {
    await getCourseAndVerifyOwner(
      courseId,
      creatorId,
      userRoles,
      "course.curriculum.update",
    );

    const resource = await curriculumRepo.findResourceById(
      database,
      resourceId,
      courseId,
    );
    if (!resource) {
      throw new AppError(404, "RESOURCE_NOT_FOUND", "Resource not found.");
    }

    await curriculumRepo.softDeleteResource(
      database,
      resourceId,
      resource.lesson_id,
      new Date(),
    );
    return { success: true };
  }

  // --- Curriculum Read/Query Methods ---

  async function findSectionsByCourseId(courseId: string) {
    return await curriculumRepo.findSectionsByCourseId(database, courseId);
  }

  async function findLessonsByCourseId(courseId: string) {
    return await curriculumRepo.findLessonsByCourseId(database, courseId);
  }

  async function listResourcesByCourseId(courseId: string) {
    return await curriculumRepo.listResourcesByCourseId(database, courseId);
  }

  /**
   * Live lessons of live sections in learner order (section, lesson, id),
   * with only what a lesson list shows.
   */
  async function listOrderedLessonsByCourseId(courseId: string) {
    return await curriculumRepo.listOrderedLessonsByCourseId(
      database,
      courseId,
    );
  }

  async function findLessonById(lessonId: string, courseId: string) {
    return await curriculumRepo.findLessonById(database, lessonId, courseId);
  }

  /**
   * Attaches a video that finished processing in the background (a YouTube
   * import) to the lesson it was made for. The author was authorized when
   * the import started; this only checks the lesson still holds the video it
   * had then, so an edit made meanwhile wins. Learners' progress is cleared
   * when this gives the lesson its first video, as `updateCourseLesson` does.
   * Chapters are left to the caller, which syncs them for the media.
   */
  async function attachProcessedLessonVideo(input: {
    courseId: string;
    lessonId: string;
    expectedMediaId: string | null;
    mediaId: string;
  }): Promise<boolean> {
    const attached = await database.transaction().execute(async (trx) => {
      // The editor may have attached it already (it attaches a lesson's
      // first video when it is closed during processing).
      const current = await curriculumRepo.findLessonById(
        trx,
        input.lessonId,
        input.courseId,
      );
      if (current?.content_media_id === input.mediaId) return true;
      const attached = await curriculumRepo.swapLessonMediaIfUnchanged(
        trx,
        input.lessonId,
        input.courseId,
        input.expectedMediaId,
        input.mediaId,
        new Date(),
      );
      if (
        attached &&
        givesLessonItsFirstMedia(input.expectedMediaId, input.mediaId)
      ) {
        await lessonProgressResetService.clearLessonProgress(
          trx,
          input.lessonId,
        );
      }
      return attached;
    });
    // The lesson's video changed outside a request to the course: its
    // cached content is cleared in every process.
    if (attached) invalidateCache([cacheTags.course(input.courseId)]);
    return attached;
  }

  /**
   * A live lesson of a live section: its description, publish state and
   * whether it is a preview.
   */
  async function findLiveLessonDescription(lessonId: string, courseId: string) {
    return await curriculumRepo.findLiveLessonDescription(
      database,
      lessonId,
      courseId,
    );
  }

  return {
    getCourseAndVerifyOwner,
    createCourseSection,
    updateCourseSection,
    deleteCourseSection,
    reorderCourseSections,
    createCourseLesson,
    updateCourseLesson,
    deleteCourseLesson,
    reorderSectionLessons,
    addLessonResource,
    removeLessonResource,
    findSectionsByCourseId,
    findLessonsByCourseId,
    listResourcesByCourseId,
    listOrderedLessonsByCourseId,
    findLessonById,
    findLiveLessonDescription,
    attachProcessedLessonVideo,
  };
}

export type CurriculumService = ReturnType<typeof createCurriculumService>;
