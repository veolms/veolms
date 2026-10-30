/**
 * The top-level manifest of a ready video (an HLS master playlist or a DASH
 * MPD), kept in memory so the playback bootstrap can carry it and the player
 * skips one round trip on the first frame. A VOD manifest does not change
 * once the video is ready, and callers key it by output (a re-transcode is
 * a new key), so an entry never goes stale: it is kept until the least
 * recently used entry has to make room. With 5 minutes most lesson starts
 * found it gone and waited on a storage read (250-450ms) that often missed
 * the timeout, so the manifest was not inlined at all; with a day, a lesson
 * nobody opened that day paid that read again.
 *
 * Inlining is an enhancement: every failure here ends in `undefined`, and
 * the bootstrap goes out without it.
 */

export const MASTER_MANIFEST_CACHE_MAX_ENTRIES = 500;
/**
 * No expiry. Memory stays bounded by the entry limit: real manifests are a
 * few KB, and even 500 at the 64KB cap below is 32MB.
 */
export const MASTER_MANIFEST_CACHE_TTL_MS = Number.POSITIVE_INFINITY;
/** Longer than this and the player is quicker fetching it from the CDN. */
export const MASTER_MANIFEST_READ_TIMEOUT_MS = 350;
/** Master playlists are a few hundred bytes; anything far larger is not one. */
export const MASTER_MANIFEST_MAX_BYTES = 64 * 1024;

interface CachedManifest {
  text: string;
  expiresAt: number;
}

export interface MasterManifestCacheOptions {
  maxEntries?: number;
  ttlMs?: number;
  timeoutMs?: number;
  now?: () => number;
}

/** Reads the object's text, or null when it does not exist. */
export type ManifestTextReader = (key: string) => Promise<string | null>;

/** An HLS master playlist or a DASH MPD, of a size worth inlining. */
export function isInlinableMasterManifest(text: unknown): text is string {
  if (typeof text !== "string" || text.length > MASTER_MANIFEST_MAX_BYTES) {
    return false;
  }
  const start = text.trimStart();
  return (
    start.startsWith("#EXTM3U") ||
    /^(?:<\?xml[^>]*\?>\s*)?(?:<!--[\s\S]*?-->\s*)*<MPD[\s>]/u.test(start)
  );
}

export function createMasterManifestCache(
  options: MasterManifestCacheOptions = {},
) {
  const maxEntries = options.maxEntries ?? MASTER_MANIFEST_CACHE_MAX_ENTRIES;
  const ttlMs = options.ttlMs ?? MASTER_MANIFEST_CACHE_TTL_MS;
  const timeoutMs = options.timeoutMs ?? MASTER_MANIFEST_READ_TIMEOUT_MS;
  const now = options.now ?? Date.now;
  const entries = new Map<string, CachedManifest>();
  // One storage read per key at a time, however many learners start at once.
  const reads = new Map<string, Promise<string | undefined>>();

  function get(key: string): string | undefined {
    const entry = entries.get(key);
    if (!entry) return undefined;
    entries.delete(key);
    if (entry.expiresAt <= now()) return undefined;
    // Back to the newest end, so a lesson in use is never the one evicted.
    entries.set(key, entry);
    return entry.text;
  }

  function set(key: string, text: string): void {
    entries.delete(key);
    while (entries.size >= maxEntries) {
      const oldest = entries.keys().next().value;
      if (oldest === undefined) break;
      entries.delete(oldest);
    }
    entries.set(key, { text, expiresAt: now() + ttlMs });
  }

  function startRead(
    key: string,
    read: ManifestTextReader,
  ): Promise<string | undefined> {
    const existing = reads.get(key);
    if (existing) return existing;
    const pending = read(key)
      .then((text) => {
        if (!isInlinableMasterManifest(text)) return undefined;
        // A read that loses the race below still serves the next learner.
        set(key, text);
        return text;
      })
      .finally(() => {
        reads.delete(key);
      });
    reads.set(key, pending);
    return pending;
  }

  /**
   * The master playlist at `key` if it is cached or can be read within the
   * timeout; otherwise undefined. Never throws.
   */
  async function resolve(
    key: string,
    read: ManifestTextReader,
  ): Promise<string | undefined> {
    const cached = get(key);
    if (cached !== undefined) return cached;

    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<undefined>((settle) => {
      timer = setTimeout(() => settle(undefined), timeoutMs);
    });
    try {
      const pending = startRead(key, read);
      // Observed here so a read that finishes after the timeout cannot
      // surface as an unhandled rejection.
      pending.catch(() => undefined);
      return await Promise.race([pending, timeout]);
    } catch {
      return undefined;
    } finally {
      clearTimeout(timer);
    }
  }

  function clear(): void {
    entries.clear();
    reads.clear();
  }

  return { get, set, resolve, clear, size: () => entries.size };
}

export type MasterManifestCache = ReturnType<typeof createMasterManifestCache>;
