import { useCallback, useSyncExternalStore } from "react";
import { courseMatchesWishlist, type Course } from "./catalogue";

export const WISHLIST_STORAGE_KEY = "veolms-wishlist";

const WISHLIST_CHANGE_EVENT = "veolms-wishlist-change";
const EMPTY_WISHLIST = new Set<string>();

let cachedSerialized = "";
let cachedSnapshot: ReadonlySet<string> = EMPTY_WISHLIST;

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
  const serialized = localStorage.getItem(WISHLIST_STORAGE_KEY) || "[]";
  return buildSnapshotFromSerialized(serialized);
}

export function writeWishlistIds(ids: Iterable<string>) {
  if (typeof window === "undefined") return;
  try {
    const serialized = JSON.stringify([...ids]);
    if (serialized === cachedSerialized) return;
    localStorage.setItem(WISHLIST_STORAGE_KEY, serialized);
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
    if (event.key === WISHLIST_STORAGE_KEY) onStoreChange();
  };

  window.addEventListener(WISHLIST_CHANGE_EVENT, onLocalChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(WISHLIST_CHANGE_EVENT, onLocalChange);
    window.removeEventListener("storage", onStorage);
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
