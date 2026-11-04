/**
 * Which lesson video segments are kept on this device (see segmentCache.ts),
 * in IndexedDB so every tab writes its own rows instead of rewriting one
 * shared list.
 *
 * `segments` holds one row per kept segment, keyed by its address without
 * the token; `lessons` one row per lesson (the media folder its segments
 * share) with its size, when it was last opened and how many segments of
 * each rendition it has. A segment row and its lesson's totals are written
 * in the same transaction, so two tabs storing at once lose nothing.
 *
 * Nothing here throws: a database that cannot be opened reads as empty and
 * keeps nothing, and the player fetches as if there were no cache.
 */

const DATABASE_NAME = "veolms-video-segments";
const DATABASE_VERSION = 1;
const SEGMENTS = "segments";
const LESSONS = "lessons";
/** The localStorage list used before this database. */
const LEGACY_INDEX_KEY = "veolms-video-segments-index";

export interface SegmentRow {
  url: string;
  bytes: number;
  lessonKey: string;
  rendition: string;
  /** The segment's number within its rendition; -1 for an init segment. */
  segment: number;
  storedAt: number;
}

export interface LessonRow {
  lessonKey: string;
  usedAt: number;
  bytes: number;
  renditions: Record<string, number>;
}

export interface SegmentAddress {
  lessonKey: string;
  rendition: string;
  segment: number;
}

/**
 * The lesson and rendition a segment address belongs to:
 * `…/protected/transcoded/<id>/<rendition>/seg-p000-00003.m4s` is lesson
 * `…/protected/transcoded/<id>/`, rendition `<rendition>`, segment 3. Null
 * for an address of any other shape.
 */
export function parseSegmentAddress(url: string): SegmentAddress | null {
  try {
    const parsed = new URL(url);
    const parts = parsed.pathname.split("/");
    const marker = parts.indexOf("transcoded");
    if (marker < 0 || parts.length < marker + 4) return null;
    const id = parts[marker + 1];
    const rendition = parts[marker + 2];
    if (!id || !rendition) return null;
    const file = parts[parts.length - 1] ?? "";
    const number = /(\d+)\.\w+$/.exec(file);
    const segment = /^init/i.test(file) || !number ? -1 : Number(number[1]);
    return {
      lessonKey: `${parsed.origin}${parts.slice(0, marker + 2).join("/")}/`,
      rendition,
      segment,
    };
  } catch {
    return null;
  }
}

let databasePromise: Promise<IDBDatabase | null> | null = null;

function request<T>(target: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    target.onsuccess = () => resolve(target.result);
    target.onerror = () => reject(target.error);
  });
}

