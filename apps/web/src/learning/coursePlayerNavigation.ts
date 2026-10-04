import { getLessonSlug, resolveLessonIdentifier } from "./courseContent";
import { clearLearningReturnLocation } from "./learningReturnLocation";

type CoursePlayerStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export interface CoursePlayerSession {
  courseId: string;
  lessonId: number;
  path: string;
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
const INTERNAL_URL_ORIGIN = "https://procodrr.local";
// Lesson links used to say where the player was opened from. That now lives
// in the learning return location, so these are only tolerated on old links
// and stored sessions, and are dropped when the path is rebuilt.
const LEGACY_LAUNCH_CONTEXT_PARAMS = ["from", "returnTo"] as const;
const LEGACY_COURSE_PLAYER_STORAGE_KEYS = [
  "veolms-resume-course-player-home",
  "veolms-resume-course-player-courses",
  "veolms-resume-course-player-my-learning",
  "veolms-resume-course-player-wishlist",
] as const;

const getBrowserStorage = (): CoursePlayerStorage | null => {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
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
    if (
      lessonId === null ||
      pathUrl.searchParams.size > 5 ||
      [...pathUrl.searchParams.keys()].some(
        (key) =>
          !LEGACY_LAUNCH_CONTEXT_PARAMS.some((legacy) => legacy === key) &&
          key !== "thread" &&
          key !== "noteId" &&
          key !== "view",
      )
    )
      return null;

    const threadId = getCoursePlayerThread(pathUrl.search);
    const noteId = getCoursePlayerNote(pathUrl.search);
    if (threadId && noteId) return null;
    const view = getCoursePlayerView(pathUrl.search);

    return {
      courseId: candidate.courseId,
      lessonId,
      path: getCoursePlayerPath(candidate.courseId, lessonId, {
        threadId,
        noteId,
        view,
      }),
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

export function getCoursePlayerThread(search: string): string | null {
  const thread = new URLSearchParams(search).get("thread");
  const normalized = thread?.trim();
  return normalized && !normalized.startsWith("client-") ? normalized : null;
}

export function getCoursePlayerNote(search: string): string | null {
  const note = new URLSearchParams(search).get("noteId");
  const normalized = note?.trim();
  return normalized && !normalized.startsWith("client-") ? normalized : null;
}

export function getCoursePlayerView(
  search: string,
): "video" | "quiz" | undefined {
  return new URLSearchParams(search).get("view") === "quiz"
    ? "quiz"
    : undefined;
}

export interface CoursePlayerPathOptions {
  threadId?: string | null;
  noteId?: string | null;
  view?: "video" | "quiz";
}

/**
 * Builds the address of a lesson. It carries only what identifies the lesson
 * view itself; the page the player was opened from is kept in the learning
 * return location, not in the URL.
 */
export function getCoursePlayerPath(
  courseId: string,
  lessonIdentifier: string | number = 1,
  options?: CoursePlayerPathOptions,
): string {
  const lessonId = resolveLessonIdentifier(lessonIdentifier) ?? 1;
  const search = new URLSearchParams();
  const threadId = options?.threadId?.trim();
  const noteId = options?.noteId?.trim();
  if (noteId && !noteId.startsWith("client-")) {
    search.set("noteId", noteId);
  } else if (threadId && !threadId.startsWith("client-")) {
    search.set("thread", threadId);
  }
  if (options?.view === "quiz") search.set("view", "quiz");
  const query = search.toString();
  return `/learn/${encodeURIComponent(courseId)}/${getLessonSlug(lessonId)}${query ? `?${query}` : ""}`;
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
 * This prevents one course from appearing twice in the session list.
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

  const previousSearch = new URL(previousSession.path, INTERNAL_URL_ORIGIN)
    .search;
  const migratedSession: CoursePlayerSession = {
    ...previousSession,
    courseId: nextCourseId,
    path: getCoursePlayerPath(nextCourseId, previousSession.lessonId, {
      threadId: getCoursePlayerThread(previousSearch),
      noteId: getCoursePlayerNote(previousSearch),
      view: getCoursePlayerView(previousSearch),
    }),
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
  const lessonId = resolveLessonIdentifier(lessonIdentifier) ?? 1;
  const noteId = getCoursePlayerNote(search);
  const threadId = noteId ? null : getCoursePlayerThread(search);
  const view = getCoursePlayerView(search);
  const path = getCoursePlayerPath(courseId, lessonId, {
    threadId,
    noteId,
    view,
  });
  const session: CoursePlayerSession = {
    courseId,
    lessonId,
    path,
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
  // The page behind the player belongs to the account that opened it.
  clearLearningReturnLocation();
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
          avatar: "/static/sofia-avatar-160.webp",
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
