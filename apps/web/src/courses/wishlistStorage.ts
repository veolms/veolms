import { useCallback, useSyncExternalStore } from "react";
import { authStore } from "../store/auth.store";
import { courseMatchesWishlist, type Course } from "./catalogue";

export const WISHLIST_STORAGE_KEY = "veolms-wishlist";

const WISHLIST_CHANGE_EVENT = "veolms-wishlist-change";
const EMPTY_WISHLIST = new Set<string>();

let cachedSerialized = "";
let cachedSnapshot: ReadonlySet<string> = EMPTY_WISHLIST;
let carriedOverStorageKey = "";

/**
 * The wishlist used to be one entry for the whole browser, so a second
 * account on the same browser saw the first one's saved courses. A signed-in
 * account now has its own entry; a guest keeps the original one.
 */
function getWishlistStorageKey(): string {
  const signedInUserId = authStore.getState().user?.id;
  // Before the session check answers, the identity hint still names the
  // account this tab was signed in to.
  const userId = signedInUserId ?? authStore.getIdentityHint()?.userId;
  if (!userId) {
    carriedOverStorageKey = "";
    return WISHLIST_STORAGE_KEY;
  }

  const storageKey = `${WISHLIST_STORAGE_KEY}-${userId}`;
  if (signedInUserId && carriedOverStorageKey !== storageKey) {
    carriedOverStorageKey = storageKey;
    try {
      // The first account to sign in takes over the browser-wide list saved
      // before wishlists were per account, or as a guest. It is moved, not
      // copied, so the next account does not receive it as well.
      const guestWishlist = localStorage.getItem(WISHLIST_STORAGE_KEY);
      if (guestWishlist !== null && localStorage.getItem(storageKey) === null) {
        localStorage.setItem(storageKey, guestWishlist);
        localStorage.removeItem(WISHLIST_STORAGE_KEY);
      }
    } catch {
      // Storage may be unavailable in private mode.
    }
  }
  return storageKey;
}

function parseWishlistIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (courseId): courseId is string =>
      typeof courseId === "string" && Boolean(courseId.trim()),
  );
}

function buildSnapshotFromSerialized(serialized: string): ReadonlySet<string> {
  if (serialized === cachedSerialized) return cachedSnapshot;
  cachedSerialized = serialized;
  try {
    const raw: unknown = JSON.parse(serialized);
    cachedSnapshot = new Set(parseWishlistIds(raw));
  } catch {
    cachedSnapshot = EMPTY_WISHLIST;
  }
  return cachedSnapshot;
}

export function readWishlistIds(): ReadonlySet<string> {
  if (typeof window === "undefined") return EMPTY_WISHLIST;
  const serialized = localStorage.getItem(getWishlistStorageKey()) || "[]";
  return buildSnapshotFromSerialized(serialized);
}

export function writeWishlistIds(ids: Iterable<string>) {
  if (typeof window === "undefined") return;
  try {
    const serialized = JSON.stringify([...ids]);
    if (serialized === cachedSerialized) return;
    localStorage.setItem(getWishlistStorageKey(), serialized);
    buildSnapshotFromSerialized(serialized);
    window.dispatchEvent(new Event(WISHLIST_CHANGE_EVENT));
  } catch {
    // Storage may be unavailable in private mode.
  }
}

export function toggleWishlistCourse(
  course: Pick<Course, "id" | "slug">,
): ReadonlySet<string> {
  const current = readWishlistIds();
  const next = new Set(current);
  const keys = [course.id, course.slug?.trim()].filter(Boolean) as string[];
  const isWishlisted = courseMatchesWishlist(course, current);

  if (isWishlisted) {
    for (const key of keys) next.delete(key);
  } else {
    next.add(course.id);
    const slug = course.slug?.trim();
    if (slug) next.add(slug);
  }

  writeWishlistIds(next);
  return readWishlistIds();
}

export function toggleWishlistId(courseId: string): ReadonlySet<string> {
  return toggleWishlistCourse({ id: courseId });
}

export function subscribeToWishlist(onStoreChange: () => void) {
  if (typeof window === "undefined") return () => undefined;

  const onLocalChange = () => onStoreChange();
  const onStorage = (event: StorageEvent) => {
    if (event.key?.startsWith(WISHLIST_STORAGE_KEY)) onStoreChange();
  };

  window.addEventListener(WISHLIST_CHANGE_EVENT, onLocalChange);
  window.addEventListener("storage", onStorage);
  // Signing in or out changes whose wishlist is shown.
  const unsubscribeFromAuth = authStore.subscribe(onStoreChange);
  return () => {
    window.removeEventListener(WISHLIST_CHANGE_EVENT, onLocalChange);
    window.removeEventListener("storage", onStorage);
    unsubscribeFromAuth();
  };
}

export function useWishlistIds(): ReadonlySet<string> {
  return useSyncExternalStore(
    subscribeToWishlist,
    readWishlistIds,
    () => EMPTY_WISHLIST,
  );
}

export function useCourseWishlisted(
  course: Pick<Course, "id" | "slug">,
): boolean {
  const wishlisted = useWishlistIds();
  return courseMatchesWishlist(course, wishlisted);
}

export function useToggleWishlistCourse() {
  return useCallback((course: Pick<Course, "id" | "slug">) => {
    toggleWishlistCourse(course);
  }, []);
}
