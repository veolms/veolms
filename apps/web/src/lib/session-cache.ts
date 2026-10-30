/**
 * Answers the API kept for the life of the tab, so a reload or a return to
 * the page does not ask again.
 *
 * Nothing here is cleared at login or logout by itself: a copy of one
 * account's data must carry the account in its key and be listed in
 * `isAccountSessionStorageKey` (as the enrolled courses are). It is read
 * after the first render (inside a query function or an effect), never
 * during it, so a prerendered page hydrates against the markup it was built
 * with.
 */

interface SessionCacheEntry<T> {
  value: T;
  savedAt: number;
}

const getSessionStorage = (): Storage | null => {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    // Storage can be unavailable in privacy-restricted contexts.
    return null;
  }
};

export function readSessionCache<T>(
  key: string,
  maxAgeMs: number,
  isValid: (value: unknown) => value is T,
): SessionCacheEntry<T> | undefined {
  try {
    const saved: unknown = JSON.parse(
      getSessionStorage()?.getItem(key) ?? "null",
    );
    if (!saved || typeof saved !== "object") return undefined;
    const { value, savedAt } = saved as Record<string, unknown>;
    if (typeof savedAt !== "number" || !isValid(value)) return undefined;
    const age = Date.now() - savedAt;
    // A clock that was set back would otherwise keep the copy for good.
    if (age < 0 || age > maxAgeMs) return undefined;
    return { value, savedAt };
  } catch {
    return undefined;
  }
}

/** `savedAt`: when the value was fetched, if not just now. */
export function writeSessionCache<T>(
  key: string,
  value: T,
  savedAt = Date.now(),
): void {
  try {
    getSessionStorage()?.setItem(
      key,
      JSON.stringify({
        value,
        savedAt,
      } satisfies SessionCacheEntry<T>),
    );
  } catch {
    // A full or unavailable store only means the next load asks again.
  }
}

export function clearSessionCache(key: string): void {
  try {
    getSessionStorage()?.removeItem(key);
  } catch {
    // Nothing was kept, so there is nothing to clear.
  }
}
