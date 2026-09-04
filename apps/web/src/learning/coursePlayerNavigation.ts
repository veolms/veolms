import type { LearningSpaceSession } from "@veolms/contracts";
import { getLessonSlug, resolveLessonIdentifier } from "./courseContent";

export type CoursePlayerOrigin = "home" | "courses" | "wishlist";

type LegacyCoursePlayerOrigin =
  "explore-courses" | "my-courses" | "my-learning";

type CoursePlayerStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export interface CoursePlayerSession {
  courseId: string;
  lessonId: number;
  origin: CoursePlayerOrigin;
  path: string;
  returnPath: string;
  updatedAt: number;
  courseTitle?: string;
  lessonTitle?: string | null;
}

export interface PendingCourseCommentDraft {
  courseId: string;
  lessonId: number;
  text: string;
  draftStorageKey: string;
  commentsStorageKey: string;
}

export const COURSE_PLAYER_SESSIONS_STORAGE_KEY =
  "veolms-open-course-player-sessions";
export const COURSE_PLAYER_SESSION_CHANGE_EVENT =
  "veolms-course-player-session-change";

const LEGACY_COURSE_PLAYER_SESSION_STORAGE_KEY = "veolms-active-course-player";
const DEFAULT_COURSE_PLAYER_ORIGIN: CoursePlayerOrigin = "courses";
const INTERNAL_URL_ORIGIN = "https://procodrr.local";
const LEGACY_COURSE_PLAYER_STORAGE_KEYS = [
  "veolms-resume-course-player-home",
  "veolms-resume-course-player-courses",
  "veolms-resume-course-player-my-learning",
  "veolms-resume-course-player-wishlist",
] as const;

const COURSE_PLAYER_PARENT_PATHS: Record<CoursePlayerOrigin, string> = {
  home: "/",
  courses: "/courses",
  wishlist: "/wishlist",
};

const COURSE_PLAYER_BACK_LABELS: Record<CoursePlayerOrigin, string> = {
  home: "Return to Home",
  courses: "Return to Courses",
  wishlist: "Return to Wishlist",
};

const COURSE_PLAYER_ORIGINS_BY_PATH: Readonly<
  Record<string, CoursePlayerOrigin>
> = {
  "/": "home",
  "/home": "home",
  "/courses": "courses",
  "/wishlist": "wishlist",
};

const isCoursePlayerOrigin = (value: unknown): value is CoursePlayerOrigin =>
  value === "home" || value === "courses" || value === "wishlist";

const normalizeCoursePlayerOrigin = (
  value: unknown,
): CoursePlayerOrigin | null => {
  if (isCoursePlayerOrigin(value)) return value;
  if (
    value === "explore-courses" ||
    value === "my-courses" ||
    value === "my-learning"
  )
    return "courses";
  return null;
};

