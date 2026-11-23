/**
 * Chat photos and videos kept on this device, so a photo or video opened
 * once opens again without downloading it (and with no connection).
 *
 * A chat file's address is the API's `/chat/uploads/:id`, which answers
 * with a redirect to a signed storage link. The link changes every six
 * hours and storage sends no caching headers, so the browser's own cache
 * held nothing useful for a later visit, and a video (read in byte ranges)
 * was downloaded again on every view.
 *
 * Here the file is kept in the page's Cache Storage under its upload id,
 * never under the link. Which files are kept, their size and when each was
 * last opened is listed in IndexedDB; past the device's budget the files
 * opened longest ago go first, never one on screen. Everything is deleted
 * when the session ends (`forgetAccountBrowserState`, through
 * lib/chatMediaCacheForget.ts): the files are private to the account. Kept
 * here, apart from the chat code, so Settings can reach it without loading
 * Chats.
 *
 * Nothing here may break a photo or video: every failure (no storage in a
 * private window, a full disk, a busy database) answers "not kept", and
 * the caller shows the file from the network as before.
 */

import {
  announceChatMediaCleared,
  CHAT_MEDIA_CACHE_NAME as CACHE_NAME,
  CHAT_MEDIA_CHANNEL as CHANNEL_NAME,
  CHAT_MEDIA_DB_NAME as DB_NAME,
} from "./chatMediaCacheForget";

export type ChatMediaKind = "image" | "video" | "poster";

interface ChatMediaRecord {
  /** `<kind>:<upload id>`. */
  key: string;
  kind: ChatMediaKind;
  bytes: number;
  savedAt: number;
  usedAt: number;
}

const STORE = "items";
/** Cache Storage keys are addresses; these are never requested. */
const KEY_BASE = "https://chat-media.veolms.invalid/";

const MB = 1024 * 1024;
const GB = 1024 * MB;
/** A share of the browser's storage quota, held between device bounds. */
const QUOTA_SHARE = 0.05;
const BOUNDS = {
  // Safari and every iPhone browser: small quotas, and a file played from
  // the cache is read into memory, so a flat, smaller amount.
  apple: { min: 300 * MB, max: 300 * MB },
  android: { min: 500 * MB, max: 1 * GB },
  desktop: { min: 1 * GB, max: 2 * GB },
} as const;
/** No single file takes more than this share of the budget… */
const ITEM_SHARE = 0.25;
/** …or more than this. */
const ITEM_MAX_BYTES = 300 * MB;
/** Room always left free for lesson downloads and the rest of the site. */
const FREE_SPACE_RESERVE_BYTES = 1 * GB;
const FREE_SPACE_RESERVE_SHARE = 0.2;
/** How long a lookup may take before the network is used instead. */
const LOOKUP_LIMIT_MS = 1_500;
/** Reading a whole video (Safari copies it into memory) may take longer. */
const VIDEO_READ_LIMIT_MS = 5_000;
const ESTIMATE_MAX_AGE_MS = 30_000;
const TRIM_DELAY_MS = 3_000;

const available = () =>
  typeof window !== "undefined" &&
  typeof window.caches !== "undefined" &&
  typeof indexedDB !== "undefined" &&
  window.isSecureContext;

/** Whether this browser can keep chat media at all. */
export function canKeepChatMedia(): boolean {
  return available();
}

export const chatMediaKey = (kind: ChatMediaKind, uploadId: string) =>
  `${kind}:${uploadId}`;
const cacheAddress = (key: string) => `${KEY_BASE}${key.replace(":", "/")}`;

function withinLimit<T>(
  promise: Promise<T>,
  limitMs = LOOKUP_LIMIT_MS,
): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), limitMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(null);
      },
    );
  });
}

// ---------------------------------------------------------------------------
// Storage handles
// ---------------------------------------------------------------------------

let cachePromise: Promise<Cache> | null = null;
/**
 * Goes up each time the cache is emptied. A file still arriving from an
 * earlier session (signed out meanwhile) is then not listed.
 */
