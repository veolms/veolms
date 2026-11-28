import { onShakaRuntimeLoaded } from "@veolms/video-player/shaka-runtime-hooks";
import {
  bytesShortForSegment,
  hasRoomForSegment,
  noteBytesFreed,
  noteSegmentKept,
  resolveSegmentCacheBudget,
} from "./segmentCacheBudget";
import {
  clearSegmentIndex,
  listLessonSegments,
  listLessons,
  openSegmentIndex,
  parseSegmentAddress,
  recordSegment,
  removeLesson,
  removeRendition,
  touchLesson,
  type LessonRow,
} from "./segmentCacheIndex";

/**
 * Lesson video segments kept in the browser, so a reload (or a return to a
 * lesson) plays what was already downloaded without asking the CDN again.
 *
 * The CDN lets the browser keep a segment for a year, but each page load is
 * given a new playback token and the token is part of every segment's
 * address (`?t=…`), so after a reload no address matched what the browser
 * held, and every segment was downloaded again. Here segments are kept in
 * the page's Cache Storage under their address without the token.
 *
 * It is done inside Shaka's fetch plugin, which every player's segment
 * requests go through (an extension's scheme plugin, such as the DRM one,
 * wraps the same function, which is why this runs before other runtime
 * hooks): a segment that is kept is answered from the cache, marked as such
 * so that it does not count towards the bandwidth estimate; any other is
 * fetched as before and kept. Answering from a scheme of our own does not
 * work: Shaka picks the plugin from the address before the request filters
 * run.
 *
 * The segments are encrypted (the keys come only with a licence), and the
 * same for everyone, so they are not tied to an account. Which are kept is
 * listed in IndexedDB by lesson (segmentCacheIndex.ts); past the device's
 * budget (segmentCacheBudget.ts) whole lessons go, least recently opened
 * first, never one in use.
 */

const CACHE_NAME = "veolms-video-segments-v1";
/** Query parameters that carry the playback token. */
const TOKEN_PARAMETERS = ["t", "veo_token"];
/** `shaka.net.NetworkingEngine.RequestType.SEGMENT`. */
const SEGMENT_REQUEST = 1;
/** The budget is checked at most this often while segments arrive. */
const TRIM_INTERVAL_MS = 5_000;
/** Tells other tabs the cache was emptied (their open `Cache` is stale). */
const CHANNEL_NAME = "veolms-video-segments";

const available = () =>
  typeof window !== "undefined" &&
  typeof window.caches !== "undefined" &&
  window.isSecureContext;

let cachePromise: Promise<Cache> | null = null;
const openCache = () => (cachePromise ??= window.caches.open(CACHE_NAME));

