import {
  hashKey,
  type QueryClient,
  type QueryKey,
} from "@tanstack/react-query";
import type {
  CourseAccessResponse,
  EnrolledCoursesResponse,
  LessonDiscussionsListResponse,
  WishlistResponse,
} from "@veolms/contracts";
import {
  clearSessionCache,
  readSessionCache,
  writeSessionCache,
} from "../lib/session-cache";
import {
  COURSE_ACCESS_SESSION_KEY_PREFIX,
  ENROLLED_COURSES_SESSION_KEY_PREFIX,
  LEARNING_SUMMARY_SESSION_KEY_PREFIX,
  LESSON_DISCUSSION_COUNTS_SESSION_KEY_PREFIX,
  LESSON_DISCUSSIONS_SESSION_KEY_PREFIX,
  NOTIFICATION_SUMMARY_SESSION_KEY_PREFIX,
  RESUME_CONTEXT_SESSION_KEY_PREFIX,
  WISHLIST_SESSION_KEY_PREFIX,
} from "../store/accountBrowserState";
import { authStore } from "../store/auth.store";
import {
  clearLessonEarlyState,
  readEarlySessionCopy,
} from "../store/lessonEarlyState";
import { authKeys } from "./auth/auth.keys";
import { courseKeys } from "./courses/courses.keys";
import { enrollmentKeys } from "./enrollments/enrollments.keys";
import { learningGoalKeys } from "./learning-goals/learning-goals.keys";
import { learningInteractionKeys } from "./learning-interactions/learning-interactions.keys";
import { learningProgressKeys } from "./learning-progress/learning-progress.keys";
import { notificationKeys } from "./notifications/notifications.keys";
import { wishlistKeys } from "./wishlist/wishlist.keys";

/**
 * Answers about the signed-in learner, kept in the tab's session storage so
 * a reload draws the course cards and the course page as they were at once,
 * instead of waiting for the session check and these answers: the enrolled
 * courses, the wishlist, the unread notification count (the dot on the
 * profile button), each course page's access answer (its band: progress
 * and where to resume, or the price), and what the learner's home leads
 * with: where to carry on in each course it has led with, and today's
 * learning against the daily goal (the laptop).
 *
 * - Right after hydration, before any other effect asks for them, the copies
 *   are put in the query cache with the time they were fetched, so the page
 *   shows them at once whatever their age. A copy younger than its query's
 *   `staleTime` is taken as current and no request is made; an older one is
 *   shown and refreshed in the background. Only the access answer of the
 *   course in the address is restored; the others are restored when a page
 *   asks (not at all: in-app navigation keeps them in memory). Where to
 *   carry on is restored for every course this tab kept it for: there are
 *   only ever a few, and the home's hero needs its course's at once.
 * - Whatever marks an answer out of date (a purchase, an enrolment, an
 *   unenrolment, an access change: they invalidate it) deletes its copy at
 *   once, so a reload before the new answer arrives never shows the old
 *   one; the new answer is saved when it comes.
 * - Each account has its own copies. They are deleted when the session
 *   ends (`isAccountSessionStorageKey`), and dropped when the session check
 *   answers with another account or none.
 *
 * The document's head reads the same copies before the first paint (see
 * `courses/courseCardEarlyState.ts`), so its first frame agrees with them.
 *
 * A lesson page goes one step further (see `learning/lessonPageEarlyState.ts`):
 * the course's access answer and the lesson's discussion counts are read
 * into the queries' initial data as the page hydrates (`readAccountCopy`),
 * so that React's first render agrees with what the head drew from them,
 * and the first page of the lesson's discussions is kept too, for the
 * moment after.
 */

/** How old a copy may be and still be shown while the answer is fetched. */
const KEPT_MS = 7 * 24 * 60 * 60 * 1000;

