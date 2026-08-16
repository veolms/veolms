import { getLessonSlug, resolveLessonIdentifier } from "./courseContent";

export type CoursePlayerOrigin =
  "home" | "explore-courses" | "my-courses" | "wishlist";

type LegacyCoursePlayerOrigin = "courses" | "my-learning";

type CoursePlayerStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export interface CoursePlayerSession {
  courseId: string;
  lessonId: number;
  origin: CoursePlayerOrigin;
  path: string;
  updatedAt: number;
}

export interface PendingCourseCommentDraft {
  courseId: string;
  lessonId: number;
  text: string;
  draftStorageKey: string;
  commentsStorageKey: string;
}

export const COURSE_PLAYER_SESSION_STORAGE_KEY = "veolms-active-course-player";
export const COURSE_PLAYER_SESSION_CHANGE_EVENT =
  "veolms-course-player-session-change";

const DEFAULT_COURSE_PLAYER_ORIGIN: CoursePlayerOrigin = "explore-courses";
const LEGACY_COURSE_PLAYER_STORAGE_KEYS = [
  "veolms-resume-course-player-home",
  "veolms-resume-course-player-courses",
  "veolms-resume-course-player-my-learning",
  "veolms-resume-course-player-wishlist",
] as const;

const COURSE_PLAYER_PARENT_PATHS: Record<CoursePlayerOrigin, string> = {
  home: "/",
  "explore-courses": "/explore-courses",
  "my-courses": "/my-courses",
  wishlist: "/wishlist",
};

const COURSE_PLAYER_SECTIONS: Record<CoursePlayerOrigin, string> = {
  home: "Home",
  "explore-courses": "Explore Courses",
  "my-courses": "My Courses",
  wishlist: "Wishlist",
};

const COURSE_PLAYER_BACK_LABELS: Record<CoursePlayerOrigin, string> = {
  home: "Return to Home",
  "explore-courses": "Return to Explore Courses",
  "my-courses": "Return to My Courses",
  wishlist: "Return to Wishlist",
};

const COURSE_PLAYER_ORIGINS_BY_PATH: Readonly<
  Record<string, CoursePlayerOrigin>
> = {
  "/": "home",
  "/home": "home",
  "/my-courses": "my-courses",
  "/my-learning": "my-courses",
  "/explore-courses": "explore-courses",
  "/courses": "explore-courses",
  "/wishlist": "wishlist",
};

const isCoursePlayerOrigin = (value: unknown): value is CoursePlayerOrigin =>
  value === "home" ||
  value === "explore-courses" ||
  value === "my-courses" ||
  value === "wishlist";

const normalizeCoursePlayerOrigin = (
  value: unknown,
): CoursePlayerOrigin | null => {
  if (isCoursePlayerOrigin(value)) return value;
  if (value === "courses") return "explore-courses";
  if (value === "my-learning") return "my-courses";
  return null;
};

const getLegacyCoursePlayerOrigin = (
  origin: CoursePlayerOrigin,
): LegacyCoursePlayerOrigin | null => {
  if (origin === "explore-courses") return "courses";
  if (origin === "my-courses") return "my-learning";
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

const getCoursePlayerOriginForPath = (
  pathname: string,
): CoursePlayerOrigin | null => {
  const normalizedPathname = pathname.replace(/\/+$/, "") || "/";
  return COURSE_PLAYER_ORIGINS_BY_PATH[normalizedPathname] ?? null;
};

const notifyCoursePlayerSessionChange = () => {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(COURSE_PLAYER_SESSION_CHANGE_EVENT));
};

const removeLegacyCoursePlayerDestinations = (
  storage: CoursePlayerStorage | null,
) => {
  for (const key of LEGACY_COURSE_PLAYER_STORAGE_KEYS) storage?.removeItem(key);
};

const isCoursePlayerPathForOrigin = (
  path: string,
  origin: CoursePlayerOrigin,
) => {
  if (!path.startsWith("/") || path.startsWith("//")) return false;
  try {
    const url = new URL(path, "https://procodrr.local");
    const pathParts = url.pathname.split("/").filter(Boolean);
    return (
      url.origin === "https://procodrr.local" &&
      pathParts.length === 3 &&
      pathParts[0] === "learn" &&
      Boolean(pathParts[1]) &&
      Boolean(pathParts[2]) &&
      url.searchParams.size === 1 &&
      normalizeCoursePlayerOrigin(url.searchParams.get("from")) === origin &&
      !url.hash
    );
  } catch {
    return false;
  }
};

const parseCoursePlayerSession = (
  value: string | null | undefined,
): CoursePlayerSession | null => {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object") return null;
    const candidate = parsed as Partial<CoursePlayerSession>;
    const pathUrl = new URL(candidate.path || "", "https://procodrr.local");
    const pathParts = pathUrl.pathname.split("/").filter(Boolean);
    const lessonId = resolveLessonIdentifier(pathParts[2]);
    const origin = normalizeCoursePlayerOrigin(candidate.origin);
    if (
      typeof candidate.courseId !== "string" ||
      !candidate.courseId ||
      lessonId === null ||
      !origin ||
      typeof candidate.path !== "string" ||
      !isCoursePlayerPathForOrigin(candidate.path, origin) ||
      typeof candidate.updatedAt !== "number" ||
      !Number.isFinite(candidate.updatedAt)
    )
      return null;
    const canonicalPath = getCoursePlayerPath(
      candidate.courseId,
      origin,
      lessonId,
    );
    const legacyOrigin = getLegacyCoursePlayerOrigin(origin);
    const legacyPath = legacyOrigin
      ? getCoursePlayerPath(candidate.courseId, legacyOrigin, lessonId)
      : null;
    if (candidate.path !== canonicalPath && candidate.path !== legacyPath)
      return null;
    return {
      courseId: candidate.courseId,
      lessonId,
      origin,
      path: canonicalPath,
      updatedAt: candidate.updatedAt,
    };
  } catch {
    return null;
  }
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

