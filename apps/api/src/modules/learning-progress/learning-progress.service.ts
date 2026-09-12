import crypto from "node:crypto";
import type {
  LearningProgressBatchRequest,
  LearningProgressResponse,
  LearningProgressSyncResponse,
} from "@veolms/contracts";
import type { Database } from "@veolms/database";
import type { Kysely } from "kysely";

import { ADMIN_ROLE } from "../auth/index.ts";
import { createAccessService, type AccessService } from "../access/index.ts";
import { AppError } from "../../lib/errors.ts";
import type { AppServices } from "../../services/index.ts";
import {
  createCurriculumService,
  type CurriculumService,
} from "../courses/index.ts";
import * as courseRepository from "../courses/course/course.repository.ts";
import * as learningProgressRepository from "./learning-progress.repository.ts";

type UserContext = { id: string; roles: readonly string[] };

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

interface OrderedLesson {
  id: string;
}

export interface LearningProgressService {
  getProgress(
    user: UserContext,
    courseKey: string,
  ): Promise<LearningProgressResponse>;
  syncProgress(
    user: UserContext,
    courseKey: string,
    input: LearningProgressBatchRequest,
  ): Promise<LearningProgressSyncResponse>;
}

export function createLearningProgressService({
  database,
  services,
  accessService = createAccessService(),
  curriculumService = createCurriculumService({ database, services }),
}: {
  database: Kysely<Database>;
  services: AppServices;
  accessService?: AccessService;
  curriculumService?: CurriculumService;
}): LearningProgressService {
  async function findCourse(courseKey: string) {
    return isUuid(courseKey)
      ? await courseRepository.findCourseById(database, courseKey)
      : await courseRepository.findCourseBySlug(database, courseKey);
  }

  async function requireCourse(user: UserContext, courseKey: string) {
    const course = await findCourse(courseKey);
    if (!course) {
      throw new AppError(404, "COURSE_NOT_FOUND", "Course not found.");
    }

    const isOwner = course.creator_id === user.id;
    const isAdmin = user.roles.includes(ADMIN_ROLE);
    if (course.status !== "published" && !isOwner && !isAdmin) {
      throw new AppError(404, "COURSE_NOT_FOUND", "Course not published.");
    }

    if (isOwner || isAdmin) return course;

    const [accessRule, pricing] = await Promise.all([
      database
        .selectFrom("course_access_rules")
        .select("access_type")
        .where("course_id", "=", course.id)
        .executeTakeFirst(),
      database
        .selectFrom("course_pricing")
        .select("pricing_type")
        .where("course_id", "=", course.id)
        .executeTakeFirst(),
    ]);

    const requiresGrant =
      accessRule?.access_type === "restricted" ||
      pricing?.pricing_type === "paid";
    if (
      requiresGrant &&
      !(await accessService.hasActiveAccess(database, user.id, course.id))
    ) {
      throw new AppError(
        403,
        "COURSE_ACCESS_REQUIRED",
        "You do not have access to this course.",
      );
    }

    return course;
  }

  async function listAvailableLessons(
    courseId: string,
    canManageCourse: boolean,
  ): Promise<OrderedLesson[]> {
    const [sections, lessons] = await Promise.all([
      curriculumService.findSectionsByCourseId(courseId),
      curriculumService.findLessonsByCourseId(courseId),
    ]);
    const sectionPosition = new Map(
      sections.map((section) => [section.id, section.position]),
    );
    return lessons
      .filter((lesson) => canManageCourse || lesson.is_published)
      .sort((left, right) => {
        const sectionDelta =
          (sectionPosition.get(left.section_id) ?? 0) -
          (sectionPosition.get(right.section_id) ?? 0);
        if (sectionDelta !== 0) return sectionDelta;
        const lessonDelta = left.position - right.position;
        return lessonDelta !== 0
          ? lessonDelta
          : left.id.localeCompare(right.id);
      })
      .map((lesson) => ({
        id: lesson.id,
      }));
  }

  async function getCourseSnapshot(
    user: UserContext,
    course: Awaited<ReturnType<typeof findCourse>>,
  ): Promise<LearningProgressResponse> {
    if (!course) {
      throw new AppError(404, "COURSE_NOT_FOUND", "Course not found.");
    }

    const [lessons, rows] = await Promise.all([
      listAvailableLessons(
        course.id,
        course.creator_id === user.id || user.roles.includes(ADMIN_ROLE),
      ),
      learningProgressRepository.listUserCourseProgress(
        database,
        user.id,
        course.id,
      ),
    ]);
    return presentSnapshot(course.id, course.slug, lessons, rows);
  }

  function presentSnapshot(
    courseId: string,
    courseSlug: string,
    lessons: OrderedLesson[],
    rows: learningProgressRepository.LearningProgressRow[],
  ): LearningProgressResponse {
    const progressByLessonId = new Map(
      rows.map((row) => [row.lesson_id, row.progress_percent]),
    );
    const progressTotal = lessons.reduce(
      (total, lesson) => total + (progressByLessonId.get(lesson.id) ?? 0),
      0,
    );
    const progressLessons = lessons.flatMap((lesson, index) => {
      const progressPercent = progressByLessonId.get(lesson.id) ?? 0;
      return progressPercent > 0
        ? [
            {
              lessonId: lesson.id,
              lessonNumber: index + 1,
              progressPercent,
            },
          ]
        : [];
    });

    return {
      courseId,
      courseSlug,
      totalLessons: lessons.length,
      completedLessons: lessons.filter(
        (lesson) => (progressByLessonId.get(lesson.id) ?? 0) >= 100,
      ).length,
      progressPercent:
        lessons.length > 0 ? Math.round(progressTotal / lessons.length) : 0,
      lessons: progressLessons,
    };
  }

  async function getProgress(
    user: UserContext,
    courseKey: string,
  ): Promise<LearningProgressResponse> {
    const course = await requireCourse(user, courseKey);
    return await getCourseSnapshot(user, course);
  }

  async function syncProgress(
    user: UserContext,
    courseKey: string,
    input: LearningProgressBatchRequest,
  ): Promise<LearningProgressSyncResponse> {
    const course = await requireCourse(user, courseKey);
    const canManageCourse =
      course.creator_id === user.id || user.roles.includes(ADMIN_ROLE);
    const lessons = await curriculumService.findLessonsByCourseId(course.id);
    const availableLessonIds = new Set(
      lessons
        .filter((lesson) => canManageCourse || lesson.is_published)
        .map((lesson) => lesson.id),
    );
    const progressByLessonId = new Map<string, number>();

    for (const item of input.items) {
      if (!availableLessonIds.has(item.lessonId)) continue;
      const current = progressByLessonId.get(item.lessonId) ?? 0;
      progressByLessonId.set(
        item.lessonId,
        Math.max(current, item.progressPercent),
      );
    }

    const now = new Date();
    await learningProgressRepository.upsertUserCourseProgress(
      database,
      [...progressByLessonId.entries()]
        .filter(([, progressPercent]) => progressPercent > 0)
        .map(([lessonId, progressPercent]) => ({
          id: crypto.randomUUID(),
          user_id: user.id,
          course_id: course.id,
          lesson_id: lessonId,
          progress_percent: progressPercent,
          created_at: now,
          updated_at: now,
        })),
    );
    return { synced: true };
  }

  return { getProgress, syncProgress };
}
