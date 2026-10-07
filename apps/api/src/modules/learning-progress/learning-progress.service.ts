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
import { LEARNING_REMINDER_DAY_IDS } from "@veolms/contracts";
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
import { createOutboxService } from "../../events/outbox.service.ts";
import {
  createQuizCompletionService,
  type QuizCompletionService,
} from "../quizzes/index.ts";
import * as learningProgressRepository from "./learning-progress.repository.ts";

/** Streak lengths that earn a one-time milestone notification. */
const LEARNING_STREAK_MILESTONES = [7, 30, 100, 365] as const;
/** Days after a milestone on which a missed announcement is still made. */
const STREAK_MILESTONE_CATCH_UP_DAYS = 2;

type UserContext = { id: string; roles: readonly string[] };

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

interface OrderedLesson {
  id: string;
}

export interface ResumeCurriculumLesson {
  id: string;
  sectionId: string;
  title: string;
  sectionTitle: string;
  contentType: "video" | "document" | "quiz";
}

export type ResumeProgressRow = {
  lesson_id: string;
  progress_percent: number;
  updated_at: Date;
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
  content_type: "video" | "document" | "quiz";
  position: number;
  is_published: boolean;
}

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
      sectionId: lesson.section_id,
      title: lesson.title,
      sectionTitle: sectionById.get(lesson.section_id)!.title,
      contentType: lesson.content_type,
    }));
}

function normalizeProgressPercent(value: number): number {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return 0;
  return Math.max(0, Math.min(100, Math.trunc(numericValue)));
}

function progressUpdatedAt(row: ResumeProgressRow): number {
  const timestamp =
    row.updated_at instanceof Date
      ? row.updated_at.getTime()
      : new Date(row.updated_at).getTime();
  return Number.isFinite(timestamp) ? timestamp : Number.NEGATIVE_INFINITY;
}

/**
 * Resolves a persisted-progress-based resume recommendation for one ordered
 * course curriculum. The progress timestamp is used as a recency signal, not
 * as literal last-viewed telemetry.
 */
