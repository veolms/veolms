import type {
  LearningCommunityResponse,
  LearningHistoryLearner,
  LearningHistoryQuery,
  LearningHistoryResponse,
  ProgressSharingResponse,
  UpdateProgressSharingRequest,
} from "@veolms/contracts";
import {
  DEFAULT_DAILY_GOAL_MINUTES,
  LEARNING_HISTORY_MAX_DAYS,
} from "@veolms/contracts";
import type { Database } from "@veolms/database";
import type { Kysely } from "kysely";

import { AppError } from "../../lib/errors.ts";
import type { AppServices } from "../../services/index.ts";
import { ADMIN_ROLE, createAuthService } from "../auth/index.ts";
import { hasAcademyPermission } from "../authorization/index.ts";
import { displayAvatarUrl } from "../avatars/index.ts";
import { createCourseService } from "../courses/index.ts";
import * as historyRepository from "./learning-history.repository.ts";
import {
  createLearningProgressService,
  type LearningProgressService,
} from "./learning-progress.service.ts";

type Viewer = { id: string; roles: readonly string[] };

type AuthService = Pick<
  ReturnType<typeof createAuthService>,
  "listUserCardsByIds" | "findUserCardByUsername"
>;
type CourseService = Pick<
  ReturnType<typeof createCourseService>,
  "listCourseCardsByIds"
>;

/** How many members who share are listed. */
const COMMUNITY_LIMIT = 100;

/** A tile's width in the day's list of courses, at twice the density. */
const COURSE_THUMBNAIL_WIDTH = 240;

const DAY_MS = 24 * 60 * 60 * 1000;

/** The moment a `YYYY-MM-DD` names in UTC, or null when it names no day. */
function parseDay(value: string): number | null {
  const time = Date.parse(`${value}T00:00:00Z`);
  if (Number.isNaN(time)) return null;
  // `Date` rolls 2026-02-31 over into March; a real day reads back the same.
  return new Date(time).toISOString().slice(0, 10) === value ? time : null;
}

type UserCard = Awaited<ReturnType<AuthService["listUserCardsByIds"]>>[number];

function presentLearner(user: UserCard): LearningHistoryLearner {
  return {
    id: user.id,
    name: user.display_name,
    username: user.username,
    avatarUrl: displayAvatarUrl(user.avatar_data_url),
  };
}

/**
 * A learner's history, day by day, and who may read it.
 *
 * The history is the learner's own. An admin can read anyone's. Any other
 * member can read it only while the learner shares it, which they turn on
 * themselves and is off until they do.
 */
