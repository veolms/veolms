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
import { createMediaService } from "../../media/index.ts";
import {
  assertOptimisticUpdate,
  getCourseAndVerifyOwner as verifyCourseOwner,
} from "../shared/courses.utils.ts";

export interface CurriculumServiceOptions {
  database: Kysely<Database>;
  services: AppServices;
}

export function createCurriculumService({
  database,
  services,
}: CurriculumServiceOptions) {
  const mediaService = createMediaService({ database, services });

  function getCourseAndVerifyOwner(courseId: string, creatorId: string) {
    return verifyCourseOwner(database, courseId, creatorId);
  }

  // --- Sections ---

  async function createCourseSection(
    courseId: string,
    creatorId: string,
    title: string,
    description?: string | null,
  ) {
    await getCourseAndVerifyOwner(courseId, creatorId);

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
      description: description ?? null,
      position,
      created_at: now,
      updated_at: now,
    });

    return { id: sectionId, courseId, title, position };
  }

  async function updateCourseSection(
    courseId: string,
    sectionId: string,
    creatorId: string,
    title?: string,
    description?: string | null,
  ) {
    await getCourseAndVerifyOwner(courseId, creatorId);

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
      description,
      updated_at: new Date(),
    });

    return { success: true };
  }

  async function deleteCourseSection(
    courseId: string,
    sectionId: string,
    creatorId: string,
  ) {
    await getCourseAndVerifyOwner(courseId, creatorId);

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
  ) {
    const course = await getCourseAndVerifyOwner(courseId, creatorId);
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
  ) {
    await getCourseAndVerifyOwner(courseId, creatorId);

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

    return { id: lessonId, position };
  }

  async function updateCourseLesson(
    courseId: string,
    lessonId: string,
    creatorId: string,
    payload: UpdateCourseLessonRequest,
    logger: FastifyBaseLogger,
  ) {
    await getCourseAndVerifyOwner(courseId, creatorId);

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
      payload.contentMediaId !== undefined
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
    await curriculumRepo.updateLesson(database, lessonId, courseId, {
      title: payload.title,
      description: payload.description,
      content_type: payload.contentType,
      content_media_id: payload.contentMediaId,
      is_preview: payload.isPreview,
      is_published: payload.isPublished,
      updated_at: now,
    });

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
      );
    }

    if (transcodeJobInfo && transcodeJobInfo.should202) {
      return {
        accepted: true as const,
        videoJobId: transcodeJobInfo.jobId!,
        processingStatus: "queued" as const,
      };
    }

    return { accepted: false as const, success: true };
  }

  async function deleteCourseLesson(
    courseId: string,
    lessonId: string,
    creatorId: string,
  ) {
    await getCourseAndVerifyOwner(courseId, creatorId);

    const lesson = await curriculumRepo.findLessonById(
      database,
      lessonId,
      courseId,
    );
    if (!lesson) {
      throw new AppError(404, "LESSON_NOT_FOUND", "Lesson not found.");
    }

    const now = new Date();
    await curriculumRepo.softDeleteLesson(database, lessonId, courseId, now);
    await curriculumRepo.softDeleteResourcesByLessonId(database, lessonId, now);

    return { success: true };
  }

  async function reorderSectionLessons(
    courseId: string,
    sectionId: string,
    creatorId: string,
    orderedLessonIds: string[],
    version: number,
  ) {
    const course = await getCourseAndVerifyOwner(courseId, creatorId);
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
  ) {
    await getCourseAndVerifyOwner(courseId, creatorId);

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
    );
    if (!media) {
      throw new AppError(400, "INVALID_MEDIA", "Media asset not found.");
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

    return { id: resourceId, position };
  }

  async function removeLessonResource(
    courseId: string,
    resourceId: string,
    creatorId: string,
  ) {
    await getCourseAndVerifyOwner(courseId, creatorId);

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
  };
}

export type CurriculumService = ReturnType<typeof createCurriculumService>;