let generation = 0;
const openCache = () => (cachePromise ??= window.caches.open(CACHE_NAME));

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (!available()) return Promise.resolve(null);
  dbPromise ??= new Promise((resolve) => {
    try {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore(STORE, { keyPath: "key" });
      };
      request.onsuccess = () => {
        const db = request.result;
        // Another tab deleting the list (sign-out, Clear) closes ours.
        db.onversionchange = () => {
          db.close();
          dbPromise = null;
        };
        resolve(db);
      };
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

function run<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T> | void,
): Promise<T | undefined> {
  return openDb().then(
    (db) =>
      new Promise<T | undefined>((resolve) => {
        if (!db) return resolve(undefined);
        try {
          const transaction = db.transaction(STORE, mode);
          const request = action(transaction.objectStore(STORE));
          transaction.oncomplete = () => resolve(request?.result);
          transaction.onerror = () => resolve(undefined);
          transaction.onabort = () => resolve(undefined);
        } catch {
          resolve(undefined);
        }
      }),
  );
}

const listRecords = async () =>
  (await run<ChatMediaRecord[]>("readonly", (store) => store.getAll())) ?? [];
const putRecord = (record: ChatMediaRecord) =>
  run("readwrite", (store) => void store.put(record));
const deleteRecords = (keys: readonly string[]) =>
  run("readwrite", (store) => {
    for (const key of keys) store.delete(key);
  });

// ---------------------------------------------------------------------------
// Other tabs
// ---------------------------------------------------------------------------

let channel: BroadcastChannel | null = null;
const clearListeners = new Set<() => void>();

/** The cache was emptied here or elsewhere: nothing open is used again. */
function emptied() {
  generation += 1;
  reconciled = false;
  cachePromise = null;
  touched.clear();
  for (const listener of clearListeners) listener();
}

function openChannel(): BroadcastChannel | null {
  if (channel || typeof BroadcastChannel === "undefined") return channel;
  try {
    channel = new BroadcastChannel(CHANNEL_NAME);
    channel.onmessage = (event: MessageEvent<unknown>) => {
      // Settings or a sign-out, in this tab or another.
      if (event.data === "cleared") emptied();
    };
  } catch {
    channel = null;
  }
  return channel;
}

/** Called when the cache is emptied here or in another tab. */
export function onChatMediaCleared(listener: () => void): () => void {
  openChannel();
  clearListeners.add(listener);
  return () => clearListeners.delete(listener);
}

// ---------------------------------------------------------------------------
// Budget
// ---------------------------------------------------------------------------

function deviceClass(): keyof typeof BOUNDS {
  const agent = typeof navigator === "undefined" ? "" : navigator.userAgent;
  if (/iphone|ipad|ipod/i.test(agent)) return "apple";
  if (/safari/i.test(agent) && !/chrome|chromium|android/i.test(agent)) {
    return "apple";
  }
  return /android/i.test(agent) ? "android" : "desktop";
}

interface Estimate {
  usage: number;
  quota: number;
  at: number;
}

let estimate: Promise<Estimate | null> | null = null;
let estimateAt = 0;

/** The browser's storage estimate, read again at most every 30 s. */
function readEstimate(): Promise<Estimate | null> {
  if (estimate && Date.now() - estimateAt < ESTIMATE_MAX_AGE_MS) {
    return estimate;
  }
  estimateAt = Date.now();
  estimate = (async () => {
    try {
      const result = await navigator.storage?.estimate?.();
      if (!result?.quota) return null;
      return { usage: result.usage ?? 0, quota: result.quota, at: Date.now() };
    } catch {
      return null;
    }
  })();
  return estimate;
}

/** The most chat media this device keeps, in bytes. */
export async function resolveChatMediaBudget(): Promise<number> {
  const bounds = BOUNDS[deviceClass()];
  const current = await readEstimate();
  const share = current ? current.quota * QUOTA_SHARE : bounds.min;
  return Math.round(Math.min(bounds.max, Math.max(bounds.min, share)));
}

/** The largest single file kept (a longer video is played as before). */
export async function chatMediaItemLimit(): Promise<number> {
  return Math.min(
    ITEM_MAX_BYTES,
    Math.round((await resolveChatMediaBudget()) * ITEM_SHARE),
  );
}

/** Whether `bytes` more fit without eating the room left for others. */
async function hasRoomFor(bytes: number): Promise<boolean> {
  const current = await readEstimate();
  if (!current) return true;
  const reserve = Math.min(
    FREE_SPACE_RESERVE_BYTES,
    current.quota * FREE_SPACE_RESERVE_SHARE,
  );
  return current.usage + bytes <= current.quota - reserve;
}

// ---------------------------------------------------------------------------
// Eviction
// ---------------------------------------------------------------------------

/** Files on screen (or being kept) now: never evicted. */
const held = new Map<string, number>();

/** Marks a file as in use until the returned function is called. */
export function holdChatMedia(key: string): () => void {
  held.set(key, (held.get(key) ?? 0) + 1);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const count = (held.get(key) ?? 1) - 1;
    if (count > 0) held.set(key, count);
    else held.delete(key);
  };
}