export function createLearningHistoryService({
  database,
  services,
  authService = createAuthService({ database }),
  courseService = createCourseService({ database, services }),
  progressService = createLearningProgressService({ database, services }),
}: {
  database: Kysely<Database>;
  services: AppServices;
  authService?: AuthService;
  courseService?: CourseService;
  progressService?: Pick<LearningProgressService, "resolveSupportedTimeZone">;
}) {
  async function getHistory(
    viewer: Viewer,
    query: LearningHistoryQuery,
  ): Promise<LearningHistoryResponse> {
    const from = parseDay(query.from);
    const to = parseDay(query.to);
    if (from === null || to === null || from > to) {
      throw new AppError(
        400,
        "INVALID_DATE_RANGE",
        "Give a first and a last day, the first no later than the last.",
      );
    }
    if ((to - from) / DAY_MS + 1 > LEARNING_HISTORY_MAX_DAYS) {
      throw new AppError(
        400,
        "DATE_RANGE_TOO_LONG",
        `Ask for at most ${LEARNING_HISTORY_MAX_DAYS} days at a time.`,
      );
    }

    const user = query.username
      ? await authService.findUserCardByUsername(query.username)
      : (await authService.listUserCardsByIds([viewer.id]))[0];
    if (!user) {
      throw new AppError(
        404,
        "LEARNER_NOT_FOUND",
        "This learner could not be found.",
      );
    }
    const learnerId = user.id;
    const isOwn = learnerId === viewer.id;
    const calendar = await historyRepository.findLearnerCalendar(
      database,
      learnerId,
    );
    // Staff who see every student (admin, or student.read for every course)
    // see their progress whether or not it is shared.
    const isAdmin = viewer.roles.includes(ADMIN_ROLE);
    const seesEveryStudent =
      isAdmin ||
      (!isOwn &&
        !calendar.shared &&
        (await hasAcademyPermission(database, viewer.id, "student.read")));
    if (!isOwn && !seesEveryStudent && !calendar.shared) {
      throw new AppError(
        403,
        "PROGRESS_NOT_SHARED",
        "This learner has not shared their progress.",
      );
    }

    const range = { userId: learnerId, from: query.from, to: query.to };
    const [dayRows, courseRows] = await Promise.all([
      historyRepository.listDailyActivity(database, range),
      historyRepository.listDailyCourseActivity(database, range),
    ]);
    const cards = await courseService.listCourseCardsByIds(
      courseRows.map((row) => row.course_id),
    );
    // The learner, and an admin, are told of every course the time went to.
    // Anyone else is told only of courses that are published: a course
    // still being written is not announced by someone having studied it.
    const shownCourses = cards.filter(
      (course) => isOwn || isAdmin || course.status === "published",
    );
    const shownCourseIds = new Set(shownCourses.map((course) => course.id));

    const goalMinutes = calendar.dailyGoalMinutes ?? DEFAULT_DAILY_GOAL_MINUTES;
    const sharesByDay = new Map<
      string,
      LearningHistoryResponse["days"][number]["courses"]
    >();
    for (const row of courseRows) {
      if (!shownCourseIds.has(row.course_id)) continue;
      const shares = sharesByDay.get(row.activity_date) ?? [];
      shares.push({
        courseId: row.course_id,
        seconds: row.seconds,
        completions: row.completions,
      });
      sharesByDay.set(row.activity_date, shares);
    }

    return {
      learner: presentLearner(user),
      isOwn,
      shared: calendar.shared,
      today: calendar.today,
      goalMinutes,
      days: dayRows.map((row) => ({
        date: row.activity_date,
        seconds: row.seconds,
        completions: row.completions,
        // A row from before the day's goal was kept has the present one.
        goalMinutes: row.goal_minutes ?? goalMinutes,
        courses: sharesByDay.get(row.activity_date) ?? [],
      })),
      courses: shownCourses.map((course) => ({
        id: course.id,
        title: course.title,
        slug: course.slug,
        // The smallest picture that fills a tile, when there is a choice.
        thumbnailUrl:
          [...course.thumbnailSrcSet]
            .sort((left, right) => left.width - right.width)
            .find((variant) => variant.width >= COURSE_THUMBNAIL_WIDTH)?.url ??
          course.thumbnailUrl,
      })),
    };
  }

  /** The members who share their progress, with their last seven days. */
  async function listCommunity(
    viewer: Viewer,
  ): Promise<LearningCommunityResponse> {
    const rows = await historyRepository.listSharingLearners(database, {
      defaultGoalMinutes: DEFAULT_DAILY_GOAL_MINUTES,
      limit: COMMUNITY_LIMIT,
    });
    const users = await authService.listUserCardsByIds(
      rows.map((row) => row.user_id),
    );
    const userById = new Map(users.map((user) => [user.id, user]));
    return {
      // A member whose account has gone is no longer listed.
      learners: rows.flatMap((row) => {
        const user = userById.get(row.user_id);
        if (!user) return [];
        return [
          {
            learner: presentLearner(user),
            isYou: row.user_id === viewer.id,
            goalMinutes: row.goal_minutes,
            todaySeconds: row.today_seconds,
            weekSeconds: row.week_seconds,
            weekGoalsMet: Math.min(7, row.week_goals_met),
          },
        ];
      }),
    };
  }

  async function updateSharing(
    viewer: Viewer,
    input: UpdateProgressSharingRequest,
  ): Promise<ProgressSharingResponse> {
    // Only used for a learner with nothing stored yet (see the repository).
    const timeZone =
      (input.timeZone
        ? await progressService.resolveSupportedTimeZone(input.timeZone)
        : null) ?? "UTC";
    const shared = await historyRepository.setProgressShared(database, {
      userId: viewer.id,
      shared: input.shared,
      timeZone,
    });
    return { shared };
  }

  return { getHistory, listCommunity, updateSharing };
}

export type LearningHistoryService = ReturnType<
  typeof createLearningHistoryService
>;