const getBrowserStorage = (): CoursePlayerStorage | null => {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

const normalizePathname = (pathname: string) =>
  pathname.replace(/\/+$/, "") || "/";

const getCoursePlayerOriginForPath = (
  path: string,
): CoursePlayerOrigin | null => {
  try {
    const url = new URL(path, INTERNAL_URL_ORIGIN);
    if (url.origin !== INTERNAL_URL_ORIGIN) return null;
    return (
      COURSE_PLAYER_ORIGINS_BY_PATH[normalizePathname(url.pathname)] ?? null
    );
  } catch {
    return null;
  }
};

const normalizeInternalReturnPath = (
  value: unknown,
  fallback: string,
): string => {
  if (typeof value !== "string") return fallback;
  const candidate = value.trim();
  if (
    !candidate.startsWith("/") ||
    candidate.startsWith("//") ||
    candidate.includes("\\") ||
    /^[a-z][a-z\d+.-]*:/i.test(candidate)
  )
    return fallback;

  try {
    const url = new URL(candidate, INTERNAL_URL_ORIGIN);
    if (url.origin !== INTERNAL_URL_ORIGIN) return fallback;
    const decodedPathname = decodeURIComponent(url.pathname);
    if (
      decodedPathname.includes("\\") ||
      /^\/+learn(?:\/|$)/i.test(decodedPathname)
    )
      return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
};

const notifyCoursePlayerSessionChange = () => {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(COURSE_PLAYER_SESSION_CHANGE_EVENT));
};

const removeLegacyCoursePlayerDestinations = (
  storage: CoursePlayerStorage,
): boolean => {
  let didRemoveDestination = false;
  for (const key of LEGACY_COURSE_PLAYER_STORAGE_KEYS) {
    if (storage.getItem(key) === null) continue;
    storage.removeItem(key);
    didRemoveDestination = true;
  }
  return didRemoveDestination;
};

const parseCoursePlayerSessionCandidate = (
  value: unknown,
): CoursePlayerSession | null => {
  try {
    if (!value || typeof value !== "object") return null;
    const candidate = value as Partial<CoursePlayerSession>;
    if (
      typeof candidate.courseId !== "string" ||
      !candidate.courseId ||
      typeof candidate.path !== "string" ||
      typeof candidate.updatedAt !== "number" ||
      !Number.isFinite(candidate.updatedAt)
    )
      return null;

    const pathUrl = new URL(candidate.path, INTERNAL_URL_ORIGIN);
    if (pathUrl.origin !== INTERNAL_URL_ORIGIN || pathUrl.hash) return null;
    const pathParts = pathUrl.pathname.split("/").filter(Boolean);
    if (pathParts.length !== 3 || pathParts[0] !== "learn") return null;
    if (decodeURIComponent(pathParts[1] || "") !== candidate.courseId)
      return null;

    const lessonId = resolveLessonIdentifier(pathParts[2]);
    const pathOrigin = normalizeCoursePlayerOrigin(
      pathUrl.searchParams.get("from"),
    );
    const candidateOrigin = normalizeCoursePlayerOrigin(candidate.origin);
    const origin = candidateOrigin ?? pathOrigin;
    if (
      lessonId === null ||
      !origin ||
      !pathOrigin ||
      pathOrigin !== origin ||
      pathUrl.searchParams.size > 2 ||
      [...pathUrl.searchParams.keys()].some(
        (key) => key !== "from" && key !== "returnTo",
      )
    )
      return null;

    const fallbackReturnPath = COURSE_PLAYER_PARENT_PATHS[origin];
    const returnPath = normalizeInternalReturnPath(
      candidate.returnPath ?? pathUrl.searchParams.get("returnTo"),
      fallbackReturnPath,
    );

    return {
      courseId: candidate.courseId,
      lessonId,
      origin,
      path: getCoursePlayerPath(
        candidate.courseId,
        origin,
        lessonId,
        returnPath,
      ),
      returnPath,
      updatedAt: candidate.updatedAt,
    };
  } catch {
    return null;
  }
};

const parseStoredCoursePlayerSession = (
  value: string | null,
): CoursePlayerSession | null => {
  if (!value) return null;
  try {
    return parseCoursePlayerSessionCandidate(JSON.parse(value));
  } catch {
    return null;
  }
};

interface CoursePlayerSessionState {
  sessions: CoursePlayerSession[];
}

const writeSessionCollectionWithoutNotification = (
  storage: CoursePlayerStorage,
  sessions: readonly CoursePlayerSession[],
) => {
  if (sessions.length > 0) {
    storage.setItem(
      COURSE_PLAYER_SESSIONS_STORAGE_KEY,
      JSON.stringify(sessions),
    );
  } else {
    storage.removeItem(COURSE_PLAYER_SESSIONS_STORAGE_KEY);
  }
};

const readCoursePlayerSessionState = (
  storage: CoursePlayerStorage | null,
): CoursePlayerSessionState => {
  const state: CoursePlayerSessionState = { sessions: [] };
  if (!storage) return state;

  try {
    const storedSessions = storage.getItem(COURSE_PLAYER_SESSIONS_STORAGE_KEY);
    let collectionNeedsWrite = false;
    if (storedSessions !== null) {
      try {
        const parsedCollection: unknown = JSON.parse(storedSessions);
        if (!Array.isArray(parsedCollection)) {
          collectionNeedsWrite = true;
        } else {
          for (const value of parsedCollection) {
            const session = parseCoursePlayerSessionCandidate(value);
            if (!session) {
              collectionNeedsWrite = true;
              continue;
            }
            const existingIndex = state.sessions.findIndex(
              ({ courseId }) => courseId === session.courseId,
            );
            if (existingIndex === -1) state.sessions.push(session);
            else {
              state.sessions[existingIndex] = session;
              collectionNeedsWrite = true;
            }
          }
          if (storedSessions !== JSON.stringify(state.sessions))
            collectionNeedsWrite = true;
        }
      } catch {
        collectionNeedsWrite = true;
      }
    }

    const storedLegacySingleton = storage.getItem(
      LEGACY_COURSE_PLAYER_SESSION_STORAGE_KEY,
    );
    const legacySingleton = parseStoredCoursePlayerSession(
      storedLegacySingleton,
    );
    if (storedLegacySingleton !== null) {
      storage.removeItem(LEGACY_COURSE_PLAYER_SESSION_STORAGE_KEY);
      collectionNeedsWrite = true;
    }
    if (legacySingleton) {
      const existingIndex = state.sessions.findIndex(
        ({ courseId }) => courseId === legacySingleton.courseId,
      );
      if (existingIndex === -1) {
        state.sessions.push(legacySingleton);
      } else if (
        legacySingleton.updatedAt >
        (state.sessions[existingIndex]?.updatedAt ?? -Infinity)
      ) {
        state.sessions[existingIndex] = legacySingleton;
      }
      collectionNeedsWrite = true;
    }

    if (removeLegacyCoursePlayerDestinations(storage))
      collectionNeedsWrite = true;
    if (collectionNeedsWrite)
      writeSessionCollectionWithoutNotification(storage, state.sessions);
  } catch {
    // A partial or unavailable store should not block normal navigation.
  }

  return state;
};

const persistCoursePlayerSessions = (
  sessions: readonly CoursePlayerSession[],
  storage: CoursePlayerStorage | null,
) => {
  if (!storage) return;
  let didWrite = false;
  try {
    writeSessionCollectionWithoutNotification(storage, sessions);
    removeLegacyCoursePlayerDestinations(storage);
    didWrite = true;
  } catch {
    // Session persistence is best-effort when storage is unavailable.
  }
  if (didWrite) notifyCoursePlayerSessionChange();
};

export function getCoursePlayerOrigin(search: string): CoursePlayerOrigin {
  const origin = new URLSearchParams(search).get("from");
  return normalizeCoursePlayerOrigin(origin) ?? DEFAULT_COURSE_PLAYER_ORIGIN;
}

export function getCoursePlayerOriginFromPathname(
  pathname: string,
): CoursePlayerOrigin {
  return getCoursePlayerOriginForPath(pathname) ?? DEFAULT_COURSE_PLAYER_ORIGIN;
}

export function getCoursePlayerParentPath(origin: CoursePlayerOrigin): string {
  return COURSE_PLAYER_PARENT_PATHS[origin];
}

export function getCoursePlayerReturnPath(search: string): string {
  const origin = getCoursePlayerOrigin(search);
  return normalizeInternalReturnPath(
    new URLSearchParams(search).get("returnTo"),
    COURSE_PLAYER_PARENT_PATHS[origin],
  );
}

export function getCoursePlayerPath(
  courseId: string,
  origin: CoursePlayerOrigin | LegacyCoursePlayerOrigin,
  lessonIdentifier: string | number = 1,
  returnPath?: string,
): string {
  const normalizedOrigin =
    normalizeCoursePlayerOrigin(origin) ?? DEFAULT_COURSE_PLAYER_ORIGIN;
  const lessonId = resolveLessonIdentifier(lessonIdentifier) ?? 1;
  const fallbackReturnPath = COURSE_PLAYER_PARENT_PATHS[normalizedOrigin];
  const normalizedReturnPath = normalizeInternalReturnPath(
    returnPath,
    fallbackReturnPath,
  );
  const search = new URLSearchParams({ from: normalizedOrigin });
  if (normalizedReturnPath !== fallbackReturnPath)
    search.set("returnTo", normalizedReturnPath);
  return `/learn/${encodeURIComponent(courseId)}/${getLessonSlug(lessonId)}?${search.toString()}`;
}

export function getCoursePlayerLaunchPath(
  courseId: string,
  sourcePath: string,
  lessonIdentifier: string | number = getStoredCourseLessonId(courseId),
): string {
  const returnPath = normalizeInternalReturnPath(sourcePath, "/courses");
  const origin = getCoursePlayerOriginFromPathname(returnPath);
  return getCoursePlayerPath(courseId, origin, lessonIdentifier, returnPath);
}

export function getStoredCourseLessonId(
  courseId: string,
  storage: CoursePlayerStorage | null = getBrowserStorage(),
): number {
  try {
    const courseKey = encodeURIComponent(courseId);
    const savedLesson =
      storage?.getItem(`veolms-last-lesson-${courseKey}`) ?? 1;
    return resolveLessonIdentifier(savedLesson) ?? 1;
  } catch {
    return 1;
  }
}

export function getOpenCoursePlayerSessions(
  storage: CoursePlayerStorage | null = getBrowserStorage(),
): CoursePlayerSession[] {
  return readCoursePlayerSessionState(storage).sessions;
}

/**
 * Adapts the server's canonical UUID-based session to the existing player
 * route model, which intentionally uses readable course slugs and numeric
 * lesson positions in the URL.
 */
export function mapLearningSpaceSessionToCoursePlayerSession(
  session: LearningSpaceSession,
): CoursePlayerSession {
  const lessonId = session.lessonNumber ?? 1;
  const updatedAt = Date.parse(session.updatedAt);
  const returnPath =
    session.returnPath || getCoursePlayerParentPath(session.origin);
  return {
    courseId: session.courseSlug,
    lessonId,
    origin: session.origin,
    path: getCoursePlayerPath(
      session.courseSlug,
      session.origin,
      lessonId,
      returnPath,
    ),
    returnPath,
    updatedAt: Number.isFinite(updatedAt) ? updatedAt : Date.now(),
    courseTitle: session.courseTitle,
    lessonTitle: session.lessonTitle,
  };
}

export function getMostRecentCoursePlayerSession(
  sessions: readonly CoursePlayerSession[] = getOpenCoursePlayerSessions(),
): CoursePlayerSession | null {
  return sessions.reduce<CoursePlayerSession | null>(
    (mostRecent, session) =>
      !mostRecent || session.updatedAt > mostRecent.updatedAt
        ? session
        : mostRecent,
    null,
  );
}

export function getCoursePlayerSession(
  courseId: string,
  storage: CoursePlayerStorage | null = getBrowserStorage(),
): CoursePlayerSession | null {
  return (
    readCoursePlayerSessionState(storage).sessions.find(
      (session) => session.courseId === courseId,
    ) ?? null
  );
}

/**
 * Re-key a legacy UUID session after its canonical public slug is known.
 * This prevents one course from appearing twice in the learning-space list.
 */
export function migrateCoursePlayerSessionKey(
  previousCourseId: string,
  nextCourseId: string,
  storage: CoursePlayerStorage | null = getBrowserStorage(),
): void {
  if (previousCourseId === nextCourseId) return;

  const state = readCoursePlayerSessionState(storage);
  const previousSession = state.sessions.find(
    (session) => session.courseId === previousCourseId,
  );
  if (!previousSession) return;

  const migratedSession: CoursePlayerSession = {
    ...previousSession,
    courseId: nextCourseId,
    path: getCoursePlayerPath(
      nextCourseId,
      previousSession.origin,
      previousSession.lessonId,
      previousSession.returnPath,
    ),
    updatedAt: Date.now(),
  };
  const remainingSessions = state.sessions.filter(
    (session) =>
      session.courseId !== previousCourseId &&
      session.courseId !== nextCourseId,
  );
  remainingSessions.push(migratedSession);
  persistCoursePlayerSessions(remainingSessions, storage);
}

export function upsertCoursePlayerSessionFromRoute(
  courseId: string,
  search: string,
  lessonIdentifier: string | number = getStoredCourseLessonId(courseId),
  storage: CoursePlayerStorage | null = getBrowserStorage(),
): string {
  const state = readCoursePlayerSessionState(storage);
  const existingIndex = state.sessions.findIndex(
    (openSession) => openSession.courseId === courseId,
  );
  const existingSession =
    existingIndex === -1 ? null : (state.sessions[existingIndex] ?? null);
  const searchParams = new URLSearchParams(search);
  const hasLaunchContext =
    searchParams.has("from") || searchParams.has("returnTo");
  const origin =
    !hasLaunchContext && existingSession
      ? existingSession.origin
      : getCoursePlayerOrigin(search);
  const lessonId = resolveLessonIdentifier(lessonIdentifier) ?? 1;
  const returnPath =
    !hasLaunchContext && existingSession
      ? existingSession.returnPath
      : getCoursePlayerReturnPath(search);
  const path = getCoursePlayerPath(courseId, origin, lessonId, returnPath);
  const session: CoursePlayerSession = {
    courseId,
    lessonId,
    origin,
    path,
    returnPath,
    updatedAt: Date.now(),
  };
  if (existingIndex === -1) state.sessions.push(session);
  else state.sessions[existingIndex] = session;
  persistCoursePlayerSessions(state.sessions, storage);
  return path;
}

export function activateCoursePlayerSession(
  courseId: string,
  storage: CoursePlayerStorage | null = getBrowserStorage(),
): string | null {
  const state = readCoursePlayerSessionState(storage);
  const sessionIndex = state.sessions.findIndex(
    (session) => session.courseId === courseId,
  );
  if (sessionIndex === -1) return null;

  const session = state.sessions[sessionIndex];
  if (!session) return null;
  const activatedSession: CoursePlayerSession = {
    ...session,
    updatedAt: Date.now(),
  };
  state.sessions[sessionIndex] = activatedSession;
  persistCoursePlayerSessions(state.sessions, storage);
  return activatedSession.path;
}

export function closeCoursePlayerSession(
  courseId: string,
  storage: CoursePlayerStorage | null = getBrowserStorage(),
): CoursePlayerSession | null {
  const state = readCoursePlayerSessionState(storage);
  if (!state.sessions.some((session) => session.courseId === courseId)) {
    return getMostRecentCoursePlayerSession(state.sessions);
  }

  const remainingSessions = state.sessions.filter(
    (session) => session.courseId !== courseId,
  );
  persistCoursePlayerSessions(remainingSessions, storage);
  return getMostRecentCoursePlayerSession(remainingSessions);
}

/**
 * Explicitly remove the browser fallback when an account signs out. Server
 * sessions are account-scoped, so retaining this legacy global collection
 * across logout could make another account see the previous user's courses.
 */
export function clearCoursePlayerSessions(
  storage: CoursePlayerStorage | null = getBrowserStorage(),
): void {
  if (!storage) return;
  try {
    storage.removeItem(COURSE_PLAYER_SESSIONS_STORAGE_KEY);
    storage.removeItem(LEGACY_COURSE_PLAYER_SESSION_STORAGE_KEY);
    removeLegacyCoursePlayerDestinations(storage);
    notifyCoursePlayerSessionChange();
  } catch {
    // Storage is an optional fallback and may be unavailable in private mode.
  }
}

export function getCoursePlayerBackLabel(
  source: CoursePlayerOrigin | string,
): string {
  if (isCoursePlayerOrigin(source)) return COURSE_PLAYER_BACK_LABELS[source];
  const returnPath = normalizeInternalReturnPath(source, "/courses");
  const pathname = normalizePathname(
    new URL(returnPath, INTERNAL_URL_ORIGIN).pathname,
  );
  if (/^\/courses\/[^/]+\/overview$/.test(pathname))
    return "Return to Course Overview";
  const origin = getCoursePlayerOriginForPath(pathname);
  return origin
    ? COURSE_PLAYER_BACK_LABELS[origin]
    : "Return to the previous page";
}

export function getPendingCourseCommentDraft(
  session: CoursePlayerSession,
  draftStorage: CoursePlayerStorage | null = typeof window === "undefined"
    ? null
    : window.sessionStorage,
  progressStorage: CoursePlayerStorage | null = getBrowserStorage(),
): PendingCourseCommentDraft | null {
  try {
    const courseKey = encodeURIComponent(session.courseId);
    const lessonId =
      resolveLessonIdentifier(session.lessonId) ??
      getStoredCourseLessonId(session.courseId, progressStorage);
    const storageBase = `veolms-learning-${courseKey}-lesson-${lessonId}-discussion`;
    const draftStorageKey = `${storageBase}-comment-draft`;
    const storedDraft = draftStorage?.getItem(draftStorageKey);
    if (!storedDraft) return null;
    let text = storedDraft;
    try {
      const parsedDraft: unknown = JSON.parse(storedDraft);
      if (typeof parsedDraft === "string") text = parsedDraft;
    } catch {
      // Accept plain-string drafts written by earlier builds.
    }
    text = text.trim();
    if (!text) return null;
    return {
      courseId: session.courseId,
      lessonId,
      text,
      draftStorageKey,
      commentsStorageKey: `${storageBase}-posted-comments`,
    };
  } catch {
    return null;
  }
}

export function discardPendingCourseCommentDraft(
  draft: PendingCourseCommentDraft,
  storage: CoursePlayerStorage | null = typeof window === "undefined"
    ? null
    : window.sessionStorage,
) {
  try {
    storage?.removeItem(draft.draftStorageKey);
  } catch {
    // Replacing the learning session can continue if storage is unavailable.
  }
}

export function postPendingCourseCommentDraft(
  draft: PendingCourseCommentDraft,
  storage: CoursePlayerStorage | null = typeof window === "undefined"
    ? null
    : window.sessionStorage,
) {
  try {
    const stored: unknown = JSON.parse(
      storage?.getItem(draft.commentsStorageKey) || "[]",
    );
    const comments = Array.isArray(stored) ? stored : [];
    storage?.setItem(
      draft.commentsStorageKey,
      JSON.stringify([
        {
          id: Date.now(),
          name: "Sofia Chen",
          time: "Just now",
          avatar: "/assets/sofia-avatar-160.webp",
          text: draft.text,
          likes: 0,
        },
        ...comments,
      ]),
    );
    storage?.removeItem(draft.draftStorageKey);
  } catch {
    // The caller still owns the pending switch and can offer a retry.
  }
}