function done(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

/** The database, or null where it cannot be used. */
export function openSegmentIndex(): Promise<IDBDatabase | null> {
  databasePromise ??= new Promise<IDBDatabase | null>((resolve) => {
    if (typeof indexedDB === "undefined") {
      resolve(null);
      return;
    }
    let opening: IDBOpenDBRequest;
    try {
      opening = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    } catch {
      resolve(null);
      return;
    }
    opening.onupgradeneeded = () => {
      const database = opening.result;
      if (!database.objectStoreNames.contains(SEGMENTS)) {
        const segments = database.createObjectStore(SEGMENTS, {
          keyPath: "url",
        });
        segments.createIndex("lessonKey", "lessonKey");
      }
      if (!database.objectStoreNames.contains(LESSONS)) {
        database.createObjectStore(LESSONS, { keyPath: "lessonKey" });
      }
    };
    opening.onsuccess = () => {
      const database = opening.result;
      // Another tab opening a newer version: let it, open again later.
      database.onversionchange = () => {
        database.close();
        databasePromise = null;
      };
      resolve(database);
    };
    opening.onerror = () => resolve(null);
    opening.onblocked = () => resolve(null);
  }).then((database) => (database ? migrateLegacyIndex(database) : null));
  return databasePromise;
}

/**
 * The list kept in localStorage before this database: its segments are
 * moved here once and the list deleted. Segments whose address does not
 * name a lesson are deleted from the cache.
 */
async function migrateLegacyIndex(database: IDBDatabase): Promise<IDBDatabase> {
  let legacy: Record<string, [number, number]> | null = null;
  try {
    const text = localStorage.getItem(LEGACY_INDEX_KEY);
    if (text === null) return database;
    const parsed: unknown = JSON.parse(text);
    legacy =
      parsed && typeof parsed === "object"
        ? (parsed as Record<string, [number, number]>)
        : {};
  } catch {
    legacy = {};
  }
  const dropped: string[] = [];
  try {
    const transaction = database.transaction([SEGMENTS, LESSONS], "readwrite");
    const segments = transaction.objectStore(SEGMENTS);
    const lessons = transaction.objectStore(LESSONS);
    const totals = new Map<string, LessonRow>();
    for (const [url, entry] of Object.entries(legacy)) {
      const address = parseSegmentAddress(url);
      const bytes = Array.isArray(entry) ? Number(entry[0]) : NaN;
      const usedAt = Array.isArray(entry) ? Number(entry[1]) || 0 : 0;
      if (!address || !(bytes > 0)) {
        dropped.push(url);
        continue;
      }
      segments.put({
        url,
        bytes,
        ...address,
        storedAt: usedAt,
      } satisfies SegmentRow);
      const lesson = totals.get(address.lessonKey) ?? {
        lessonKey: address.lessonKey,
        usedAt: 0,
        bytes: 0,
        renditions: {},
      };
      lesson.usedAt = Math.max(lesson.usedAt, usedAt);
      lesson.bytes += bytes;
      lesson.renditions[address.rendition] =
        (lesson.renditions[address.rendition] ?? 0) + 1;
      totals.set(address.lessonKey, lesson);
    }
    for (const lesson of totals.values()) lessons.put(lesson);
    await done(transaction);
    localStorage.removeItem(LEGACY_INDEX_KEY);
  } catch {
    // Tried again on the next load.
    return database;
  }
  if (dropped.length && typeof caches !== "undefined") {
    void caches
      .open("veolms-video-segments-v1")
      .then((cache) =>
        Promise.all(dropped.map((url) => cache.delete(url).catch(() => false))),
      )
      .catch(() => undefined);
  }
  return database;
}

/** Whether `url` is listed as kept. */
export async function hasSegment(url: string): Promise<boolean> {
  try {
    const database = await openSegmentIndex();
    if (!database) return false;
    const transaction = database.transaction(SEGMENTS, "readonly");
    return (
      (await request(transaction.objectStore(SEGMENTS).getKey(url))) !==
      undefined
    );
  } catch {
    return false;
  }
}

/**
 * Lists a segment just kept and adds it to its lesson's totals, in one
 * transaction. Returns false when nothing was written.
 */
export async function recordSegment(
  url: string,
  bytes: number,
  address: SegmentAddress,
): Promise<boolean> {
  try {
    const database = await openSegmentIndex();
    if (!database) return false;
    const transaction = database.transaction([SEGMENTS, LESSONS], "readwrite");
    const segments = transaction.objectStore(SEGMENTS);
    const lessons = transaction.objectStore(LESSONS);
    const now = Date.now();
    const previous = (await request(segments.get(url))) as
      SegmentRow | undefined;
    segments.put({
      url,
      bytes,
      ...address,
      storedAt: now,
    } satisfies SegmentRow);
    const lesson = ((await request(lessons.get(address.lessonKey))) as
      LessonRow | undefined) ?? {
      lessonKey: address.lessonKey,
      usedAt: now,
      bytes: 0,
      renditions: {},
    };
    lesson.bytes += bytes - (previous?.bytes ?? 0);
    if (!previous) {
      lesson.renditions[address.rendition] =
        (lesson.renditions[address.rendition] ?? 0) + 1;
    }
    lessons.put(lesson);
    await done(transaction);
    return true;
  } catch {
    return false;
  }
}

/** Marks a lesson as opened now (for the least-recently-used order). */
export async function touchLesson(lessonKey: string): Promise<void> {
  try {
    const database = await openSegmentIndex();
    if (!database) return;
    const transaction = database.transaction(LESSONS, "readwrite");
    const lessons = transaction.objectStore(LESSONS);
    const lesson = (await request(lessons.get(lessonKey))) as
      LessonRow | undefined;
    if (lesson) {
      lesson.usedAt = Date.now();
      lessons.put(lesson);
    }
    await done(transaction);
  } catch {
    // Its place in the order stays as it was.
  }
}

/** One lesson's totals, or null. */
export async function getLesson(lessonKey: string): Promise<LessonRow | null> {
  try {
    const database = await openSegmentIndex();
    if (!database) return null;
    const transaction = database.transaction(LESSONS, "readonly");
    return (
      ((await request(transaction.objectStore(LESSONS).get(lessonKey))) as
        LessonRow | undefined) ?? null
    );
  } catch {
    return null;
  }
}

/** Every lesson's totals. */
export async function listLessons(): Promise<LessonRow[]> {
  try {
    const database = await openSegmentIndex();
    if (!database) return [];
    const transaction = database.transaction(LESSONS, "readonly");
    return (await request(
      transaction.objectStore(LESSONS).getAll(),
    )) as LessonRow[];
  } catch {
    return [];
  }
}

/** The segments kept for a lesson. */
export async function listLessonSegments(
  lessonKey: string,
): Promise<SegmentRow[]> {
  try {
    const database = await openSegmentIndex();
    if (!database) return [];
    const transaction = database.transaction(SEGMENTS, "readonly");
    return (await request(
      transaction.objectStore(SEGMENTS).index("lessonKey").getAll(lessonKey),
    )) as SegmentRow[];
  } catch {
    return [];
  }
}

/**
 * Removes a lesson and its segment rows in one transaction; returns the
 * addresses that were listed, for the caller to delete from the cache.
 */
export async function removeLesson(lessonKey: string): Promise<string[]> {
  try {
    const database = await openSegmentIndex();
    if (!database) return [];
    const transaction = database.transaction([SEGMENTS, LESSONS], "readwrite");
    const segments = transaction.objectStore(SEGMENTS);
    const urls = (await request(
      segments.index("lessonKey").getAllKeys(lessonKey),
    )) as string[];
    for (const url of urls) segments.delete(url);
    transaction.objectStore(LESSONS).delete(lessonKey);
    await done(transaction);
    return urls;
  } catch {
    return [];
  }
}

/** Removes one segment row (its cache entry was found missing). */
export async function removeSegment(url: string): Promise<void> {
  try {
    const database = await openSegmentIndex();
    if (!database) return;
    const transaction = database.transaction([SEGMENTS, LESSONS], "readwrite");
    const segments = transaction.objectStore(SEGMENTS);
    const lessons = transaction.objectStore(LESSONS);
    const row = (await request(segments.get(url))) as SegmentRow | undefined;
    if (row) {
      segments.delete(url);
      const lesson = (await request(lessons.get(row.lessonKey))) as
        LessonRow | undefined;
      if (lesson) {
        lesson.bytes = Math.max(0, lesson.bytes - row.bytes);
        const count = (lesson.renditions[row.rendition] ?? 1) - 1;
        if (count > 0) lesson.renditions[row.rendition] = count;
        else delete lesson.renditions[row.rendition];
        lessons.put(lesson);
      }
    }
    await done(transaction);
  } catch {
    // Listed until the lesson goes.
  }
}

/** Empties both stores. */
export async function clearSegmentIndex(): Promise<void> {
  try {
    const database = await openSegmentIndex();
    if (!database) return;
    const transaction = database.transaction([SEGMENTS, LESSONS], "readwrite");
    transaction.objectStore(SEGMENTS).clear();
    transaction.objectStore(LESSONS).clear();
    await done(transaction);
  } catch {
    // Left as it is.
  }
}
