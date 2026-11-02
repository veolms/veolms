import crypto from "node:crypto";
import type {
  LearningGoalSettings,
  LearningGoalSettingsResponse,
  LearningProgressBatchRequest,
  LearningProgressResumeContextResponse,
  LearningProgressResumeLesson,
  LearningProgressResponse,
  LearningProgressSyncResponse,
  LearningReminderDay,
  LearningSummaryResponse,
  UpdateLearningGoalSettingsRequest,
} from "@veolms/contracts";
import {
  DEFAULT_DAILY_GOAL_MINUTES,
  LEARNING_REMINDER_DAY_IDS,
} from "@veolms/contracts";
import type { Database } from "@veolms/database";
import type { Kysely } from "kysely";

import { ADMIN_ROLE } from "../auth/index.ts";
import {
  createAccessService,
  isOpenFreeCourse,
  scopeOpensSection,
  type AccessService,
} from "../access/index.ts";
import { AppError } from "../../lib/errors.ts";
import type { AppServices } from "../../services/index.ts";
import {
  createCourseService,
  type CourseContentKey,
  type CourseService,
} from "../courses/index.ts";
import { createOutboxService } from "../../events/outbox.service.ts";
import {
  createQuizCompletionService,
  type QuizCompletionService,
} from "../quizzes/index.ts";
import * as learningProgressRepository from "./learning-progress.repository.ts";

/**
 * Known legacy-to-canonical aliases where Intl.resolvedOptions().timeZone
 * retains the legacy name (e.g. Asia/Calcutta in ICU/V8) rather than the
 * modern identifier recognized by PostgreSQL (Asia/Kolkata).
 */
const TIME_ZONE_ALIASES: Record<string, string> = {
  "Asia/Calcutta": "Asia/Kolkata",
};

/** Streak lengths that earn a one-time milestone notification. */
const LEARNING_STREAK_MILESTONES = [7, 30, 100, 365] as const;
/** Days after a milestone on which a missed announcement is still made. */
const STREAK_MILESTONE_CATCH_UP_DAYS = 2;

type UserContext = {
  id: string;
  roles: readonly string[];
  /**
   * The viewer manages courses but asked to be answered as a learner (their
   * Student view): they get the lessons a learner gets.
   */
  learnerView?: boolean;
};

/**
 * Whether the viewer is shown the course as the people who manage it are:
 * every lesson, unpublished ones included. Its creator and an admin are,
 * unless they are in their Student view. This decides what is listed and how
 * lessons are numbered, never what the viewer may open.
 */
