import crypto from "node:crypto";
import type {
  LearningSpaceSession,
  LearningSpaceSessionsResponse,
  UpsertLearningSpaceSessionRequest,
} from "@veolms/contracts";
import type { Database } from "@veolms/database";
import type { Kysely } from "kysely";

import { ADMIN_ROLE } from "../auth/index.ts";
import { createAccessService, type AccessService } from "../access/index.ts";
import { AppError } from "../../lib/errors.ts";
import * as courseRepository from "../courses/course/course.repository.ts";
import * as learningSpaceRepository from "./learning-space.repository.ts";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const INTERNAL_URL_ORIGIN = "https://procodrr.local";
const PARENT_PATH_BY_ORIGIN = {
  home: "/",
  courses: "/courses",
  wishlist: "/wishlist",
} as const;

type UserContext = { id: string; roles: readonly string[] };

function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

function normalizeReturnPath(
  value: string | undefined,
  origin: UpsertLearningSpaceSessionRequest["origin"],
): string {
  const fallback = PARENT_PATH_BY_ORIGIN[origin];
  if (!value) return fallback;

  const candidate = value.trim();
  if (
    !candidate.startsWith("/") ||
    candidate.startsWith("//") ||
    candidate.includes("\\") ||
    /^[a-z][a-z\d+.-]*:/i.test(candidate)
  ) {
    throw new AppError(
      400,
      "INVALID_RETURN_PATH",
      "The session return path must be an internal application path.",
    );
  }

  try {
    const url = new URL(candidate, INTERNAL_URL_ORIGIN);
    if (url.origin !== INTERNAL_URL_ORIGIN) throw new Error("External URL");
    const decodedPathname = decodeURIComponent(url.pathname);
    if (
      decodedPathname.includes("\\") ||
      /^\/+learn(?:\/|$)/i.test(decodedPathname)
    ) {
      throw new Error("Invalid learning path");
    }
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    throw new AppError(
      400,
      "INVALID_RETURN_PATH",
      "The session return path must be an internal application path.",
    );
  }
}

export interface LearningSpaceService {
  listSessions(userId: string): Promise<LearningSpaceSessionsResponse>;
  upsertSession(
    user: UserContext,
    courseKey: string,
    input: UpsertLearningSpaceSessionRequest,
  ): Promise<LearningSpaceSession>;
  closeSession(userId: string, courseKey: string): Promise<{ closed: true }>;
}

export function createLearningSpaceService({
  database,
  accessService = createAccessService(),
}: {
  database: Kysely<Database>;
  accessService?: AccessService;
}): LearningSpaceService {
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

  async function resolveLesson(
    courseId: string,
    lessonKey: string | null | undefined,
    canManageCourse: boolean,
  ) {
    const allLessons = await learningSpaceRepository.listCourseLessons(
      database,
      courseId,
    );
    const availableLessons = canManageCourse
      ? allLessons
      : allLessons.filter((lesson) => lesson.is_published);

    if (availableLessons.length === 0) {
      // A course can exist before its curriculum is published. Keep the
      // course-level Learning Space session and leave its lesson nullable;
      // the player can resume at its local/default lesson until curriculum
      // data becomes available.
      return { lessonId: null, lessonNumber: null };
    }

    if (!lessonKey) {
      const firstLesson = availableLessons[0]!;
      return { lessonId: firstLesson.id, lessonNumber: 1 };
    }

    let lessonIndex: number;
    if (isUuid(lessonKey)) {
      lessonIndex = availableLessons.findIndex(
        (lesson) => lesson.id === lessonKey,
      );
    } else if (/^\d+$/.test(lessonKey)) {
      lessonIndex = Number(lessonKey) - 1;
    } else {
      throw new AppError(
        400,
        "INVALID_LESSON_KEY",
        "The lesson key must be a lesson UUID or a positive lesson number.",
      );
    }

    const lesson = availableLessons[lessonIndex];
    if (!lesson) {
      throw new AppError(404, "LESSON_NOT_FOUND", "Lesson not found.");
    }

    return {
      lessonId: lesson.id,
      lessonNumber: lessonIndex + 1,
    };
  }

  function presentSession(
    row: learningSpaceRepository.LearningSpaceSessionRow,
  ): LearningSpaceSession {
    return {
      id: row.id,
      courseId: row.course_id,
      courseSlug: row.course_slug,
      courseTitle: row.course_title,
      lessonId: row.lesson_id,
      lessonNumber: row.lesson_number,
      lessonTitle: row.lesson_title,
      origin: row.origin,
      returnPath: row.return_path,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }

  async function listSessions(
    userId: string,
  ): Promise<LearningSpaceSessionsResponse> {
    const rows = await learningSpaceRepository.listUserSessions(
      database,
      userId,
    );
    return { sessions: rows.map(presentSession) };
  }

  async function upsertSession(
    user: UserContext,
    courseKey: string,
    input: UpsertLearningSpaceSessionRequest,
  ): Promise<LearningSpaceSession> {
    const course = await requireCourse(user, courseKey);
    const canManageCourse =
      course.creator_id === user.id || user.roles.includes(ADMIN_ROLE);
    const lesson = await resolveLesson(
      course.id,
      input.lessonKey,
      canManageCourse,
    );
    const now = new Date();
    const row = await learningSpaceRepository.upsertSession(database, {
      id: crypto.randomUUID(),
      userId: user.id,
      courseId: course.id,
      lessonId: lesson.lessonId,
      lessonNumber: lesson.lessonNumber,
      origin: input.origin,
      returnPath: normalizeReturnPath(input.returnPath, input.origin),
      now,
    });

    if (!row) {
      throw new AppError(
        500,
        "LEARNING_SESSION_NOT_CREATED",
        "Learning session could not be created.",
      );
    }
    return presentSession(row);
  }

  async function closeSession(
    userId: string,
    courseKey: string,
  ): Promise<{ closed: true }> {
    const course = await findCourse(courseKey);
    if (course) {
      await learningSpaceRepository.deleteUserSession(
        database,
        userId,
        course.id,
      );
    }
    return { closed: true };
  }

  return { listSessions, upsertSession, closeSession };
}