/** A segment's address without its token, or null when it is not one. */
function segmentCacheKey(uri: string): string | null {
  try {
    const url = new URL(uri);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    for (const name of TOKEN_PARAMETERS) url.searchParams.delete(name);
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

/** What the cache did since the page loaded (see `getSegmentCacheStats`). */
export interface SegmentCacheStats {
  hits: number;
  misses: number;
  bytesFromCache: number;
  bytesFromNetwork: number;
  /** Segments not kept, to leave the free-space reserve. */
  skippedForReserve: number;
  lessonsEvicted: number;
}

const stats: SegmentCacheStats = {
  hits: 0,
  misses: 0,
  bytesFromCache: 0,
  bytesFromNetwork: 0,
  skippedForReserve: 0,
  lessonsEvicted: 0,
};

/** A copy of the counts so far, for the playback summary. */
export function getSegmentCacheStats(): SegmentCacheStats {
  return { ...stats };
}

/** Lessons marked as opened during this page load. */
const touchedLessons = new Set<string>();
/**
 * Lessons whose segments were read or kept lately, here or in another tab
 * (which says so over the channel), and when: they are not evicted. More
 * than one can be in use at once (a preload of the next lesson, a second
 * tab), so it is not only the last one.
 */
const activeLessons = new Map<string, number>();
/** A lesson stays protected this long after its last segment. */
const ACTIVE_LESSON_MS = 5 * 60_000;
/** Another tab is told again at most this often per lesson. */
const ANNOUNCE_INTERVAL_MS = 60_000;
const announcedAt = new Map<string, number>();

function notePlaying(lessonKey: string) {
  const now = Date.now();
  activeLessons.set(lessonKey, now);
  if (now - (announcedAt.get(lessonKey) ?? 0) < ANNOUNCE_INTERVAL_MS) return;
  announcedAt.set(lessonKey, now);
  openChannel()?.postMessage({ playing: lessonKey });
}

function noteLessonUsed(lessonKey: string) {
  notePlaying(lessonKey);
  if (touchedLessons.has(lessonKey)) return;
  touchedLessons.add(lessonKey);
  void touchLesson(lessonKey);
}

let channel: BroadcastChannel | null = null;

function forgetOpenCache() {
  cachePromise = null;
  touchedLessons.clear();
}

function openChannel(): BroadcastChannel | null {
  if (channel || typeof BroadcastChannel === "undefined") return channel;
  channel = new BroadcastChannel(CHANNEL_NAME);
  channel.onmessage = (event: MessageEvent<unknown>) => {
    const data = event.data;
    if (data === "cleared") forgetOpenCache();
    else if (
      data &&
      typeof data === "object" &&
      typeof (data as { playing?: unknown }).playing === "string"
    ) {
      activeLessons.set((data as { playing: string }).playing, Date.now());
    }
  };
  return channel;
}

/** Whether a lesson's segments were read or kept lately (here or in another tab). */
function inUse(lessonKey: string, now = Date.now()): boolean {
  return now - (activeLessons.get(lessonKey) ?? 0) < ACTIVE_LESSON_MS;
}

const totalBytes = (lessons: readonly LessonRow[]) =>
  lessons.reduce((sum, lesson) => sum + (lesson.bytes || 0), 0);

/** A picture rendition (`360`, `720`); audio and the rest are kept. */
const isVideoRendition = (name: string) => /^\d+p?$/iu.test(name);

/**
 * Brings the cache down to at most `limit` bytes; returns the bytes let go.
 * Lessons in use, here or in another tab, are never touched. First to go
 * are the same minutes kept in another quality (a lesson watched at 360p,
 * then at 720p, holds both): of each lesson only the picture rendition kept
 * last stays. Then whole lessons, least recently opened first.
 */
async function evictTo(limit: number): Promise<number> {
  const lessons = await listLessons();
  const startTotal = totalBytes(lessons);
  let total = startTotal;
  if (total <= limit) return 0;
  const now = Date.now();
  const oldestFirst = lessons
    .filter((lesson) => !inUse(lesson.lessonKey, now))
    .sort((left, right) => left.usedAt - right.usedAt);
  const cache = await openCache();
  const deleteAll = (urls: readonly string[]) =>
    Promise.all(urls.map((url) => cache.delete(url).catch(() => false)));

  for (const lesson of oldestFirst) {
    if (total <= limit) break;
    const videos = Object.keys(lesson.renditions).filter(isVideoRendition);
    if (videos.length < 2) continue;
    const keptLast = new Map<string, number>();
    for (const row of await listLessonSegments(lesson.lessonKey)) {
      keptLast.set(
        row.rendition,
        Math.max(keptLast.get(row.rendition) ?? 0, row.storedAt),
      );
    }
    const keep = videos.reduce((best, name) =>
      (keptLast.get(name) ?? 0) > (keptLast.get(best) ?? 0) ? name : best,
    );
    for (const rendition of videos) {
      if (rendition === keep || total <= limit) continue;
      const removed = await removeRendition(lesson.lessonKey, rendition);
      await deleteAll(removed.urls);
      total -= removed.bytes;
      lesson.bytes = Math.max(0, (lesson.bytes || 0) - removed.bytes);
      noteBytesFreed(removed.bytes);
    }
  }

  for (const lesson of oldestFirst) {
    if (total <= limit) break;
    const urls = await removeLesson(lesson.lessonKey);
    total -= lesson.bytes || 0;
    stats.lessonsEvicted += 1;
    touchedLessons.delete(lesson.lessonKey);
    await deleteAll(urls);
    noteBytesFreed(lesson.bytes || 0);
  }
  return startTotal - total;
}

/** At least this much is let go at a time when a segment does not fit. */
const MAKE_ROOM_STEP_BYTES = 64 * 1024 * 1024;
/** Let go when the browser refuses a write: its storage is really full. */
const FULL_STORAGE_STEP_BYTES = 256 * 1024 * 1024;
let makingRoom: Promise<void> | null = null;

/**
 * Whether a segment of `bytes` can be kept, letting the least recently
 * opened lessons go (never one in use) when it does not fit beside the
 * reserve. A full cache used to stop keeping anything new, and from then
 * on every segment, even one just watched, came from the network again.
 *
 * Nothing goes when that would not make the room: the space may be held by
 * the site's other data (downloads, chat photos), and emptying the cache
 * then only lost what it held (Brave, 28 Nov).
 */
async function makeRoomFor(bytes: number): Promise<boolean> {
  const short = await bytesShortForSegment(bytes);
  if (short <= 0) return true;
  makingRoom ??= (async () => {
    const lessons = await listLessons();
    const now = Date.now();
    const freeable = totalBytes(
      lessons.filter((lesson) => !inUse(lesson.lessonKey, now)),
    );
    if (freeable < short) return;
    await evictTo(
      Math.max(0, totalBytes(lessons) - Math.max(short, MAKE_ROOM_STEP_BYTES)),
    );
  })()
    .catch(() => undefined)
    .finally(() => {
      makingRoom = null;
    });
  await makingRoom;
  return hasRoomForSegment(bytes);
}

let trimRunning: Promise<void> | null = null;
let trimScheduled = false;
let lastTrimAt = 0;

function trimToBudget(): Promise<void> {
  trimRunning ??= resolveSegmentCacheBudget()
    .then(async (limit) => {
      await evictTo(limit);
    })
    .catch(() => undefined)
    .finally(() => {
      trimRunning = null;
    });
  return trimRunning;
}

/**
 * Brings the cache under its budget when the page is idle, at most once
 * every `TRIM_INTERVAL_MS`: never on the way of a segment.
 */
function scheduleTrim() {
  if (trimScheduled) return;
  trimScheduled = true;
  const wait = Math.max(0, lastTrimAt + TRIM_INTERVAL_MS - Date.now());
  setTimeout(() => {
    const run = () => {
      trimScheduled = false;
      lastTrimAt = Date.now();
      void trimToBudget();
    };
    if (typeof requestIdleCallback === "function") {
      requestIdleCallback(run, { timeout: 10_000 });
    } else {
      run();
    }
  }, wait);
}

/**
 * Makes the cache hold at most `bytes`, for a download that needs the room.
 * Lessons in use are kept.
 */
export async function trimSegmentCacheTo(bytes: number): Promise<void> {
  if (!available()) return;
  await trimRunning;
  await evictTo(Math.max(0, bytes)).catch(() => undefined);
}

/** Frees up to `bytesNeeded` of the cache (see `registerStorageReclaimer`). */
export async function reclaimSegmentCache(bytesNeeded: number): Promise<void> {
  const lessons = await listLessons();
  const total = lessons.reduce((sum, lesson) => sum + (lesson.bytes || 0), 0);
  await trimSegmentCacheTo(total - bytesNeeded);
}

/**
 * Empties the cache. A lesson playing in another tab goes on from what it
 * has buffered and fetches the rest.
 */
export async function clearSegmentCache(): Promise<void> {
  if (!available()) return;
  forgetOpenCache();
  await Promise.all([
    window.caches.delete(CACHE_NAME).catch(() => false),
    clearSegmentIndex(),
  ]);
  openChannel()?.postMessage("cleared");
}

/**
 * How long a lookup in the cache may take before the segment is fetched
 * from the network instead. IndexedDB and Cache Storage normally answer in
 * milliseconds, but a browser whose storage is busy or wedged (a disk that
 * is full, another tab holding the database) has been seen to answer never,
 * and every segment then waited on it: a frozen video with no error.
 */
const SEGMENT_LOOKUP_LIMIT_MS = 1_500;

function withinLookupLimit<T>(promise: Promise<T>): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), SEGMENT_LOOKUP_LIMIT_MS);
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

