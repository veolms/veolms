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
 */

const MB = 1024 * 1024;
const GB = 1024 * MB;
const QUOTA_SHARE = 0.1;
const FREE_SPACE_RESERVE_BYTES = 1 * GB;
const ESTIMATE_MAX_AGE_MS = 30_000;
const BUDGET_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** Bounds per kind of device, in bytes. */
const BOUNDS = {
  safari: { min: 500 * MB, max: 500 * MB },
  android: { min: 500 * MB, max: 2 * GB },
  desktop: { min: 1 * GB, max: 10 * GB },
} as const;

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
  at: number;
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
      return { usage: result.usage ?? 0, quota: result.quota, at: Date.now() };
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
    const share = current ? current.quota * QUOTA_SHARE : bounds.min;
    return Math.round(Math.min(bounds.max, Math.max(bounds.min, share)));
  });
  budget = { value, at: Date.now() };
  return value;
}

/** Whether a segment of `bytes` may be kept without eating the reserve. */
export async function hasRoomForSegment(bytes: number): Promise<boolean> {
  const current = await readEstimate();
  // No estimate (an old browser): only the budget applies.
  if (!current) return true;
  return current.usage + bytes <= current.quota - FREE_SPACE_RESERVE_BYTES;
}

/** Counts the next segment kept against the estimate read last. */
export function noteSegmentKept(bytes: number): void {
  void estimate?.then((current) => {
    if (current) current.usage += bytes;
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