/** Deletes the files opened longest ago until at most `limit` bytes stay. */
async function evictTo(limit: number): Promise<void> {
  const records = await listRecords();
  let total = records.reduce((sum, record) => sum + (record.bytes || 0), 0);
  if (total <= limit) return;
  const cache = await openCache();
  const gone: string[] = [];
  for (const record of records
    .filter((item) => !held.has(item.key))
    .sort((left, right) => left.usedAt - right.usedAt)) {
    if (total <= limit) break;
    total -= record.bytes || 0;
    gone.push(record.key);
  }
  if (gone.length === 0) return;
  // The list first: a file without its entry is fetched again, an entry
  // without its file would be counted for nothing.
  await deleteRecords(gone);
  await Promise.all(
    gone.map((key) => cache.delete(cacheAddress(key)).catch(() => false)),
  );
}

let reconciled = false;
/** Keys being written now (kept before they are listed). */
const writing = new Set<string>();

/**
 * Once per page: files kept without an entry (the tab closed between the
 * two writes) and entries without their file are removed, so the total
 * shown in Settings is what the disk holds.
 */
async function reconcile(): Promise<void> {
  if (reconciled) return;
  reconciled = true;
  const cache = await openCache();
  const [requests, records] = await Promise.all([cache.keys(), listRecords()]);
  const listed = new Set(records.map((record) => cacheAddress(record.key)));
  const stored = new Set(requests.map((request) => request.url));
  await Promise.all(
    requests
      .filter(
        (request) =>
          !listed.has(request.url) &&
          ![...writing].some((key) => cacheAddress(key) === request.url),
      )
      .map((request) => cache.delete(request).catch(() => false)),
  );
  const missing = records
    .filter(
      (record) =>
        !stored.has(cacheAddress(record.key)) && !writing.has(record.key),
    )
    .map((record) => record.key);
  if (missing.length > 0) await deleteRecords(missing);
}

let trimTimer: ReturnType<typeof setTimeout> | null = null;

/** Brings the cache under its budget a little later, off the way of a file. */
function scheduleTrim() {
  if (trimTimer) return;
  trimTimer = setTimeout(() => {
    trimTimer = null;
    const runTrim = () =>
      void reconcile()
        .then(resolveChatMediaBudget)
        .then(evictTo)
        .catch(() => undefined);
    if (typeof requestIdleCallback === "function") {
      requestIdleCallback(runTrim, { timeout: 10_000 });
    } else {
      runTrim();
    }
  }, TRIM_DELAY_MS);
}

// ---------------------------------------------------------------------------
// Reading and keeping
// ---------------------------------------------------------------------------

/** Files whose "last opened" time was already saved during this page. */
const touched = new Set<string>();

function noteUsed(key: string, blob: Blob) {
  if (touched.has(key)) return;
  touched.add(key);
  void putRecord({
    key,
    kind: key.split(":")[0] as ChatMediaKind,
    bytes: blob.size,
    savedAt: Date.now(),
    usedAt: Date.now(),
  }).catch(() => undefined);
}

/** A kept file, or null (not kept, or the storage did not answer in time). */
export async function readChatMedia(
  kind: ChatMediaKind,
  uploadId: string,
): Promise<Blob | null> {
  if (!available()) return null;
  openChannel();
  const key = chatMediaKey(kind, uploadId);
  try {
    const hit = await withinLimit(
      openCache().then((cache) => cache.match(cacheAddress(key))),
    );
    if (!hit) return null;
    const blob = await withinLimit(
      hit.blob(),
      kind === "video" ? VIDEO_READ_LIMIT_MS : LOOKUP_LIMIT_MS,
    );
    if (!blob || blob.size === 0) return null;
    noteUsed(key, blob);
    scheduleTrim();
    return blob;
  } catch {
    return null;
  }
}

/** Removes one kept file (it could not be shown). */
export async function dropChatMedia(
  kind: ChatMediaKind,
  uploadId: string,
): Promise<void> {
  if (!available()) return;
  const key = chatMediaKey(kind, uploadId);
  touched.delete(key);
  await deleteRecords([key]);
  await openCache()
    .then((cache) => cache.delete(cacheAddress(key)))
    .catch(() => false);
}

