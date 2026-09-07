import { getAutosyncDraftKey, getAutosyncKey } from "./keys";
import type { AutosyncKey } from "./types";

const DRAFT_VERSION = 1;
const INDEXED_DB_NAME = "veolms-autosync";
const INDEXED_DB_STORE = "key-value";
const LARGE_VALUE_BYTES = 128 * 1024;

interface DraftEnvelope<TValue> {
  version: number;
  updatedAt: number;
  value: TValue;
}

interface IndexedDbRecord {
  key: string;
  value: string;
}

interface AsyncStorage<TStorageValue = string> {
  getItem: (
    key: string,
  ) =>
    | TStorageValue
    | null
    | undefined
    | Promise<TStorageValue | null | undefined>;
  setItem: (key: string, value: TStorageValue) => unknown | Promise<unknown>;
  removeItem: (key: string) => void | Promise<void>;
}

const canUseLocalStorage = () =>
  typeof window !== "undefined" && typeof window.localStorage !== "undefined";

const readLocal = (key: string): string | null => {
  if (!canUseLocalStorage()) return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
};

const writeLocal = (key: string, value: string): boolean => {
  if (!canUseLocalStorage()) return false;
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
};

const removeLocal = (key: string) => {
  if (!canUseLocalStorage()) return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Local storage can be unavailable in privacy-restricted contexts.
  }
};

let indexedDbPromise: Promise<IDBDatabase | null> | null = null;

const openIndexedDb = (): Promise<IDBDatabase | null> => {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  if (indexedDbPromise) return indexedDbPromise;

  indexedDbPromise = new Promise((resolve) => {
    try {
      const request = indexedDB.open(INDEXED_DB_NAME, 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore(INDEXED_DB_STORE, { keyPath: "key" });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });

  return indexedDbPromise;
};

const readIndexedDb = async (key: string): Promise<string | null> => {
  const database = await openIndexedDb();
  if (!database) return null;

  return new Promise((resolve) => {
    try {
      const request = database
        .transaction(INDEXED_DB_STORE, "readonly")
        .objectStore(INDEXED_DB_STORE)
        .get(key);
      request.onsuccess = () =>
        resolve((request.result as IndexedDbRecord | undefined)?.value ?? null);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
};

const writeIndexedDb = async (key: string, value: string): Promise<boolean> => {
  const database = await openIndexedDb();
  if (!database) return false;

  return new Promise<boolean>((resolve) => {
    try {
      const request = database
        .transaction(INDEXED_DB_STORE, "readwrite")
        .objectStore(INDEXED_DB_STORE)
        .put({ key, value } satisfies IndexedDbRecord);
      request.onsuccess = () => resolve(true);
      request.onerror = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
};

const removeIndexedDb = async (key: string): Promise<void> => {
  const database = await openIndexedDb();
  if (!database) return;

  await new Promise<void>((resolve) => {
    try {
      const request = database
        .transaction(INDEXED_DB_STORE, "readwrite")
        .objectStore(INDEXED_DB_STORE)
        .delete(key);
      request.onsuccess = () => resolve();
      request.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
};

const parseDraft = <TValue>(
  serialized: string | null,
): DraftEnvelope<TValue> | null => {
  if (!serialized) return null;
  try {
    const parsed: unknown = JSON.parse(serialized);
    if (typeof parsed !== "object" || parsed === null) return null;
    const envelope = parsed as Partial<DraftEnvelope<TValue>>;
    if (
      envelope.version !== DRAFT_VERSION ||
      typeof envelope.updatedAt !== "number" ||
      !("value" in envelope)
    )
      return null;
    return envelope as DraftEnvelope<TValue>;
  } catch {
    return null;
  }
};

export const saveAutosyncDraft = <TValue>(
  key: AutosyncKey,
  value: TValue,
): void => {
  const storageKey = getAutosyncDraftKey(key);
  let serialized: string;
  try {
    serialized = JSON.stringify({
      version: DRAFT_VERSION,
      updatedAt: Date.now(),
      value,
    } satisfies DraftEnvelope<TValue>);
  } catch {
    return;
  }

  // Ordinary drafts use the synchronous crash-safety path. Large drafts go
  // straight to IndexedDB so rich content does not consume localStorage
  // quota; localStorage remains a fallback if IndexedDB is unavailable.
  if (serialized.length > LARGE_VALUE_BYTES) {
    removeLocal(storageKey);
    void writeIndexedDb(storageKey, serialized).then((savedInIndexedDb) => {
      if (!savedInIndexedDb) writeLocal(storageKey, serialized);
    });
    return;
  }

  if (!writeLocal(storageKey, serialized)) {
    void writeIndexedDb(storageKey, serialized);
  }
};

export const readAutosyncDraft = async <TValue>(
  key: AutosyncKey,
): Promise<DraftEnvelope<TValue> | null> => {
  const storageKey = getAutosyncDraftKey(key);
  const localDraft = readAutosyncDraftSync<TValue>(key);
  if (localDraft) return localDraft;
  return parseDraft<TValue>(await readIndexedDb(storageKey));
};

export const readAutosyncDraftSync = <TValue>(
  key: AutosyncKey,
): DraftEnvelope<TValue> | null =>
  parseDraft<TValue>(readLocal(getAutosyncDraftKey(key)));

export const removeAutosyncDraft = (key: AutosyncKey): void => {
  const storageKey = getAutosyncDraftKey(key);
  removeLocal(storageKey);
  void removeIndexedDb(storageKey);
};

const queryCacheStorage: AsyncStorage<string> = {
  getItem: async (key) => readLocal(key) ?? (await readIndexedDb(key)),
  setItem: async (key, value) => {
    // Query persistence can contain rich text and paused mutation variables;
    // keep large state in IndexedDB and use localStorage only as a fallback.
    if (value.length > LARGE_VALUE_BYTES) {
      removeLocal(key);
      const savedInIndexedDb = await writeIndexedDb(key, value);
      if (!savedInIndexedDb) writeLocal(key, value);
      return;
    }
    if (!writeLocal(key, value)) {
      await writeIndexedDb(key, value);
    }
  },
  removeItem: async (key) => {
    removeLocal(key);
    await removeIndexedDb(key);
  },
};

export const autosyncQueryCacheStorage = queryCacheStorage;

export const getAutosyncStorageDebugKey = (key: AutosyncKey) =>
  `${getAutosyncKey(key)} -> ${getAutosyncDraftKey(key)}`;