function seesUnpublishedLessons(
  user: UserContext,
  course: { creator_id: string | null },
): boolean {
  if (user.learnerView) return false;
  return course.creator_id === user.id || user.roles.includes(ADMIN_ROLE);
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

export interface ResumeCurriculumLesson {
  id: string;
  title: string;
  sectionTitle: string;
  sectionId?: string;
}

export type ResumeProgressRow = {
  lesson_id: string;
  progress_percent: number;
  updated_at: Date;
  /** Where the learner last was in the lesson's video (absent: unknown). */
  position_seconds?: number | null;
  /** When that position was saved: when the lesson was last played. */
  position_updated_at?: Date | null;
};

interface ResumeCurriculumSection {
  id: string;
  title: string;
  position: number;
}

interface ResumeCurriculumLessonRecord {
  id: string;
  section_id: string;
  title: string;
  position: number;
  is_published: boolean;
}

/**
 * The lessons a viewer can open, in the order the player numbers them:
 * section position, then lesson position. Both the progress snapshot and
 * the resume context number lessons from this one list, so a lesson number
 * means the same lesson everywhere.
 */
function orderAvailableLessons(
  sections: readonly ResumeCurriculumSection[],
  lessons: readonly ResumeCurriculumLessonRecord[],
  canManageCourse: boolean,
): ResumeCurriculumLesson[] {
  const sectionById = new Map(sections.map((section) => [section.id, section]));

  return [...lessons]
    .filter((lesson) => sectionById.has(lesson.section_id))
    .filter((lesson) => canManageCourse || lesson.is_published)
    .sort((left, right) => {
      const leftSection = sectionById.get(left.section_id)!;
      const rightSection = sectionById.get(right.section_id)!;
      const sectionDelta = leftSection.position - rightSection.position;
      if (sectionDelta !== 0) return sectionDelta;
      const lessonDelta = left.position - right.position;
      return lessonDelta !== 0 ? lessonDelta : left.id.localeCompare(right.id);
    })
    .map((lesson) => ({
      id: lesson.id,
      title: lesson.title,
      sectionTitle: sectionById.get(lesson.section_id)!.title,
      sectionId: lesson.section_id,
    }));
}

function normalizeProgressPercent(value: number): number {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return 0;
  return Math.max(0, Math.min(100, Math.trunc(numericValue)));
}

function timeOf(value: Date | string | null | undefined): number {
  if (value === null || value === undefined) return Number.NEGATIVE_INFINITY;
  const timestamp =
    value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : Number.NEGATIVE_INFINITY;
}

/**
 * The lesson of the curriculum played last (its position saved last), by
 * its place in `lessons`, or -1 when no position has been saved for any.
 */
export function findLastPlayedIndex(
  lessons: readonly { id: string }[],
  rows: readonly ResumeProgressRow[],
): number {
  const playedAt = new Map(
    rows
      .filter(
        (row) =>
          row.position_seconds !== null &&
          row.position_seconds !== undefined &&
          row.position_updated_at,
      )
      .map((row) => [row.lesson_id, timeOf(row.position_updated_at)]),
  );
  let lastIndex = -1;
  let lastAt = Number.NEGATIVE_INFINITY;
  lessons.forEach((lesson, index) => {
    const at = playedAt.get(lesson.id);
    if (at !== undefined && at > lastAt) {
      lastAt = at;
      lastIndex = index;
    }
  });
  return lastIndex;
}

function progressUpdatedAt(row: ResumeProgressRow): number {
  const timestamp =
    row.updated_at instanceof Date
      ? row.updated_at.getTime()
      : new Date(row.updated_at).getTime();
  return Number.isFinite(timestamp) ? timestamp : Number.NEGATIVE_INFINITY;
}

/**
 * Resolves where a learner carries on in one ordered course curriculum.
 *
 * The lesson they played last (from whichever device: its saved position
 * is the most recent), at the point they left it; or, once that lesson is
 * finished, the next one not finished after it. A course with no saved
 * position (progress from before positions were kept) falls back to the
 * started lesson whose progress moved last, then the first unfinished one.
 */
export function resolveResumeContext(
  courseId: string,
  courseSlug: string,
  lessons: ResumeCurriculumLesson[],
  rows: ResumeProgressRow[],
  /**
   * The lessons the learner may open, when they hold only part of the
   * course. The others keep their numbers but are never resumed, offered
   * next, or counted.
   */
  opensLesson: (lesson: ResumeCurriculumLesson) => boolean = () => true,
): LearningProgressResumeContextResponse {
  const progressByLessonId = new Map<string, number>();
  const updatedRowsByLessonId = new Map<string, ResumeProgressRow>();

  for (const row of rows) {
    progressByLessonId.set(
      row.lesson_id,
      normalizeProgressPercent(row.progress_percent),
    );
    updatedRowsByLessonId.set(row.lesson_id, row);
  }

  const toResponseLesson = (
    lesson: ResumeCurriculumLesson,
    index: number,
  ): LearningProgressResumeLesson => {
    const position = updatedRowsByLessonId.get(lesson.id)?.position_seconds;
    return {
      lessonId: lesson.id,
      lessonNumber: index + 1,
      title: lesson.title,
      sectionTitle: lesson.sectionTitle,
      progressPercent: progressByLessonId.get(lesson.id) ?? 0,
      ...(typeof position === "number" ? { positionSeconds: position } : {}),
    };
  };

  const openLessons = lessons.filter(opensLesson);
  const completedLessons = openLessons.filter(
    (lesson) => (progressByLessonId.get(lesson.id) ?? 0) >= 100,
  ).length;
  const emptyResponse = (): LearningProgressResumeContextResponse => ({
    courseId,
    courseSlug,
    totalLessons: openLessons.length,
    completedLessons,
    resumeLesson: null,
    upcomingLessons: [],
  });

  if (openLessons.length === 0) return emptyResponse();

  // A lesson the learner may not open counts as done: it is passed over.
  const isFinished = (index: number) =>
    !opensLesson(lessons[index]!) ||
    (progressByLessonId.get(lessons[index]!.id) ?? 0) >= 100;
  const lastPlayedIndex = findLastPlayedIndex(lessons, rows);
  // The lesson played last, unless it is finished: then the next unfinished
  // one after it (a course finished from there on goes back to the first
  // unfinished one, below).
  const playedOnIndex =
    lastPlayedIndex < 0
      ? -1
      : !isFinished(lastPlayedIndex)
        ? lastPlayedIndex
        : lessons.findIndex(
            (_, index) => index > lastPlayedIndex && !isFinished(index),
          );

  const partialIndexes = lessons.flatMap((lesson, index) => {
    const progressPercent = progressByLessonId.get(lesson.id) ?? 0;
    return progressPercent > 0 && progressPercent < 100 && opensLesson(lesson)
      ? [index]
      : [];
  });

  let resumeIndex: number;
  if (playedOnIndex >= 0) {
    resumeIndex = playedOnIndex;
  } else if (partialIndexes.length > 0) {
    resumeIndex = partialIndexes.reduce((selectedIndex, candidateIndex) => {
      const selectedLesson = lessons[selectedIndex]!;
      const candidateLesson = lessons[candidateIndex]!;
      const selectedRow = updatedRowsByLessonId.get(selectedLesson.id);
      const candidateRow = updatedRowsByLessonId.get(candidateLesson.id);
      const timestampDelta =
        progressUpdatedAt(candidateRow!) - progressUpdatedAt(selectedRow!);

      if (timestampDelta !== 0) {
        return timestampDelta > 0 ? candidateIndex : selectedIndex;
      }

      if (candidateIndex !== selectedIndex) {
        return candidateIndex < selectedIndex ? candidateIndex : selectedIndex;
      }

      return candidateLesson.id.localeCompare(selectedLesson.id) < 0
        ? candidateIndex
        : selectedIndex;
    });
  } else {
    resumeIndex = lessons.findIndex((_, index) => !isFinished(index));
    if (resumeIndex === -1) return emptyResponse();
  }

  const upcomingLessons = lessons
    .map((lesson, index) => ({ lesson, index }))
    .filter(({ lesson, index }) => index > resumeIndex && opensLesson(lesson))
    .slice(0, 3)
    .map(({ lesson, index }) => toResponseLesson(lesson, index));

  return {
    courseId,
    courseSlug,
    totalLessons: openLessons.length,
    completedLessons,
    resumeLesson: toResponseLesson(lessons[resumeIndex]!, resumeIndex),
    upcomingLessons,
  };
}

export interface LearningProgressService {
  getProgress(
    user: UserContext,
    courseKey: string,
  ): Promise<LearningProgressResponse>;
  getResumeContext(
    user: UserContext,
    courseKey: string,
  ): Promise<LearningProgressResumeContextResponse>;
  syncProgress(
    user: UserContext,
    courseKey: string,
    input: LearningProgressBatchRequest,
  ): Promise<LearningProgressSyncResponse>;
  getSummary(user: UserContext): Promise<LearningSummaryResponse>;
  getGoalSettings(user: UserContext): Promise<LearningGoalSettingsResponse>;
  updateGoalSettings(
    user: UserContext,
    input: UpdateLearningGoalSettingsRequest,
  ): Promise<LearningGoalSettingsResponse>;
  /**
   * The zone id to store for one a client sent: the id itself when the
   * database knows it, else its canonical form, else nothing.
   */
  resolveSupportedTimeZone(timeZone: string): Promise<string | null>;
  getAverageProgressAndCompletionRate(filters?: {
    courseId?: string | string[];
    asOf?: Date;
  }): Promise<{ averageProgressPercent: number; completionRate: number }>;
  getAverageProgressByCourse(filters?: {
    courseId?: string | string[];
  }): Promise<Array<{ courseId: string; averageProgressPercent: number }>>;
  getAverageProgressAndCompletionRateByCourse(
    courseId: string | string[],
  ): Promise<
    Array<{
      courseId: string;
      averageProgressPercent: number;
      completionRate: number;
    }>
  >;
  getStartedAndCompletedCounts(filters: {
    courseId?: string | string[];
    from?: Date;
    to?: Date;
  }): Promise<{ started: number; completed: number }>;
  getEstimatedWatchHours(filters: {
    courseId?: string | string[];
    from?: Date;
    to?: Date;
  }): Promise<number>;
}

export function createLearningProgressService({
  database,
  services,
  accessService = createAccessService(),
  courseService = createCourseService({ database, services }),
  quizCompletionService = createQuizCompletionService({ database }),
}: {
  database: Kysely<Database>;
  services: AppServices;
  accessService?: AccessService;
  courseService?: Pick<
    CourseService,
    "findCourseById" | "findCourseBySlug" | "getCourseContent"
  >;
  quizCompletionService?: QuizCompletionService;
}): LearningProgressService {
  const outbox = createOutboxService();
  // Learners known to have a settings row, so the heartbeat does not look
  // it up every time. Per process; a miss only costs one indexed read.
  const usersWithSettings = new Set<string>();

  async function findCourse(courseKey: string) {
    return isUuid(courseKey)
      ? await courseService.findCourseById(courseKey)
      : await courseService.findCourseBySlug(courseKey);
  }

  async function requireCourse(user: UserContext, courseKey: string) {
    const course = await findCourse(courseKey);
    if (!course) {
      throw new AppError(404, "COURSE_NOT_FOUND", "Course not found.");
    }

    const isOwner = course.creator_id === user.id;
    const isAdmin = user.roles.includes(ADMIN_ROLE);
    if (isOwner || isAdmin) return course;

    // An archived course keeps the progress of a learner who holds access
    // to it, and goes on recording it.
    if (
      !(await accessService.isCourseOpenToLearner(database, user.id, course))
    ) {
      throw new AppError(404, "COURSE_NOT_FOUND", "Course not published.");
    }

    // From the course's shared content: every heartbeat of every learner
    // asks this.
    const { accessRule, pricing } =
      await courseService.getCourseContent(course);

    // The rule playback and discussions apply: open without a grant only
    // when free and not restricted. Written out here it also opened a
    // course with no pricing row, which neither of them plays.
    const requiresGrant = !isOpenFreeCourse({
      pricing_type: pricing?.pricing_type,
      access_type: accessRule?.access_type,
    });
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
    course: CourseContentKey,
    canManageCourse: boolean,
  ): Promise<ResumeCurriculumLesson[]> {
    const { sections, lessons } = await courseService.getCourseContent(course);
    return orderAvailableLessons(sections, lessons, canManageCourse);
  }

  /**
   * The lessons the learner has started or played, numbered as the player
   * numbers them, with where they last were in each; and the lesson they
   * played last.
   */
  function presentSnapshot(
    lessons: readonly ResumeCurriculumLesson[],
    rows: learningProgressRepository.LearningProgressRow[],
  ): LearningProgressResponse {
    const rowsByLessonId = new Map(rows.map((row) => [row.lesson_id, row]));
    const positionOf = (row: (typeof rows)[number] | undefined) =>
      row && typeof row.position_seconds === "number" && row.position_updated_at
        ? {
            positionSeconds: row.position_seconds,
            positionUpdatedAt: new Date(row.position_updated_at).toISOString(),
          }
        : null;
    const lastPlayedIndex = findLastPlayedIndex(lessons, rows);
    const lastPlayedLesson = lessons[lastPlayedIndex];
    const lastPlayedPosition = lastPlayedLesson
      ? positionOf(rowsByLessonId.get(lastPlayedLesson.id))
      : null;

    return {
      lessons: lessons.flatMap((lesson, index) => {
        const row = rowsByLessonId.get(lesson.id);
        const progressPercent = row?.progress_percent ?? 0;
        const position = positionOf(row);
        return progressPercent > 0 || position
          ? [
              {
                lessonId: lesson.id,
                lessonNumber: index + 1,
                progressPercent,
                ...(position ?? {}),
              },
            ]
          : [];
      }),
      lastPlayed:
        lastPlayedLesson && lastPlayedPosition
          ? {
              lessonId: lastPlayedLesson.id,
              lessonNumber: lastPlayedIndex + 1,
              positionSeconds: lastPlayedPosition.positionSeconds,
              playedAt: lastPlayedPosition.positionUpdatedAt,
            }
          : null,
    };
  }

  async function getProgress(
    user: UserContext,
    courseKey: string,
  ): Promise<LearningProgressResponse> {
    const course = await requireCourse(user, courseKey);
    const canManageCourse = seesUnpublishedLessons(user, course);
    const [lessons, rows] = await Promise.all([
      listAvailableLessons(course, canManageCourse),
      learningProgressRepository.listUserCourseProgress(
        database,
        user.id,
        course.id,
      ),
    ]);
    return presentSnapshot(lessons, rows);
  }

  async function getResumeContext(
    user: UserContext,
    courseKey: string,
  ): Promise<LearningProgressResumeContextResponse> {
    const course = await requireCourse(user, courseKey);
    const canManageCourse = seesUnpublishedLessons(user, course);
    const [lessons, rows] = await Promise.all([
      listAvailableLessons(course, canManageCourse),
      learningProgressRepository.listUserCourseProgress(
        database,
        user.id,
        course.id,
      ),
    ]);

    // A learner holding part of the course resumes within it.
    const scope = canManageCourse
      ? null
      : await accessService.getAccessScope(database, user.id, course.id);
    return resolveResumeContext(
      course.id,
      course.slug,
      lessons,
      rows,
      scope?.sectionIds
        ? (lesson) => scopeOpensSection(scope, lesson.sectionId)
        : undefined,
    );
  }

  async function syncProgress(
    user: UserContext,
    courseKey: string,
    input: LearningProgressBatchRequest,
  ): Promise<LearningProgressSyncResponse> {
    const course = await requireCourse(user, courseKey);
    const canManageCourse = seesUnpublishedLessons(user, course);
    const [{ lessons }, scope] = await Promise.all([
      courseService.getCourseContent(course),
      canManageCourse
        ? null
        : accessService.getAccessScope(database, user.id, course.id),
    ]);
    // A learner holding part of the course records progress in their
    // sections only, the lessons they can play.
    const availableLessonIds = new Set(
      lessons
        .filter((lesson) => canManageCourse || lesson.is_published)
        .filter(
          (lesson) =>
            !scope?.sectionIds || scopeOpensSection(scope, lesson.section_id),
        )
        .map((lesson) => lesson.id),
    );
    // A quiz lesson is complete when its quiz has been passed — a fact the
    // server holds. The page used to simply report 100% for it, so any
    // request could mark a quiz lesson done. Looked up only when the batch
    // actually reports progress on a quiz lesson.
    const quizLessonIds = new Set(
      lessons
        .filter((lesson) => lesson.content_type === "quiz")
        .map((lesson) => lesson.id),
    );
    const reportedQuizLessonIds = [
      ...new Set(
        input.items
          .filter(
            (item) =>
              item.progressPercent > 0 && quizLessonIds.has(item.lessonId),
          )
          .map((item) => item.lessonId),
      ),
    ];
    const passedQuizLessonIds =
      reportedQuizLessonIds.length > 0
        ? await quizCompletionService.listPassedLessonIds(
            user.id,
            reportedQuizLessonIds,
          )
        : new Set<string>();
    const progressByLessonId = new Map<string, number>();
    // Where the learner is in each lesson's video, the last one reported.
    // A quiz lesson not yet passed may still say where its video was left.
    // The page lists them in the order they were played, the last played
    // last, and they are stamped in that order (a millisecond apart), so
    // the course's last played lesson is the right one when one batch
    // carries two (a lesson left for the next).
    const positionByLessonId = new Map<string, number>();

    for (const item of input.items) {
      if (!availableLessonIds.has(item.lessonId)) continue;
      if (item.positionSeconds !== undefined) {
        positionByLessonId.delete(item.lessonId);
        positionByLessonId.set(item.lessonId, item.positionSeconds);
      }
      if (
        quizLessonIds.has(item.lessonId) &&
        !passedQuizLessonIds.has(item.lessonId)
      )
        continue;
      const current = progressByLessonId.get(item.lessonId) ?? 0;
      progressByLessonId.set(
        item.lessonId,
        Math.max(current, item.progressPercent),
      );
    }

    const now = new Date();
    const playedOrder = new Map(
      [...positionByLessonId.keys()].map((lessonId, index) => [
        lessonId,
        index,
      ]),
    );
    const reportedLessonIds = new Set([
      ...progressByLessonId.keys(),
      ...positionByLessonId.keys(),
    ]);
    const rowsToUpsert = [...reportedLessonIds]
      .map((lessonId) => ({
        lessonId,
        progressPercent: progressByLessonId.get(lessonId) ?? 0,
        positionSeconds: positionByLessonId.get(lessonId),
      }))
      // A lesson with no progress yet is still kept when it says where it
      // was left: it is the lesson the learner is on.
      .filter(
        ({ progressPercent, positionSeconds }) =>
          progressPercent > 0 || positionSeconds !== undefined,
      )
      .map(({ lessonId, progressPercent, positionSeconds }) => ({
        id: crypto.randomUUID(),
        user_id: user.id,
        course_id: course.id,
        lesson_id: lessonId,
        progress_percent: progressPercent,
        position_seconds: positionSeconds ?? null,
        position_updated_at:
          positionSeconds !== undefined
            ? new Date(now.getTime() + (playedOrder.get(lessonId) ?? 0))
            : null,
        created_at: now,
        updated_at: now,
      }));

    // Watch time the page measured while the video was actually playing.
    // Undefined from an older page, which is credited from progress instead.
    const watchedSeconds = input.watchedSeconds;

    if (rowsToUpsert.length === 0 && !(watchedSeconds && watchedSeconds >= 1)) {
      return { synced: true };
    }

    // Daily-activity accrual: one atomic statement upserts progress and
    // credits the learner's current local day with the seconds of video
    // they played (see the repository). Dragging the timeline forward moves
    // progress but plays nothing, so it earns nothing. Activity accrues
    // even before a goal is configured, so a later goal setting finds an
    // intact history/streak.
    await seedTimeZoneFromDevice(user.id, input.timeZone);

    // One statement: progress, the day's activity, and — when this batch
    // takes the day across the learner's goal — the goal-completed event.
    const accrual =
      await learningProgressRepository.upsertProgressAndAccrueActivity(
        database,
        user.id,
        course.id,
        DEFAULT_DAILY_GOAL_MINUTES,
        rowsToUpsert,
        watchedSeconds,
      );

    if (accrual) {
      // A failed notification must never fail the heartbeat. A milestone
      // missed here is picked up on the learner's next learning day.
      try {
        await publishStreakMilestone(user.id, accrual);
      } catch {
        // See above.
      }
    }

    // Announced after the write, for listeners such as a plugin's
    // analytics; a listener's failure is its own.
    try {
      services.analyticsEvents?.emit("learning.activity", {
        userId: user.id,
        courseId: course.id,
        lessonIds: rowsToUpsert.map((row) => row.lesson_id),
        seconds: watchedSeconds ?? 0,
        at: now,
      });
    } catch {
      // See above.
    }

    return { synced: true };
  }

  /**
   * A learner who has never saved settings gets the zone their device
   * reports, so their learning days are their own calendar days rather
   * than UTC ones. Never overrides a saved zone, and never fails a
   * heartbeat: an id that cannot be used is simply skipped.
   */
  async function seedTimeZoneFromDevice(
    userId: string,
    deviceTimeZone: string | undefined,
  ) {
    if (!deviceTimeZone || usersWithSettings.has(userId)) return;
    try {
      const existing =
        await learningProgressRepository.findUserLearningSettings(
          database,
          userId,
        );
      if (!existing) {
        const timeZone = await resolveSupportedTimeZone(deviceTimeZone);
        if (!timeZone) return;
        await learningProgressRepository.seedUserTimeZone(
          database,
          userId,
          timeZone,
        );
      }
      if (usersWithSettings.size >= 20_000) usersWithSettings.clear();
      usersWithSettings.add(userId);
    } catch {
      // Best-effort; the next heartbeat tries again.
    }
  }

  /**
   * The zone id to store for what the client sent: the id itself when
   * Postgres knows it, else its canonical form ("US/Pacific" →
   * "America/Los_Angeles"), else nothing.
   */
  async function resolveSupportedTimeZone(
    timeZone: string,
  ): Promise<string | null> {
    const alias = TIME_ZONE_ALIASES[timeZone];
    const candidates = alias ? [alias, timeZone] : [timeZone];
    try {
      const canonical = new Intl.DateTimeFormat("en-US", {
        timeZone,
      }).resolvedOptions().timeZone;
      if (!candidates.includes(canonical)) candidates.push(canonical);
    } catch {
      return null;
    }
    const supported = await learningProgressRepository.listSupportedTimeZones(
      database,
      candidates,
    );
    return (
      candidates.find((candidate) => supported.includes(candidate)) ?? null
    );
  }

  /**
   * Announces a streak milestone on the heartbeat that makes today a
   * learning day (the goal-completed event is queued by the accrual
   * statement itself).
   *
   * A milestone is announced when the streak reaches it, or up to
   * STREAK_MILESTONE_CATCH_UP_DAYS later: if the announcement failed on the
   * day itself, the next learning day makes it instead of it being lost.
   * The dedupe key — one per learner per milestone — keeps it to once.
   */
  async function publishStreakMilestone(
    userId: string,
    accrual: learningProgressRepository.DailyActivityAccrual,
  ) {
    const wasQualified =
      accrual.previous_seconds >= 60 || accrual.previous_completions >= 1;
    const isQualified = accrual.seconds >= 60 || accrual.completions >= 1;
    if (wasQualified || !isQualified) return;

    const settings = await learningProgressRepository.findUserLearningSettings(
      database,
      userId,
    );
    const aggregates =
      await learningProgressRepository.getLearningSummaryAggregates(database, {
        userId,
        timeZone: settings?.time_zone ?? "UTC",
        floorDate: settings?.accrual_floor_date,
      });
    const streak = aggregates.currentStreakDays;
    const milestone = LEARNING_STREAK_MILESTONES.find(
      (days) =>
        streak >= days && streak <= days + STREAK_MILESTONE_CATCH_UP_DAYS,
    );
    if (milestone === undefined) return;

    await database.transaction().execute(async (transaction) => {
      await outbox.publish(transaction, {
        type: "learning.streak_milestone",
        version: 1,
        dedupeKey: `learning.streak_milestone:${userId}:${milestone}`,
        occurredAt: new Date(),
        payload: { recipientUserId: userId, streakDays: milestone },
      });
    });
  }

  async function getAverageProgressAndCompletionRate(
    filters: { courseId?: string | string[]; asOf?: Date } = {},
  ) {
    return await learningProgressRepository.getAverageProgressAndCompletionRate(
      database,
      filters,
    );
  }

  async function getAverageProgressByCourse(
    filters: {
      courseId?: string | string[];
    } = {},
  ) {
    return await learningProgressRepository.getAverageProgressByCourse(
      database,
      filters,
    );
  }

  /** One grouped query instead of the scalar variant once per course. */
  async function getAverageProgressAndCompletionRateByCourse(
    courseId: string | string[],
  ) {
    return await learningProgressRepository.getAverageProgressAndCompletionRateByCourse(
      database,
      courseId,
    );
  }

  async function getStartedAndCompletedCounts(filters: {
    courseId?: string | string[];
    from?: Date;
    to?: Date;
  }) {
    return await learningProgressRepository.getStartedAndCompletedCounts(
      database,
      filters,
    );
  }

  async function getEstimatedWatchHours(filters: {
    courseId?: string | string[];
    from?: Date;
    to?: Date;
  }) {
    return await learningProgressRepository.getEstimatedWatchHours(
      database,
      filters,
    );
  }

  function presentGoalSettings(
    row: Awaited<
      ReturnType<typeof learningProgressRepository.findUserLearningSettings>
    >,
  ): LearningGoalSettingsResponse {
    if (!row) {
      return {
        hasSavedSettings: false,
        settings: {
          dailyGoalMinutes: DEFAULT_DAILY_GOAL_MINUTES,
          remindersEnabled: false,
          reminderDays: ["mon", "tue", "wed", "thu", "fri"],
          reminderTime: "19:00",
          timeZone: "UTC",
        },
      };
    }
    return {
      hasSavedSettings: true,
      settings: {
        // A row without a goal is one that was made to hold the learner's
        // time zone, or one whose goal was cleared: both have the default.
        dailyGoalMinutes: row.daily_goal_minutes ?? DEFAULT_DAILY_GOAL_MINUTES,
        remindersEnabled: row.reminders_enabled,
        reminderDays: row.reminder_days.filter(
          (day): day is LearningReminderDay =>
            (LEARNING_REMINDER_DAY_IDS as readonly string[]).includes(day),
        ),
        // Postgres time comes back as HH:MM:SS.
        reminderTime: row.reminder_time.slice(0, 5),
        timeZone: row.time_zone,
      },
    };
  }

  async function getGoalSettings(
    user: UserContext,
  ): Promise<LearningGoalSettingsResponse> {
    const row = await learningProgressRepository.findUserLearningSettings(
      database,
      user.id,
    );
    return presentGoalSettings(row);
  }

  async function updateGoalSettings(
    user: UserContext,
    input: UpdateLearningGoalSettingsRequest,
  ): Promise<LearningGoalSettingsResponse> {
    // The contract checks the id with `Intl`; the database buckets days
    // with it, and does not know every id `Intl` accepts.
    const timeZone = await resolveSupportedTimeZone(input.timeZone);
    if (!timeZone) {
      throw new AppError(
        400,
        "UNSUPPORTED_TIME_ZONE",
        "That time zone is not supported. Choose a region-based zone such as Asia/Kolkata.",
      );
    }
    const row = await learningProgressRepository.upsertUserLearningSettings(
      database,
      {
        user_id: user.id,
        daily_goal_minutes: input.dailyGoalMinutes,
        reminders_enabled: input.remindersEnabled,
        reminder_days: [...new Set(input.reminderDays)],
        reminder_time: input.reminderTime,
        time_zone: timeZone,
      },
    );
    usersWithSettings.add(user.id);
    // Today is judged against the goal as it now stands; the days before
    // keep the goal they were learned under.
    await learningProgressRepository.stampTodayGoal(database, {
      userId: user.id,
      goalMinutes: row.daily_goal_minutes ?? DEFAULT_DAILY_GOAL_MINUTES,
      timeZone: row.time_zone,
      floorDate: row.accrual_floor_date,
    });
    return presentGoalSettings(row);
  }

  async function getSummary(
    user: UserContext,
  ): Promise<LearningSummaryResponse> {
    const settings = await learningProgressRepository.findUserLearningSettings(
      database,
      user.id,
    );
    const aggregates =
      await learningProgressRepository.getLearningSummaryAggregates(database, {
        userId: user.id,
        timeZone: settings?.time_zone ?? "UTC",
        floorDate: settings?.accrual_floor_date,
      });

    // Every learner has a goal: their own, or the default until they
    // choose one.
    const chosenGoalMinutes = settings?.daily_goal_minutes ?? null;
    const dailyGoalMinutes = chosenGoalMinutes ?? DEFAULT_DAILY_GOAL_MINUTES;
    const goalSeconds = dailyGoalMinutes * 60;
    const todayPct =
      goalSeconds > 0
        ? Math.min(
            100,
            Math.floor((aggregates.todaySeconds / goalSeconds) * 100),
          )
        : 0;

    return {
      configured: chosenGoalMinutes !== null,
      dailyGoalMinutes,
      todaySeconds: aggregates.todaySeconds,
      todayCompletions: aggregates.todayCompletions,
      todayPct,
      remainingSeconds: Math.max(0, goalSeconds - aggregates.todaySeconds),
      goalCompletedToday:
        goalSeconds > 0 && aggregates.todaySeconds >= goalSeconds,
      weekSeconds: aggregates.weekSeconds,
      weekTargetSeconds: goalSeconds * 7,
      currentStreakDays: aggregates.currentStreakDays,
      bestStreakDays: aggregates.bestStreakDays,
    };
  }

  return {
    getProgress,
    getResumeContext,
    syncProgress,
    getSummary,
    getGoalSettings,
    updateGoalSettings,
    resolveSupportedTimeZone,
    getAverageProgressAndCompletionRate,
    getAverageProgressAndCompletionRateByCourse,
    getAverageProgressByCourse,
    getStartedAndCompletedCounts,
    getEstimatedWatchHours,
  };
}