/** A kept segment's body, or null. */
async function readSegment(key: string): Promise<ArrayBuffer | null> {
  try {
    // Without the list, what is kept could not be kept in check.
    if (!(await withinLookupLimit(openSegmentIndex()))) return null;
    const hit = await withinLookupLimit(
      openCache().then((cache) => cache.match(key)),
    );
    if (!hit) {
      stats.misses += 1;
      return null;
    }
    const data = await hit.arrayBuffer();
    stats.hits += 1;
    stats.bytesFromCache += data.byteLength;
    const address = parseSegmentAddress(key);
    if (address) noteLessonUsed(address.lessonKey);
    return data;
  } catch {
    stats.misses += 1;
    return null;
  }
}

function isStorageFull(error: unknown): boolean {
  return (
    error instanceof DOMException &&
    (error.name === "QuotaExceededError" || error.code === 22)
  );
}

/**
 * Writes a segment; when the browser refuses it for want of space (the
 * real limit, where the reported quota is made up), lets the oldest
 * lessons go and tries once more. False when it is still not kept.
 */
async function putSegment(
  cache: Cache,
  key: string,
  body: Blob,
): Promise<boolean> {
  try {
    await cache.put(key, new Response(body));
    return true;
  } catch (error) {
    if (!isStorageFull(error)) throw error;
  }
  const total = totalBytes(await listLessons());
  const freed = await evictTo(Math.max(0, total - FULL_STORAGE_STEP_BYTES));
  if (!freed) return false;
  try {
    await cache.put(key, new Response(body));
    return true;
  } catch {
    return false;
  }
}