export function resolveResumeContext(
  courseId: string,
  courseSlug: string,
  lessons: ResumeCurriculumLesson[],
  rows: ResumeProgressRow[],
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
  ): LearningProgressResumeLesson => ({
    lessonId: lesson.id,
    lessonNumber: index + 1,
    title: lesson.title,
    sectionId: lesson.sectionId,
    sectionTitle: lesson.sectionTitle,
    contentType: lesson.contentType,
    progressPercent: progressByLessonId.get(lesson.id) ?? 0,
  });

  const emptyResponse = (): LearningProgressResumeContextResponse => ({
    courseId,
    courseSlug,
    totalLessons: lessons.length,
    completedLessons: lessons.filter(
      (lesson) => (progressByLessonId.get(lesson.id) ?? 0) >= 100,
    ).length,
    resumeLesson: null,
    previousLesson: null,
    nextLesson: null,
    upcomingLessons: [],
  });

  if (lessons.length === 0) return emptyResponse();

  const partialIndexes = lessons.flatMap((lesson, index) => {
    const progressPercent = progressByLessonId.get(lesson.id) ?? 0;
    return progressPercent > 0 && progressPercent < 100 ? [index] : [];
  });

  let resumeIndex: number;
  if (partialIndexes.length > 0) {
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
    resumeIndex = lessons.findIndex(
      (lesson) => (progressByLessonId.get(lesson.id) ?? 0) < 100,
    );
    if (resumeIndex === -1) return emptyResponse();
  }

  const upcomingLessons = lessons
    .slice(resumeIndex + 1, resumeIndex + 4)
    .map((lesson, index) => toResponseLesson(lesson, resumeIndex + 1 + index));

  return {
    courseId,
    courseSlug,
    totalLessons: lessons.length,
    completedLessons: lessons.filter(
      (lesson) => (progressByLessonId.get(lesson.id) ?? 0) >= 100,
    ).length,
    resumeLesson: toResponseLesson(lessons[resumeIndex]!, resumeIndex),
    previousLesson:
      resumeIndex > 0
        ? toResponseLesson(lessons[resumeIndex - 1]!, resumeIndex - 1)
        : null,
    nextLesson:
      resumeIndex < lessons.length - 1
        ? toResponseLesson(lessons[resumeIndex + 1]!, resumeIndex + 1)
        : null,
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
  curriculumService = createCurriculumService({ database, services }),
  quizCompletionService = createQuizCompletionService({ database }),
}: {
  database: Kysely<Database>;
  services: AppServices;
  accessService?: AccessService;
  curriculumService?: CurriculumService;
  quizCompletionService?: QuizCompletionService;
}): LearningProgressService {
  const outbox = createOutboxService();
  // Learners known to have a settings row, so the heartbeat does not look
  // it up every time. Per process; a miss only costs one indexed read.
  const usersWithSettings = new Set<string>();

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

  async function listAvailableResumeLessons(
    courseId: string,
    canManageCourse: boolean,
  ): Promise<ResumeCurriculumLesson[]> {
    const [sections, lessons] = await Promise.all([
      curriculumService.findSectionsByCourseId(courseId),
      curriculumService.findLessonsByCourseId(courseId),
    ]);
    return orderAvailableLessons(sections, lessons, canManageCourse);
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

  async function getResumeContext(
    user: UserContext,
    courseKey: string,
  ): Promise<LearningProgressResumeContextResponse> {
    const course = await requireCourse(user, courseKey);
    const canManageCourse =
      course.creator_id === user.id || user.roles.includes(ADMIN_ROLE);
    const [lessons, rows] = await Promise.all([
      listAvailableResumeLessons(course.id, canManageCourse),
      learningProgressRepository.listUserCourseProgress(
        database,
        user.id,
        course.id,
      ),
    ]);

    return resolveResumeContext(course.id, course.slug, lessons, rows);
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

    for (const item of input.items) {
      if (!availableLessonIds.has(item.lessonId)) continue;
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
    const rowsToUpsert = [...progressByLessonId.entries()]
      .filter(([, progressPercent]) => progressPercent > 0)
      .map(([lessonId, progressPercent]) => ({
        id: crypto.randomUUID(),
        user_id: user.id,
        course_id: course.id,
        lesson_id: lessonId,
        progress_percent: progressPercent,
        created_at: now,
        updated_at: now,
      }));

    if (rowsToUpsert.length === 0) {
      return { synced: true };
    }

    // Daily-activity accrual (approved PRD §8): one atomic statement
    // upserts progress and credits delta% x lesson duration to the
    // learner's current local day. Replays produce zero deltas, so
    // retries/sendBeacon duplicates never double-credit. Activity accrues
    // even before a goal is configured, so a later goal setting finds an
    // intact history/streak.
    await seedTimeZoneFromDevice(user.id, input.timeZone);

    // One statement: progress, the day's activity, and — when this batch
    // takes the day across the learner's goal — the goal-completed event.
    const accrual =
      await learningProgressRepository.upsertProgressAndAccrueActivity(
        database,
        user.id,
        rowsToUpsert,
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
    const candidates = [timeZone];
    try {
      const canonical = new Intl.DateTimeFormat("en-US", {
        timeZone,
      }).resolvedOptions().timeZone;
      if (canonical !== timeZone) candidates.push(canonical);
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
        configured: false,
        hasSavedSettings: false,
        settings: {
          dailyGoalMinutes: null,
          remindersEnabled: false,
          reminderDays: ["mon", "tue", "wed", "thu", "fri"],
          reminderTime: "19:00",
          timeZone: "UTC",
        },
      };
    }
    return {
      configured: row.daily_goal_minutes !== null,
      hasSavedSettings: true,
      settings: {
        dailyGoalMinutes: row.daily_goal_minutes,
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

    const dailyGoalMinutes = settings?.daily_goal_minutes ?? null;
    const goalSeconds = dailyGoalMinutes === null ? 0 : dailyGoalMinutes * 60;
    const todayPct =
      goalSeconds > 0
        ? Math.min(
            100,
            Math.floor((aggregates.todaySeconds / goalSeconds) * 100),
          )
        : 0;

    return {
      configured: dailyGoalMinutes !== null,
      dailyGoalMinutes,
      todaySeconds: aggregates.todaySeconds,
      todayPct,
      remainingSeconds: Math.max(0, goalSeconds - aggregates.todaySeconds),
      goalCompletedToday:
        goalSeconds > 0 && aggregates.todaySeconds >= goalSeconds,
      weekSeconds: aggregates.weekSeconds,
      weekTargetSeconds: goalSeconds * 7,
      currentStreakDays: aggregates.currentStreakDays,
      bestStreakDays: aggregates.bestStreakDays,
      lastActivityDate: aggregates.lastActivityDate,
    };
  }

  return {
    getProgress,
    getResumeContext,
    syncProgress,
    getSummary,
    getGoalSettings,
    updateGoalSettings,
    getAverageProgressAndCompletionRate,
    getAverageProgressAndCompletionRateByCourse,
    getAverageProgressByCourse,
    getStartedAndCompletedCounts,
    getEstimatedWatchHours,
  };
}
