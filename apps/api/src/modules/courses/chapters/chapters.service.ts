import crypto from "node:crypto";
import type { Kysely } from "kysely";
import type {
  CreateLessonChapterRequest,
  LessonChapter,
  UpdateLessonChapterRequest,
} from "@veolms/contracts";
import type { Database } from "@veolms/database";

import { AppError } from "../../../lib/errors.ts";
import type { AppServices } from "../../../services/index.ts";
import { createMediaService } from "../../media/index.ts";
import { createCurriculumService } from "../curriculum/curriculum.service.ts";
import { getCourseAndVerifyOwner as verifyCourseOwner } from "../shared/courses.utils.ts";
import * as chaptersRepo from "./chapters.repository.ts";

export interface ChaptersServiceOptions {
  database: Kysely<Database>;
  services: AppServices;
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "23505"
  );
}

export function createChaptersService({
  database,
  services,
}: ChaptersServiceOptions) {
  const curriculumService = createCurriculumService({ database, services });
  const mediaService = createMediaService({ database, services });

  async function verifyLesson(
    courseId: string,
    lessonId: string,
    userId: string,
    userRoles?: readonly string[],
  ) {
    await verifyCourseOwner(database, courseId, userId, userRoles);

    const lesson = await curriculumService.findLessonById(lessonId, courseId);
    if (!lesson) {
      throw new AppError(404, "LESSON_NOT_FOUND", "Lesson not found.");
    }
    return lesson;
  }

  async function assertPlayableVideo(
    lesson: NonNullable<
      Awaited<ReturnType<typeof curriculumService.findLessonById>>
    >,
    userId: string,
    userRoles: readonly string[] | undefined,
    startSeconds: number,
  ) {
    if (lesson.content_type !== "video") {
      throw new AppError(
        400,
        "INVALID_LESSON_CONTENT_TYPE",
        "Chapters can only be added to video lessons.",
      );
    }

    if (!lesson.content_media_id) {
      throw new AppError(409, "MEDIA_NOT_READY", "Lesson video is not ready.");
    }

    const media = await mediaService.getMediaAsset(
      lesson.content_media_id,
      userId,
      userRoles,
    );
    if (!media || media.type !== "video") {
      throw new AppError(404, "MEDIA_NOT_FOUND", "Lesson video not found.");
    }

    if (
      media.status !== "ready" ||
      media.duration_seconds === null ||
      !Number.isFinite(media.duration_seconds)
    ) {
      throw new AppError(409, "MEDIA_NOT_READY", "Lesson video is not ready.");
    }

    if (startSeconds >= media.duration_seconds) {
      throw new AppError(
        400,
        "CHAPTER_OUT_OF_RANGE",
        "Chapter start must be before the video duration.",
      );
    }
  }

  function formatChapter(row: chaptersRepo.LessonChapterRow): LessonChapter {
    return {
      id: row.id,
      lessonId: row.lesson_id,
      title: row.title,
      startSeconds: row.start_seconds,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }

  async function listChapters(
    courseId: string,
    lessonId: string,
    userId: string,
    userRoles?: readonly string[],
  ): Promise<LessonChapter[]> {
    await verifyLesson(courseId, lessonId, userId, userRoles);
    const rows = await chaptersRepo.listChapters(database, lessonId);
    return rows.map(formatChapter);
  }

  async function createChapter(
    courseId: string,
    lessonId: string,
    userId: string,
    payload: CreateLessonChapterRequest,
    userRoles?: readonly string[],
  ): Promise<LessonChapter> {
    const lesson = await verifyLesson(courseId, lessonId, userId, userRoles);
    await assertPlayableVideo(lesson, userId, userRoles, payload.startSeconds);

    const chapterId = crypto.randomUUID();
    const now = new Date();
    try {
      await chaptersRepo.insertChapter(database, {
        id: chapterId,
        lesson_id: lessonId,
        title: payload.title,
        start_seconds: payload.startSeconds,
        created_at: now,
        updated_at: now,
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new AppError(
          409,
          "DUPLICATE_CHAPTER_TIMESTAMP",
          "A chapter already exists at this timestamp.",
        );
      }
      throw error;
    }

    return formatChapter({
      id: chapterId,
      lesson_id: lessonId,
      title: payload.title,
      start_seconds: payload.startSeconds,
      created_at: now,
      updated_at: now,
    });
  }

  async function updateChapter(
    courseId: string,
    lessonId: string,
    chapterId: string,
    userId: string,
    payload: UpdateLessonChapterRequest,
    userRoles?: readonly string[],
  ): Promise<LessonChapter> {
    const lesson = await verifyLesson(courseId, lessonId, userId, userRoles);
    const existing = await chaptersRepo.findChapterById(
      database,
      chapterId,
      lessonId,
    );
    if (!existing) {
      throw new AppError(404, "CHAPTER_NOT_FOUND", "Chapter not found.");
    }

    if (payload.startSeconds !== undefined) {
      await assertPlayableVideo(
        lesson,
        userId,
        userRoles,
        payload.startSeconds,
      );
    }

    const now = new Date();
    try {
      await chaptersRepo.updateChapter(database, chapterId, lessonId, {
        ...(payload.title !== undefined ? { title: payload.title } : {}),
        ...(payload.startSeconds !== undefined
          ? { start_seconds: payload.startSeconds }
          : {}),
        updated_at: now,
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new AppError(
          409,
          "DUPLICATE_CHAPTER_TIMESTAMP",
          "A chapter already exists at this timestamp.",
        );
      }
      throw error;
    }

    const updated = await chaptersRepo.findChapterById(
      database,
      chapterId,
      lessonId,
    );
    if (!updated) {
      throw new AppError(404, "CHAPTER_NOT_FOUND", "Chapter not found.");
    }
    return formatChapter(updated);
  }

  async function deleteChapter(
    courseId: string,
    lessonId: string,
    chapterId: string,
    userId: string,
    userRoles?: readonly string[],
  ): Promise<{ success: boolean }> {
    await verifyLesson(courseId, lessonId, userId, userRoles);
    const existing = await chaptersRepo.findChapterById(
      database,
      chapterId,
      lessonId,
    );
    if (!existing) {
      throw new AppError(404, "CHAPTER_NOT_FOUND", "Chapter not found.");
    }

    await chaptersRepo.deleteChapter(database, chapterId, lessonId);
    return { success: true };
  }

  return { listChapters, createChapter, updateChapter, deleteChapter };
}

export type ChaptersService = ReturnType<typeof createChaptersService>;
