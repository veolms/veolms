import { listLessons } from "./segmentCacheIndex";

/**
 * How much lesson video this device keeps (see segmentCache.ts): a tenth of
 * the browser's storage quota, held between bounds that suit the device.
 * Safari reports small quotas and clears a site's storage after a week
 * without a visit, so it keeps a flat amount.
 *
 * The quota is a share of the whole disk, not of what is free, so a segment
 * is also not kept when it would bring the site's use within
 * `FREE_SPACE_RESERVE_BYTES` of the quota: the room left is for downloads.
 *
 * Brave reports a made-up quota (2 GiB for every site, so that sites cannot
 * tell disks apart) while it lets a site store far more: 6 GB went in
 * without an error in Brave 1.100 (28 Nov 2026). There the quota and the
 * site's use say nothing; the cache keeps to `MADE_UP_QUOTA_BOUNDS` of its
 * own, and a write the browser refuses is what tells it the disk is full.
 */

const MB = 1024 * 1024;
const GB = 1024 * MB;
const QUOTA_SHARE = 0.1;
const FREE_SPACE_RESERVE_BYTES = 1 * GB;
/** The reserve is at most this share of a small quota (see `reserveFor`). */
const RESERVE_QUOTA_SHARE = 0.25;
const ESTIMATE_MAX_AGE_MS = 30_000;
const BUDGET_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** Bounds per kind of device, in bytes. */
const BOUNDS = {
  safari: { min: 500 * MB, max: 500 * MB },
  android: { min: 500 * MB, max: 2 * GB },
  desktop: { min: 1 * GB, max: 10 * GB },
} as const;

/** The cache's own size where the reported quota is made up. */
const MADE_UP_QUOTA_BOUNDS = {
  safari: 500 * MB,
  android: 1 * GB,
  desktop: 3 * GB,
} as const;
/** What Brave reports as every site's quota. */
const BRAVE_REPORTED_QUOTA = 2 * GB;

type DeviceClass = keyof typeof BOUNDS;

function deviceClass(): DeviceClass {
  const agent = typeof navigator === "undefined" ? "" : navigator.userAgent;
  if (/safari/i.test(agent) && !/chrome|crios|fxios|android/i.test(agent)) {
    return "safari";
  }
  return /android/i.test(agent) ? "android" : "desktop";
}

interface Estimate {
  usage: number;
  quota: number;
  /** False where the browser makes the quota up (see above). */
  trusted: boolean;
  at: number;
}

/** Whether the browser's quota (and so the room it leaves) means anything. */
function quotaIsReal(quota: number, usage: number): boolean {
  if (typeof navigator !== "undefined" && "brave" in navigator) return false;
  // Brave's figure, or a use already past the quota: not a real limit.
  return quota !== BRAVE_REPORTED_QUOTA && usage <= quota;
}

let estimate: Promise<Estimate | null> | null = null;

/** The browser's storage estimate, read again at most every 30 s. */
function readEstimate(
  maxAgeMs = ESTIMATE_MAX_AGE_MS,
): Promise<Estimate | null> {
  const current = estimate;
  if (current) {
    return current.then((value) =>
      value && Date.now() - value.at < maxAgeMs
        ? value
        : ((estimate = null), readEstimate(maxAgeMs)),
    );
  }
  estimate = (async () => {
    try {
      const result = await navigator.storage?.estimate?.();
      if (!result?.quota) return null;
      const usage = result.usage ?? 0;
      return {
        usage,
        quota: result.quota,
        trusted: quotaIsReal(result.quota, usage),
        at: Date.now(),
      };
    } catch {
      return null;
    }
  })();
  return estimate;
}

let budget: { value: Promise<number>; at: number } | null = null;

if (typeof window !== "undefined") {
  // Back from the page cache: the disk may have changed meanwhile.
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) budget = null;
  });
}

/** The most this device keeps, in bytes. */
export function resolveSegmentCacheBudget(): Promise<number> {
  if (budget && Date.now() - budget.at < BUDGET_MAX_AGE_MS) return budget.value;
  const bounds = BOUNDS[deviceClass()];
  const value = readEstimate().then((current) => {
    if (current && !current.trusted) {
      return MADE_UP_QUOTA_BOUNDS[deviceClass()];
    }
    const share = current ? current.quota * QUOTA_SHARE : bounds.min;
    return Math.round(Math.min(bounds.max, Math.max(bounds.min, share)));
  });
  budget = { value, at: Date.now() };
  return value;
}

/**
 * The room left free for downloads: 1 GB, or a quarter of the quota when
 * that is small. Brave reports the same 2 GB quota to every site, and with
 * a flat 1 GB reserve its 1 GB cache filled the rest: from then on no
 * segment was kept, and every one came from the network again (25 Nov).
 */
function reserveFor(quota: number): number {
  return Math.min(FREE_SPACE_RESERVE_BYTES, quota * RESERVE_QUOTA_SHARE);
}

/** Whether a segment of `bytes` may be kept without eating the reserve. */
export async function hasRoomForSegment(bytes: number): Promise<boolean> {
  const current = await readEstimate();
  // No estimate (an old browser) or a made-up one: only the budget applies,
  // and a write the browser refuses (see segmentCache.ts).
  if (!current || !current.trusted) return true;
  return current.usage + bytes <= current.quota - reserveFor(current.quota);
}

/**
 * How many bytes must go before a segment of `bytes` fits beside the
 * reserve (0 when it fits now or nothing is known).
 */
export async function bytesShortForSegment(bytes: number): Promise<number> {
  const current = await readEstimate();
  if (!current || !current.trusted) return 0;
  const room = current.quota - reserveFor(current.quota) - current.usage;
  return Math.max(0, bytes - room);
}

/** Counts the next segment kept against the estimate read last. */
export function noteSegmentKept(bytes: number): void {
  void estimate?.then((current) => {
    if (current) current.usage += bytes;
  });
}

/**
 * Counts bytes the cache let go against the estimate read last: the
 * browser's own figure catches up only later.
 */
export function noteBytesFreed(bytes: number): void {
  void estimate?.then((current) => {
    if (current) current.usage = Math.max(0, current.usage - bytes);
  });
}

/** What the video cache holds now. */
export async function getSegmentCacheUsage(): Promise<{
  bytes: number;
  lessons: number;
}> {
  const lessons = await listLessons();
  return {
    bytes: lessons.reduce((sum, lesson) => sum + (lesson.bytes || 0), 0),
    lessons: lessons.length,
  };
}
