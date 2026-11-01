import { useSyncExternalStore } from "react";
import { courseMatchesWishlist, type Course } from "./catalogue";

/**
 * The wishlist a visitor who is not signed in keeps in this browser. A
 * signed-in learner's wishlist is on the server (see `../wishlist`); what
 * this browser had saved for them is sent there once, on their first
 * signed-in load.
 */
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
  try {
    const serialized = localStorage.getItem(WISHLIST_STORAGE_KEY) || "[]";
    return buildSnapshotFromSerialized(serialized);
  } catch {
    // Storage may be unavailable in private mode.
    return EMPTY_WISHLIST;
  }
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

/** The courses saved in this browser by a visitor who is not signed in. */
export function useBrowserWishlistIds(): ReadonlySet<string> {
  return useSyncExternalStore(
    subscribeToWishlist,
    readWishlistIds,
    () => EMPTY_WISHLIST,
  );
}

/**
 * Before wishlists were kept on the server, a signed-in account's list was
 * kept here, in an entry of its own. It is read once more, to send it to the
 * server, and not used after that; `importedKey` records that it was sent.
 */
const accountListKey = (userId: string) => `${WISHLIST_STORAGE_KEY}-${userId}`;
const importedKey = (userId: string) =>
  `${WISHLIST_STORAGE_KEY}-imported-${userId}`;

function readStoredList(key: string): string[] {
  try {
    return parseWishlistIds(JSON.parse(localStorage.getItem(key) || "[]"));
  } catch {
    return [];
  }
}

/**
 * What this browser holds that the account's server wishlist may not have:
 * the account's own list from before (until it has been sent once), and
 * whatever was saved here while signed out, which goes to the account that
 * signs in, as it always has. Each entry is a course id or slug.
 */
export function readBrowserWishlistToImport(userId: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    const accountList =
      localStorage.getItem(importedKey(userId)) === null
        ? readStoredList(accountListKey(userId))
        : [];
    return [
      ...new Set([...accountList, ...readStoredList(WISHLIST_STORAGE_KEY)]),
    ];
  } catch {
    // Storage may be unavailable in private mode.
    return [];
  }
}

/**
 * Called once the server has the entries. The account's old entry is left
 * where it is and never read again. The signed-out list is emptied: it was
 * moved to this account, so the next account does not receive it as well.
 */
export function markBrowserWishlistImported(
  userId: string,
  sent: readonly string[],
) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(importedKey(userId), new Date().toISOString());
    // Keep anything saved signed out, in another tab, since it was read.
    const sentEntries = new Set(sent);
    writeWishlistIds(
      [...readWishlistIds()].filter((entry) => !sentEntries.has(entry)),
    );
  } catch {
    // Storage may be unavailable in private mode.
  }
}
