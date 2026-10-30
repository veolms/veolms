/**
 * Which seek-preview storyboard a ready video has, so the playback
 * bootstrap can name it. Storyboards are made after the video, by a script
 * run off the server. Each run writes its sheets and its own index to a
 * folder of its own under `storyboard/` (the CDN keeps a file for hours
 * whatever its query string, so a file written again under the same name
 * would be served stale), and then `storyboard/index.json`, which says
 * which run is current (`path`) and which output it was made from
 * (`outputId`, so one left behind by an earlier transcode is not offered).
 * That file is read from storage, never through the CDN.
 *
 * Kept in memory per output: a found storyboard for 15 minutes (a new run
 * may replace it), a missing one for 5. Like the inlined manifest this never
 * fails or holds up the bootstrap. A read that is merely slow (often the
 * first after a restart: storage answers in 250-450 ms) or that fails
 * answers "not known yet", and the bootstrap names `storyboard/index.json`
 * itself: the player asks for it only when the timeline is used, and a
 * missing one costs it a 404 and no previews.
 */

export const STORYBOARD_INDEX_FILE = "storyboard/index.json";
export const STORYBOARD_PRESENT_TTL_MS = 15 * 60 * 1000;
export const STORYBOARD_MISSING_TTL_MS = 5 * 60 * 1000;
export const STORYBOARD_READ_TIMEOUT_MS = 300;
/**
 * `storyboard/index.json` is a copy of the run's whole index (every sheet
 * and the preview video's chunk offsets), about 20 KB per hour of video: a
 * 4 h 20 min lesson's is 85 KB, and at the 64 KB this once was, lessons
 * over about 3 h were offered no storyboard at all.
 */
export const STORYBOARD_INDEX_MAX_BYTES = 1024 * 1024;
const STORYBOARD_CACHE_MAX_ENTRIES = 2_000;
const RUN_INDEX_PATH = /^[\w.-]+\/index\.json$/u;

/** The storyboard index key for a manifest key (its folder + the file). */
export function storyboardIndexKeyFor(manifestKey: string): string {
  const slash = manifestKey.lastIndexOf("/");
  const folder = slash === -1 ? "" : manifestKey.slice(0, slash + 1);
  return `${folder}${STORYBOARD_INDEX_FILE}`;
}

/**
 * The index to hand the player, relative to the `storyboard/` folder (the
 * current run's own index, or `index.json` for one written before runs had
 * folders); false when `text` is not a storyboard made from `outputId`.
 */
export function storyboardIndexPathFor(
  text: string | null,
  outputId: string,
): string | false {
  if (!text) return false;
  try {
    const index = JSON.parse(text) as {
      version?: unknown;
      outputId?: unknown;
      path?: unknown;
    };
    // An output with no id (older rows) accepts any index in its folder.
    if (index.version !== 1 || (outputId && index.outputId !== outputId)) {
      return false;
    }
    return typeof index.path === "string" && RUN_INDEX_PATH.test(index.path)
      ? index.path
      : "index.json";
  } catch {
    return false;
  }
}

interface Entry {
  path: string | false;
  expiresAt: number;
}

export function createStoryboardPresenceCache(
  options: { now?: () => number; timeoutMs?: number } = {},
) {
  const now = options.now ?? Date.now;
  const timeoutMs = options.timeoutMs ?? STORYBOARD_READ_TIMEOUT_MS;
  const entries = new Map<string, Entry>();
  const reads = new Map<string, Promise<string | false | null>>();

  function remember(key: string, path: string | false): void {
    entries.delete(key);
    while (entries.size >= STORYBOARD_CACHE_MAX_ENTRIES) {
      const oldest = entries.keys().next().value;
      if (oldest === undefined) break;
      entries.delete(oldest);
    }
    entries.set(key, {
      path,
      expiresAt:
        now() + (path ? STORYBOARD_PRESENT_TTL_MS : STORYBOARD_MISSING_TTL_MS),
    });
  }

  /**
   * The index path (see `storyboardIndexPathFor`) of the storyboard at
   * `indexKey` made from `outputId`: false when there is none, null when
   * the read failed or is still running after the timeout (it goes on and
   * fills the cache). Never throws.
   */
  async function resolve(
    indexKey: string,
    outputId: string,
    read: (key: string) => Promise<string | null>,
  ): Promise<string | false | null> {
    const cacheKey = `${indexKey}#${outputId}`;
    const cached = entries.get(cacheKey);
    if (cached && cached.expiresAt > now()) return cached.path;

    let pending = reads.get(cacheKey);
    if (!pending) {
      pending = read(indexKey)
        .then((text) => {
          const path = storyboardIndexPathFor(text, outputId);
          remember(cacheKey, path);
          return path;
        })
        .catch((): string | false | null => null)
        .finally(() => reads.delete(cacheKey));
      reads.set(cacheKey, pending);
    }

    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<null>((settle) => {
      timer = setTimeout(() => settle(null), timeoutMs);
    });
    try {
      return await Promise.race([pending, timeout]);
    } finally {
      clearTimeout(timer);
    }
  }

  return { resolve, clear: () => entries.clear() };
}
