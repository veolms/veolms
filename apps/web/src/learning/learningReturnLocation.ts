/**
 * The page the learner was on before the lesson player took over the screen.
 * Minimizing the player goes back to it, at the scroll position it was left
 * at, and the shell keeps its navigation item highlighted meanwhile.
 *
 * The value lives in memory and is mirrored to localStorage, so a reload of
 * the lesson page still knows where the player was opened from.
 */
export interface LearningReturnLocation {
  path: string;
  left: number;
  top: number;
  /** Navigation section that was highlighted on that page. */
  section: string | null;
}

export interface LearningReturnLocationUpdate {
  path: string;
  left?: number;
  top?: number;
  section?: string | null;
}

type ReturnLocationStorage = Pick<
  Storage,
  "getItem" | "setItem" | "removeItem"
>;

const LEARNING_RETURN_LOCATION_STORAGE_KEY = "veolms-learning-return-location";
const INTERNAL_URL_ORIGIN = "https://procodrr.local";
const DEFAULT_LEARNING_RETURN_LOCATION: LearningReturnLocation = {
  path: "/courses",
  left: 0,
  top: 0,
  section: null,
};

const listeners = new Set<() => void>();
let currentLocation: LearningReturnLocation | undefined;

const getBrowserStorage = (): ReturnLocationStorage | null => {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

/**
 * Accepts only a same-origin application path that is not itself a lesson
 * page; anything else would send the learner somewhere unexpected.
 */
const normalizeReturnPath = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const candidate = value.trim();
  if (
    !candidate.startsWith("/") ||
    candidate.startsWith("//") ||
    candidate.includes("\\") ||
    /^[a-z][a-z\d+.-]*:/i.test(candidate)
  )
    return null;

  try {
    const url = new URL(candidate, INTERNAL_URL_ORIGIN);
    if (url.origin !== INTERNAL_URL_ORIGIN) return null;
    const decodedPathname = decodeURIComponent(url.pathname);
    if (
      decodedPathname.includes("\\") ||
      /^\/+learn(?:\/|$)/i.test(decodedPathname)
    )
      return null;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
};

const normalizeScrollOffset = (value: unknown): number =>
  typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;

const readStoredLocation = (
  storage: ReturnLocationStorage | null,
): LearningReturnLocation => {
  try {
    const stored = storage?.getItem(LEARNING_RETURN_LOCATION_STORAGE_KEY);
    if (!stored) return DEFAULT_LEARNING_RETURN_LOCATION;
    const candidate = JSON.parse(stored) as Partial<LearningReturnLocation>;
    const path = normalizeReturnPath(candidate?.path);
    if (!path) return DEFAULT_LEARNING_RETURN_LOCATION;
    return {
      path,
      left: normalizeScrollOffset(candidate.left),
      top: normalizeScrollOffset(candidate.top),
      section: typeof candidate.section === "string" ? candidate.section : null,
    };
  } catch {
    return DEFAULT_LEARNING_RETURN_LOCATION;
  }
};

const emitChange = () => {
  for (const listener of listeners) listener();
};

export const subscribeToLearningReturnLocation = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const getLearningReturnLocation = (): LearningReturnLocation => {
  currentLocation ??= readStoredLocation(getBrowserStorage());
  return currentLocation;
};

export const getLearningReturnLocationServerSnapshot =
  (): LearningReturnLocation => DEFAULT_LEARNING_RETURN_LOCATION;

/**
 * Records the page behind the player. A new path starts from the top with no
 * section; updating the same path keeps whatever is not passed again, so the
 * scroll position and the section can be reported at different moments.
 */
export function rememberLearningReturnLocation(
  update: LearningReturnLocationUpdate,
): void {
  const path = normalizeReturnPath(update.path);
  if (!path) return;

  const previous = getLearningReturnLocation();
  const base: LearningReturnLocation =
    previous.path === path
      ? previous
      : { path, left: 0, top: 0, section: null };
  const next: LearningReturnLocation = {
    path,
    left:
      update.left === undefined
        ? base.left
        : normalizeScrollOffset(update.left),
    top:
      update.top === undefined ? base.top : normalizeScrollOffset(update.top),
    section: update.section === undefined ? base.section : update.section,
  };
  if (
    next.path === previous.path &&
    next.left === previous.left &&
    next.top === previous.top &&
    next.section === previous.section
  )
    return;

  currentLocation = next;
  try {
    getBrowserStorage()?.setItem(
      LEARNING_RETURN_LOCATION_STORAGE_KEY,
      JSON.stringify(next),
    );
  } catch {
    // The in-memory location still serves this tab when storage is blocked.
  }
  emitChange();
}

export function clearLearningReturnLocation(): void {
  currentLocation = DEFAULT_LEARNING_RETURN_LOCATION;
  try {
    getBrowserStorage()?.removeItem(LEARNING_RETURN_LOCATION_STORAGE_KEY);
  } catch {
    // Nothing remains to clear when storage is unavailable.
  }
  emitChange();
}
