/**
 * The browser's copy of a person's chats (IndexedDB), so Chats opens at once
 * with what was there last time and then catches up. Every entry carries
 * the account it belongs to; the whole store is deleted when the session
 * ends (`forgetAccountBrowserState`). Kept here, apart from the chat
 * service, so signing out can delete it without loading chat code.
 */

export const CHAT_CACHE_DB = "veolms-chat-cache";
const STORE = "entries";

let opening: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  opening ??= new Promise((resolve) => {
    try {
      const request = indexedDB.open(CHAT_CACHE_DB, 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore(STORE);
      };
      request.onsuccess = () => {
        const db = request.result;
        // Another tab deleting the store (sign-out) closes ours.
        db.onversionchange = () => {
          db.close();
          opening = null;
        };
        resolve(db);
      };
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return opening;
}

export async function chatCacheGet<T>(key: string): Promise<T | undefined> {
  const db = await openDb();
  if (!db) return undefined;
  return new Promise((resolve) => {
    try {
      const request = db.transaction(STORE).objectStore(STORE).get(key);
      request.onsuccess = () => resolve(request.result as T | undefined);
      request.onerror = () => resolve(undefined);
    } catch {
      resolve(undefined);
    }
  });
}

export async function chatCacheGetMany<T>(
  keys: readonly string[],
): Promise<Array<T | undefined>> {
  const db = await openDb();
  if (!db || keys.length === 0) return keys.map(() => undefined);
  return new Promise((resolve) => {
    try {
      const store = db.transaction(STORE).objectStore(STORE);
      const out: Array<T | undefined> = new Array(keys.length);
      let left = keys.length;
      keys.forEach((key, index) => {
        const request = store.get(key);
        request.onsuccess = () => {
          out[index] = request.result as T | undefined;
          if (--left === 0) resolve(out);
        };
        request.onerror = () => {
          if (--left === 0) resolve(out);
        };
      });
    } catch {
      resolve(keys.map(() => undefined));
    }
  });
}

export async function chatCacheSetMany(
  entries: ReadonlyArray<readonly [string, unknown]>,
  removals: readonly string[] = [],
): Promise<void> {
  const db = await openDb();
  if (!db) return;
  try {
    const store = db.transaction(STORE, "readwrite").objectStore(STORE);
    for (const [key, value] of entries) store.put(value, key);
    for (const key of removals) store.delete(key);
  } catch {
    // A full or unavailable store only means the next visit loads normally.
  }
}

/** Sign-out: every account's copy goes. */
export function forgetChatCache(): void {
  if (typeof indexedDB === "undefined") return;
  try {
    opening = null;
    indexedDB.deleteDatabase(CHAT_CACHE_DB);
  } catch {
    // Unavailable storage holds nothing to forget.
  }
}
