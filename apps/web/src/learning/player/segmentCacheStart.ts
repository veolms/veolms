import { getLesson } from "./segmentCacheIndex";

/**
 * The picture height a lesson plays at when the device already keeps it
 * at one (see segmentCache.ts): a reload after ABR stepped up would
 * otherwise start lower, at what it last measured, and fetch from the
 * network what is on the disk; and with the kept segments not counted in
 * its estimate, ABR would wander off the kept rendition. The player holds
 * at this height until a video segment comes from the network
 * (`holdVideoHeight`). Looked up while the playback bootstrap resolves
 * (`prepareCachedStartHeight`), so the player's source, which is built
 * synchronously, can read it (`cachedStartHeight`).
 */

/** About a minute of 6 s segments: less is not worth starting at. */
const MIN_CACHED_SEGMENTS = 10;
/**
 * The lookup never holds the bootstrap longer than this. The index opens
 * in about 20 ms once warm; a cold open on a slow disk takes longer, and a
 * lookup that misses costs a whole rendition fetched again.
 */
const LOOKUP_LIMIT_MS = 250;

const heights = new Map<string, number | null>();

/** The lesson folder a manifest sits in, as segment rows name it. */
function lessonKeyOfManifest(manifestUrl: string): string | null {
  try {
    const url = new URL(manifestUrl, globalThis.location?.href);
    const parts = url.pathname.split("/");
    const marker = parts.indexOf("transcoded");
    if (marker < 0 || !parts[marker + 1]) return null;
    return `${url.origin}${parts.slice(0, marker + 2).join("/")}/`;
  } catch {
    return null;
  }
}

/** The video rendition with the most segments kept, when it has enough. */
async function lookUp(lessonKey: string): Promise<number | null> {
  const lesson = await getLesson(lessonKey);
  let best: { height: number; count: number } | null = null;
  for (const [rendition, count] of Object.entries(lesson?.renditions ?? {})) {
    const height = Number.parseInt(rendition, 10);
    if (!Number.isFinite(height) || height <= 0) continue;
    if (count < MIN_CACHED_SEGMENTS) continue;
    // On a tie, the taller: it is the one ABR stepped up to.
    if (
      !best ||
      count > best.count ||
      (count === best.count && height > best.height)
    ) {
      best = { height, count };
    }
  }
  return best?.height ?? null;
}

/**
 * Looks up the height to start the lesson at `manifestUrl` at; resolves
 * within `LOOKUP_LIMIT_MS` either way.
 */
export async function prepareCachedStartHeight(
  manifestUrl: string,
): Promise<void> {
  const lessonKey = lessonKeyOfManifest(manifestUrl);
  if (!lessonKey || typeof window === "undefined") return;
  const lookup = lookUp(lessonKey)
    .then((height) => {
      heights.set(lessonKey, height);
    })
    .catch(() => undefined);
  await Promise.race([
    lookup,
    new Promise((resolve) => setTimeout(resolve, LOOKUP_LIMIT_MS)),
  ]);
}

/** The height found for `manifestUrl`, if it was looked up in time. */
export function cachedStartHeight(manifestUrl: string): number | undefined {
  const lessonKey = lessonKeyOfManifest(manifestUrl);
  return (lessonKey && heights.get(lessonKey)) || undefined;
}