class TooLargeError extends Error {}

/** Counts a body's bytes as it passes, failing past `limit`. */
function countBytes(
  body: ReadableStream<Uint8Array>,
  limit: number,
  counted: { bytes: number },
): ReadableStream<Uint8Array> {
  return body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        counted.bytes += chunk.byteLength;
        if (counted.bytes > limit) {
          controller.error(new TooLargeError());
          return;
        }
        controller.enqueue(chunk);
      },
    }),
  );
}

/**
 * Keeps a file: a blob already read (a photo), or a response read straight
 * into the cache without passing through the page's memory (a video).
 * Answers whether it was kept.
 */
export async function keepChatMedia(
  kind: ChatMediaKind,
  uploadId: string,
  body: Blob | Response,
  type: string,
): Promise<boolean> {
  if (!available()) return false;
  openChannel();
  const key = chatMediaKey(kind, uploadId);
  if (writing.has(key)) return false;
  const limit = await chatMediaItemLimit();
  const declared =
    body instanceof Blob
      ? body.size
      : Number(body.headers.get("content-length")) || 0;
  if (declared > limit || !(await hasRoomFor(declared))) {
    if (!(body instanceof Blob)) void body.body?.cancel().catch(() => {});
    return false;
  }
  const started = generation;
  writing.add(key);
  const release = holdChatMedia(key);
  const counted = { bytes: body instanceof Blob ? body.size : 0 };
  try {
    const content =
      body instanceof Blob
        ? body
        : body.body
          ? countBytes(body.body, limit, counted)
          : null;
    if (!content) return false;
    const cache = await openCache();
    await cache.put(
      cacheAddress(key),
      new Response(content, { headers: { "content-type": type } }),
    );
    // Emptied meanwhile (signed out, Clear): the write went to the cache
    // that was deleted, and nothing is listed.
    if (started !== generation) return false;
    if (counted.bytes === 0) {
      await cache.delete(cacheAddress(key));
      return false;
    }
    const now = Date.now();
    await putRecord({
      key,
      kind,
      bytes: counted.bytes,
      savedAt: now,
      usedAt: now,
    });
    touched.add(key);
    void estimate?.then((current) => {
      if (current) current.usage += counted.bytes;
    });
    scheduleTrim();
    return true;
  } catch (error) {
    // A full disk: make room for next time, keep nothing now.
    if ((error as { name?: string } | null)?.name === "QuotaExceededError") {
      void resolveChatMediaBudget()
        .then((budget) => evictTo(budget / 2))
        .catch(() => undefined);
    }
    void openCache()
      .then((cache) => cache.delete(cacheAddress(key)))
      .catch(() => false);
    return false;
  } finally {
    writing.delete(key);
    release();
  }
}

// ---------------------------------------------------------------------------
// Settings and sign-out
// ---------------------------------------------------------------------------

export interface ChatMediaUsage {
  bytes: number;
  photoBytes: number;
  /** Videos and their still pictures. */
  videoBytes: number;
  photos: number;
  videos: number;
}

/** What the cache holds now. */
export async function getChatMediaUsage(): Promise<ChatMediaUsage> {
  const usage: ChatMediaUsage = {
    bytes: 0,
    photoBytes: 0,
    videoBytes: 0,
    photos: 0,
    videos: 0,
  };
  if (!available()) return usage;
  for (const record of await listRecords()) {
    const bytes = record.bytes || 0;
    usage.bytes += bytes;
    if (record.kind === "image") {
      usage.photoBytes += bytes;
      usage.photos += 1;
    } else {
      usage.videoBytes += bytes;
      if (record.kind === "video") usage.videos += 1;
    }
  }
  return usage;
}

/** Settings' Clear: empties the cache here and in other open tabs. */
export async function clearChatMediaCache(): Promise<void> {
  if (!available()) return;
  emptied();
  const db = dbPromise;
  dbPromise = null;
  void db?.then((open) => open?.close());
  await Promise.all([
    window.caches.delete(CACHE_NAME).catch(() => false),
    new Promise<void>((resolve) => {
      try {
        const request = indexedDB.deleteDatabase(DB_NAME);
        request.onsuccess = () => resolve();
        request.onerror = () => resolve();
        request.onblocked = () => resolve();
      } catch {
        resolve();
      }
    }),
  ]);
  announceChatMediaCleared();
}