export function getCoursePlayerPath(
  courseId: string,
  origin: CoursePlayerOrigin | LegacyCoursePlayerOrigin,
  lessonIdentifier: string | number = 1,
): string {
  const lessonId = resolveLessonIdentifier(lessonIdentifier) ?? 1;
  return `/learn/${encodeURIComponent(courseId)}/${getLessonSlug(lessonId)}?from=${origin}`;
}

export function getStoredCourseLessonId(
  courseId: string,
  storage: CoursePlayerStorage | null = getBrowserStorage(),
): number {
  try {
    const courseKey = encodeURIComponent(courseId);
    const savedLesson =
      storage?.getItem(`veolms-last-lesson-${courseKey}`) ??
      storage?.getItem("veolms-last-lesson") ??
      1;
    return resolveLessonIdentifier(savedLesson) ?? 1;
  } catch {
    return 1;
  }
}

export function getActiveCoursePlayerSession(
  storage: CoursePlayerStorage | null = getBrowserStorage(),
): CoursePlayerSession | null {
  try {
    const storedSession = storage?.getItem(COURSE_PLAYER_SESSION_STORAGE_KEY);
    const session = parseCoursePlayerSession(storedSession);
    if (session) {
      const canonicalSession = JSON.stringify(session);
      if (storedSession !== canonicalSession) {
        storage?.setItem(COURSE_PLAYER_SESSION_STORAGE_KEY, canonicalSession);
      }
      return session;
    }
    storage?.removeItem(COURSE_PLAYER_SESSION_STORAGE_KEY);
    removeLegacyCoursePlayerDestinations(storage);
  } catch {
    // A missing session simply sends navigation to its normal destination.
  }
  return null;
}

export function rememberCoursePlayerDestination(
  courseId: string,
  origin: CoursePlayerOrigin,
  lessonIdentifier: string | number = getStoredCourseLessonId(courseId),
  storage: CoursePlayerStorage | null = getBrowserStorage(),
): string {
  const lessonId = resolveLessonIdentifier(lessonIdentifier) ?? 1;
  const path = getCoursePlayerPath(courseId, origin, lessonId);
  const session: CoursePlayerSession = {
    courseId,
    lessonId,
    origin,
    path,
    updatedAt: Date.now(),
  };
  try {
    storage?.setItem(
      COURSE_PLAYER_SESSION_STORAGE_KEY,
      JSON.stringify(session),
    );
    removeLegacyCoursePlayerDestinations(storage);
    notifyCoursePlayerSessionChange();
  } catch {
    // Navigation remains available when browser storage is unavailable.
  }
  return path;
}

export function getRememberedCoursePlayerDestination(
  origin: CoursePlayerOrigin,
  storage: CoursePlayerStorage | null = getBrowserStorage(),
): string | null {
  const session = getActiveCoursePlayerSession(storage);
  return session?.origin === origin ? session.path : null;
}

export function clearRememberedCoursePlayerDestination(
  origin: CoursePlayerOrigin,
  storage: CoursePlayerStorage | null = getBrowserStorage(),
) {
  try {
    const session = getActiveCoursePlayerSession(storage);
    if (session?.origin !== origin) return;
    storage?.removeItem(COURSE_PLAYER_SESSION_STORAGE_KEY);
    notifyCoursePlayerSessionChange();
  } catch {
    // Clearing a resume route is best-effort when storage is unavailable.
  }
}

export function getResumableCoursePlayerNavigationPath(
  path: string,
  storage: CoursePlayerStorage | null = getBrowserStorage(),
): string {
  const origin = getCoursePlayerOriginForPath(path);
  return origin
    ? getRememberedCoursePlayerDestination(origin, storage) || path
    : path;
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
          avatar: "/assets/sofia-avatar.jpg",
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

export function getCoursePlayerParentPath(origin: CoursePlayerOrigin): string {
  return COURSE_PLAYER_PARENT_PATHS[origin];
}

export function getCoursePlayerSection(origin: CoursePlayerOrigin): string {
  return COURSE_PLAYER_SECTIONS[origin];
}

export function getCoursePlayerBackLabel(origin: CoursePlayerOrigin): string {
  return COURSE_PLAYER_BACK_LABELS[origin];
}

export function getCoursePlayerOriginFromSection(
  section: string,
): CoursePlayerOrigin | null {
  const origin = Object.entries(COURSE_PLAYER_SECTIONS).find(
    ([, label]) => label === section,
  )?.[0];
  if (!origin || !isCoursePlayerOrigin(origin)) return null;
  return origin;
}
