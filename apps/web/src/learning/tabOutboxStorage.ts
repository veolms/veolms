/**
 * Keeps what one tab has yet to send to the server in local storage, so it
 * outlives the tab: a crash, or a phone that closes the browser without
 * warning, would otherwise lose it, as the progress batches now go out once
 * a minute rather than every few seconds.
 *
 * Each tab writes under its own key. A tab that starts later takes over a
 * key nobody has written for `ORPHANED_AFTER_MS` (its tab is gone) and sends
 * what it holds; a key still being written belongs to a live tab and is left
 * alone, so two open tabs never send the same seconds twice.
 */

/** Long enough that a live tab, retrying a failing batch, keeps its key. */
const ORPHANED_AFTER_MS = 10 * 60_000;
/** Additions are written at most this often; what is taken, at once. */
const WRITE_DELAY_MS = 2_000;

interface StoredOutbox<T> {
  updatedAt: number;
  value: T;
}

function getStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

const tabId =
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

export interface TabOutboxStorage<T> {
  /** What tabs that are gone left unsent, removed from storage as read. */
  adoptOrphans(): T[];
  /** Writes now; null (nothing left to send) removes this tab's key. */
  save(value: T | null): void;
  /** Writes within `WRITE_DELAY_MS`, reading the value when it does. */
  saveSoon(read: () => T | null): void;
}

export function createTabOutboxStorage<T>(name: string): TabOutboxStorage<T> {
  const prefix = `veolms:${name}:`;
  const ownKey = `${prefix}${tabId}`;
  let pendingRead: (() => T | null) | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;

  function save(value: T | null) {
    pendingRead = null;
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
    const storage = getStorage();
    if (!storage) return;
    try {
      if (value === null) {
        storage.removeItem(ownKey);
      } else {
        const stored: StoredOutbox<T> = { updatedAt: Date.now(), value };
        storage.setItem(ownKey, JSON.stringify(stored));
      }
    } catch {
      // Storage full or refused: the outbox still lives in memory.
    }
  }

  return {
    adoptOrphans() {
      const storage = getStorage();
      if (!storage) return [];
      const adopted: T[] = [];
      const now = Date.now();
      try {
        const keys: string[] = [];
        for (let index = 0; index < storage.length; index += 1) {
          const key = storage.key(index);
          if (key?.startsWith(prefix) && key !== ownKey) keys.push(key);
        }
        for (const key of keys) {
          const raw = storage.getItem(key);
          let stored: StoredOutbox<T> | null = null;
          try {
            stored = raw ? (JSON.parse(raw) as StoredOutbox<T>) : null;
          } catch {
            stored = null;
          }
          if (stored && now - stored.updatedAt < ORPHANED_AFTER_MS) continue;
          // Removed before it is used: a second tab starting at the same
          // moment then finds nothing to take.
          storage.removeItem(key);
          if (stored?.value !== undefined) adopted.push(stored.value);
        }
      } catch {
        return adopted;
      }
      return adopted;
    },
    save,
    saveSoon(read) {
      pendingRead = read;
      if (timer !== undefined) return;
      timer = setTimeout(() => {
        timer = undefined;
        const next = pendingRead;
        pendingRead = null;
        if (next) save(next());
      }, WRITE_DELAY_MS);
    },
  };
}