/** Keeps a segment just received from the network. */
function keepSegment(key: string, data: ArrayBuffer | ArrayBufferView) {
  const bytes = data.byteLength;
  if (!bytes) return;
  stats.bytesFromNetwork += bytes;
  // Only a lesson's segments are kept: they are listed, and go, by lesson.
  const address = parseSegmentAddress(key);
  if (!address) return;
  notePlaying(address.lessonKey);
  // The body is copied here, before the player goes on with its own (a
  // Blob, so a write the browser refused can be tried again).
  const body = new Blob([data as BlobPart], {
    type: "application/octet-stream",
  });
  void (async () => {
    if (!(await openSegmentIndex())) return;
    if (!(await makeRoomFor(bytes))) {
      stats.skippedForReserve += 1;
      return;
    }
    const cache = await openCache();
    if (!(await putSegment(cache, key, body))) {
      stats.skippedForReserve += 1;
      return;
    }
    if (!(await recordSegment(key, bytes, address))) {
      await cache.delete(key);
      return;
    }
    noteSegmentKept(bytes);
    noteLessonUsed(address.lessonKey);
    scheduleTrim();
  })().catch(() => undefined);
}

interface ShakaRequestLike {
  method?: string;
  headers?: Record<string, string>;
}

interface ShakaResponseLike {
  uri: string;
  data: ArrayBuffer | ArrayBufferView;
  status?: number;
  fromCache?: boolean;
}

interface AbortableOperationLike {
  chain: (
    onSuccess: (value: unknown) => unknown,
    onError?: (error: unknown) => unknown,
  ) => AbortableOperationLike;
}

type SchemePlugin = ((
  uri: string,
  request: ShakaRequestLike,
  requestType: number,
  ...rest: unknown[]
) => AbortableOperationLike) & { __veoSegmentCache?: boolean };

interface ShakaNamespaceLike {
  net?: {
    HttpFetchPlugin?: {
      parse?: SchemePlugin;
      isSupported?: () => boolean;
    };
    NetworkingEngine?: {
      registerScheme?: (
        scheme: string,
        plugin: SchemePlugin,
        priority?: number,
        progressSupport?: boolean,
      ) => void;
      PluginPriority?: { PREFERRED?: number };
    };
  };
  util?: {
    AbortableOperation?: {
      notAbortable?: (promise: Promise<unknown>) => AbortableOperationLike;
    };
  };
}

function wrapFetchPlugin(shaka: ShakaNamespaceLike) {
  const fetchPlugin = shaka.net?.HttpFetchPlugin;
  const base = fetchPlugin?.parse;
  const AbortableOperation = shaka.util?.AbortableOperation;
  const notAbortable = AbortableOperation?.notAbortable;
  if (!fetchPlugin || !base || base.__veoSegmentCache || !notAbortable) {
    return;
  }
  const fetchAndKeep = (
    key: string | null,
    args: Parameters<SchemePlugin>,
  ): AbortableOperationLike => {
    const operation = base(...args);
    if (!key) return operation;
    return operation.chain((value) => {
      const response = value as ShakaResponseLike;
      if (
        !response.fromCache &&
        (response.status === undefined || response.status === 200)
      ) {
        keepSegment(key, response.data);
      }
      return response;
    });
  };
  const plugin: SchemePlugin = (...args) => {
    const [uri, request, requestType] = args;
    const isSegment =
      requestType === SEGMENT_REQUEST &&
      (request.method ?? "GET") === "GET" &&
      !Object.keys(request.headers ?? {}).some((name) => /^range$/i.test(name));
    const key = isSegment ? segmentCacheKey(uri) : null;
    if (!key) return base(...args);
    // Looked up first; a segment that is not there, or cannot be read, is
    // fetched as before. Only the network request can be aborted.
    return notAbortable
      .call(AbortableOperation, readSegment(key))
      .chain((data) =>
        data
          ? {
              uri,
              originalUri: uri,
              originalRequest: request,
              data,
              headers: {},
              status: 200,
              fromCache: true,
              timeMs: 0,
            }
          : fetchAndKeep(key, args),
      );
  };
  plugin.__veoSegmentCache = true;
  fetchPlugin.parse = plugin;
  // Shaka registered the original for http and https when it loaded; this
  // takes its place, at the same priority. An extension that registers its
  // own plugin over it calls `HttpFetchPlugin.parse`, which is this now.
  const engine = shaka.net?.NetworkingEngine;
  const priority = engine?.PluginPriority?.PREFERRED ?? 2;
  if (fetchPlugin.isSupported?.() ?? true) {
    for (const scheme of ["http", "https"]) {
      engine?.registerScheme?.(scheme, plugin, priority, true);
    }
  }
}

let installed = false;

/**
 * Keeps lesson video segments from now on (see above). Called before the
 * Shaka runtime is loaded; safe to call often.
 */
export function installSegmentCache() {
  if (installed || !available()) return;
  installed = true;
  openChannel();
  void openSegmentIndex();
  onShakaRuntimeLoaded(
    (runtimeModule) => {
      const record = runtimeModule as { default?: unknown } | null;
      wrapFetchPlugin((record?.default ?? record) as ShakaNamespaceLike);
    },
    { first: true },
  );
}