interface AccountCopy {
  /** The query this copy is of, for an account; null: not this kind. */
  storageKeyOf: (queryKey: QueryKey, userId: string) => string | null;
  isValid: (value: unknown) => boolean;
  /**
   * What is kept of the answer, when not all of it (an infinite query's
   * first page), and the answer that is put back from what was kept.
   */
  keep?: (data: unknown) => unknown;
  restore?: (kept: unknown) => unknown;
  /**
   * Copies of this kind for an account are kept this many at most, the
   * oldest going first: there is one per lesson opened in the tab.
   */
  keepAtMost?: { prefix: string; count: number };
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object";

const hasCourseIds = (list: unknown) =>
  Array.isArray(list) &&
  list.every((item) => isObject(item) && typeof item.courseId === "string");

const enrolledCoursesHash = hashKey(enrollmentKeys.courses());
const notificationSummaryHash = hashKey(notificationKeys.summary());
const learningSummaryHash = hashKey(learningGoalKeys.summary());

/** The course a resume-context query is for, or null: not one of those. */
const resumeContextCourse = (queryKey: QueryKey): string | null => {
  const courseKey = queryKey[2];
  return typeof courseKey === "string" &&
    courseKey &&
    hashKey(queryKey) === hashKey(learningProgressKeys.resumeContext(courseKey))
    ? courseKey
    : null;
};

/** The lesson a per-lesson query is for, or null: not one of those. */
const lessonOf = (
  queryKey: QueryKey,
  keyOf: (courseId: string, lessonId: string) => QueryKey,
): { courseId: string; lessonId: string } | null => {
  const courseId = queryKey[2];
  const lessonId = queryKey[3];
  return typeof courseId === "string" &&
    courseId &&
    typeof lessonId === "string" &&
    lessonId &&
    hashKey(queryKey) === hashKey(keyOf(courseId, lessonId))
    ? { courseId, lessonId }
    : null;
};

export type LessonDiscussionsKind = "all" | "comment" | "note" | "question";

/**
 * The query the lesson page opens its discussions with: every kind the
 * course allows (or the one kind it allows), the most liked first,
 * everyone's, no search. Only that one is kept (see `Discussion.tsx`).
 */
export const openingLessonDiscussionsQuery = (kind: LessonDiscussionsKind) => ({
  kind,
  sort: "top" as const,
});

const isDiscussionsPage = (
  value: unknown,
): value is LessonDiscussionsListResponse =>
  isObject(value) && Array.isArray(value.items);

/** At most this many lessons' first pages are kept for an account. */
const KEPT_LESSON_DISCUSSION_PAGES = 8;

const COPIES: AccountCopy[] = [
  {
    storageKeyOf: (queryKey, userId) =>
      hashKey(queryKey) === enrolledCoursesHash
        ? `${ENROLLED_COURSES_SESSION_KEY_PREFIX}${userId}`
        : null,
    isValid: (value): value is EnrolledCoursesResponse =>
      isObject(value) && hasCourseIds(value.courses),
  },
  {
    // The unread count behind the dot on the profile button.
    storageKeyOf: (queryKey, userId) =>
      hashKey(queryKey) === notificationSummaryHash
        ? `${NOTIFICATION_SUMMARY_SESSION_KEY_PREFIX}${userId}`
        : null,
    isValid: (value) =>
      isObject(value) && typeof value.unreadCount === "number",
  },
  {
    storageKeyOf: (queryKey, userId) =>
      hashKey(queryKey) === hashKey(wishlistKeys.items(userId))
        ? `${WISHLIST_SESSION_KEY_PREFIX}${userId}`
        : null,
    isValid: (value): value is WishlistResponse =>
      isObject(value) && hasCourseIds(value.items),
  },
  {
    storageKeyOf: (queryKey, userId) => {
      const slug = queryKey[2];
      return typeof slug === "string" &&
        hashKey(queryKey) === hashKey(courseKeys.access(slug))
        ? `${COURSE_ACCESS_SESSION_KEY_PREFIX}${userId}:${slug}`
        : null;
    },
    isValid: (value): value is CourseAccessResponse =>
      isObject(value) &&
      typeof value.courseId === "string" &&
      typeof value.enrolled === "boolean",
  },
  {
    storageKeyOf: (queryKey, userId) => {
      const courseKey = resumeContextCourse(queryKey);
      return courseKey
        ? `${RESUME_CONTEXT_SESSION_KEY_PREFIX}${userId}:${courseKey}`
        : null;
    },
    isValid: (value) =>
      isObject(value) &&
      typeof value.courseId === "string" &&
      typeof value.courseSlug === "string",
  },
  {
    storageKeyOf: (queryKey, userId) =>
      hashKey(queryKey) === learningSummaryHash
        ? `${LEARNING_SUMMARY_SESSION_KEY_PREFIX}${userId}`
        : null,
    isValid: (value) =>
      isObject(value) && typeof value.todaySeconds === "number",
  },
  {
    // A lesson's discussion counts ("22 Discussions" under the video).
    storageKeyOf: (queryKey, userId) => {
      const lesson = lessonOf(
        queryKey,
        learningInteractionKeys.lessonInteractionCounts,
      );
      return lesson
        ? `${LESSON_DISCUSSION_COUNTS_SESSION_KEY_PREFIX}${userId}:${lesson.courseId}:${lesson.lessonId}`
        : null;
    },
    isValid: (value) => isObject(value) && typeof value.total === "number",
  },
  {
    // The first page of a lesson's discussions, as the lesson page opens
    // them. The query is infinite; only its first page is kept, under the
    // kind it was asked for.
    storageKeyOf: (queryKey, userId) => {
      const kind = queryKey[5];
      if (typeof kind !== "string") return null;
      const lesson = lessonOf(queryKey, (courseId, lessonId) =>
        learningInteractionKeys.lessonDiscussions(
          courseId,
          lessonId,
          openingLessonDiscussionsQuery(kind as LessonDiscussionsKind),
        ),
      );
      return lesson
        ? `${LESSON_DISCUSSIONS_SESSION_KEY_PREFIX}${userId}:${lesson.courseId}:${lesson.lessonId}:${kind}`
        : null;
    },
    isValid: (value) => isObject(value) && isDiscussionsPage(value.page),
    keep: (data) => {
      const pages = isObject(data) ? data.pages : undefined;
      const page = Array.isArray(pages) ? pages[0] : undefined;
      return isDiscussionsPage(page) ? { page } : undefined;
    },
    restore: (kept) =>
      isObject(kept) && isDiscussionsPage(kept.page)
        ? { pages: [kept.page], pageParams: [null] }
        : undefined,
    keepAtMost: {
      prefix: LESSON_DISCUSSIONS_SESSION_KEY_PREFIX,
      count: KEPT_LESSON_DISCUSSION_PAGES,
    },
  },
];

/** The courses this tab kept a resume context for, for an account. */
function savedResumeContextCourses(userId: string): string[] {
  const prefix = `${RESUME_CONTEXT_SESSION_KEY_PREFIX}${userId}:`;
  const courses: string[] = [];
  try {
    for (let index = 0; index < sessionStorage.length; index += 1) {
      const key = sessionStorage.key(index);
      if (key?.startsWith(prefix)) courses.push(key.slice(prefix.length));
    }
  } catch {
    // Nothing kept, or nothing readable: nothing to restore.
  }
  return courses;
}

const currentUserHash = hashKey(authKeys.me());

/** The account an answer belongs to: the signed-in one, or the remembered one. */
const currentUserId = () =>
  authStore.getState().user?.id ?? authStore.getIdentityHint()?.userId ?? null;

function copyOf(queryKey: QueryKey, userId: string) {
  for (const copy of COPIES) {
    const storageKey = copy.storageKeyOf(queryKey, userId);
    if (storageKey) return { copy, storageKey };
  }
  return null;
}

/**
 * This tab's copy of a query's answer for the remembered account, with the
 * time it was fetched, or undefined. For a query's initial data on a page
 * whose document was filled in from the same copy before it was drawn (the
 * lesson page, `learning/lessonPageEarlyState.ts`): read during the first
 * render on purpose, so that render agrees with the document. Everywhere
 * else the copies are put in place after hydration
 * (`startAccountSessionCopies`): a page that was not filled in from them
 * must not read them while it hydrates.
 */
export function readAccountCopy<T>(
  queryKey: QueryKey,
): { value: T; savedAt: number } | undefined {
  const userId = currentUserId();
  if (!userId) return undefined;
  const found = copyOf(queryKey, userId);
  if (!found) return undefined;
  // As the document's head read it, when it did (store/lessonEarlyState.ts):
  // the page was drawn from that reading, and storage may have moved on.
  const early = readEarlySessionCopy(found.storageKey);
  const saved =
    early === undefined
      ? readSessionCache(found.storageKey, KEPT_MS, (value): value is unknown =>
          found.copy.isValid(value),
        )
      : early && found.copy.isValid(early.value)
        ? early
        : undefined;
  if (!saved) return undefined;
  const value = found.copy.restore
    ? found.copy.restore(saved.value)
    : saved.value;
  return value === undefined
    ? undefined
    : { value: value as T, savedAt: saved.savedAt };
}

/**
 * Drops the oldest copies under `prefix` beyond `count` (those of lessons
 * opened long ago in this tab).
 */
function trimCopies(prefix: string, count: number) {
  const kept: { key: string; savedAt: number }[] = [];
  try {
    for (let index = 0; index < sessionStorage.length; index += 1) {
      const key = sessionStorage.key(index);
      if (!key?.startsWith(prefix)) continue;
      let savedAt = -1;
      try {
        const saved: unknown = JSON.parse(sessionStorage.getItem(key) ?? "");
        if (isObject(saved) && typeof saved.savedAt === "number") {
          savedAt = saved.savedAt;
        }
      } catch {
        // Unreadable: the first to go.
      }
      kept.push({ key, savedAt });
    }
    kept.sort((a, b) => b.savedAt - a.savedAt);
    for (const { key } of kept.slice(count)) sessionStorage.removeItem(key);
  } catch {
    // Nothing kept, or nothing readable: nothing to trim.
  }
}

/** The course whose page is open, read from the address. */
function courseInAddress(): string | null {
  const match = /^\/(?:courses|learn)\/([^/]+)/u.exec(window.location.pathname);
  if (!match?.[1] || match[1] === "free") return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

/**
 * Started once, after hydration: puts the copies in the query cache and
 * keeps them in step with the answers from then on. Returns the
 * unsubscriber.
 */
export function startAccountSessionCopies(queryClient: QueryClient) {
  const userId = currentUserId();
  // What was restored, until the session check confirms whose it is.
  let restored: {
    userId: string;
    keys: { queryKey: QueryKey; storageKey: string }[];
  } | null = null;
  if (userId) {
    const slug = courseInAddress();
    const queryKeys: QueryKey[] = [
      enrollmentKeys.courses(),
      wishlistKeys.items(userId),
      notificationKeys.summary(),
      learningGoalKeys.summary(),
      ...(slug ? [courseKeys.access(slug)] : []),
      ...savedResumeContextCourses(userId).map((courseKey) =>
        learningProgressKeys.resumeContext(courseKey),
      ),
    ];
    for (const queryKey of queryKeys) {
      const found = copyOf(queryKey, userId);
      if (!found) continue;
      const saved = readSessionCache(
        found.storageKey,
        KEPT_MS,
        (value): value is unknown => found.copy.isValid(value),
      );
      if (!saved) continue;
      const state = queryClient.getQueryState(queryKey);
      if (state?.data !== undefined) {
        // Already in the cache. Seeded from this copy as the page hydrated
        // (`readAccountCopy`: the same time stamp, as storage or the head
        // read it), it is the copy restored, and is dropped with the
        // others below if the session check says the account is another.
        const early = readEarlySessionCopy(found.storageKey);
        if (
          state.dataUpdatedAt !== saved.savedAt &&
          state.dataUpdatedAt !== early?.savedAt
        ) {
          continue;
        }
      } else {
        const value = found.copy.restore
          ? found.copy.restore(saved.value)
          : saved.value;
        if (value === undefined) continue;
        queryClient.setQueryData(queryKey, value, {
          updatedAt: saved.savedAt,
        });
      }
      restored ??= { userId, keys: [] };
      restored.keys.push({ queryKey, storageKey: found.storageKey });
    }
  }
  // The page has hydrated: what the head read is in the cache or has been
  // read by the page's first render; storage is the truth from here.
  clearLessonEarlyState();

  return queryClient.getQueryCache().subscribe((event) => {
    const { query } = event;

    if (query.queryHash === currentUserHash) {
      // The session check answered: copies restored for another account,
      // or for a session that has ended, are dropped.
      if (
        restored &&
        event.type === "updated" &&
        event.action.type === "success"
      ) {
        const user = query.state.data as { id?: string } | null | undefined;
        if (user?.id !== restored.userId) {
          for (const { queryKey, storageKey } of restored.keys) {
            clearSessionCache(storageKey);
            queryClient.removeQueries({ queryKey, exact: true });
          }
        }
        restored = null;
      }
      return;
    }

    const owner = currentUserId();
    if (!owner) return;
    const found = copyOf(query.queryKey, owner);
    if (!found) return;

    if (event.type === "removed") {
      clearSessionCache(found.storageKey);
      return;
    }
    if (event.type !== "updated") return;
    if (event.action.type === "invalidate") {
      clearSessionCache(found.storageKey);
      return;
    }
    if (event.action.type === "success") {
      const data: unknown = found.copy.keep
        ? found.copy.keep(query.state.data)
        : query.state.data;
      if (data === undefined || !found.copy.isValid(data)) return;
      // Saved with the time it was fetched, not now: a restored copy is
      // written back unchanged, and a refetch that brings the same answer
      // (the cache keeps the old object then) still counts as new.
      writeSessionCache(found.storageKey, data, query.state.dataUpdatedAt);
      if (found.copy.keepAtMost) {
        trimCopies(
          `${found.copy.keepAtMost.prefix}${owner}:`,
          found.copy.keepAtMost.count,
        );
      }
    }
  });
}
