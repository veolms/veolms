import { LRUCache } from "lru-cache";

import { ALL_CACHE_TAG } from "./tags.ts";
import {
  isCachingEnabled,
  registerCache,
  unregisterCache,
  type RegisteredCache,
} from "./registry.ts";

export interface CacheOptions<V> {
  /** Unique in the process; names the cache in metrics and logs. */
  name: string;
  /** How long an entry is served. 0 turns this cache off. */
  ttlMs: number;
  /**
   * Upper bound on the memory the entries take (approximately: see
   * `sizeOf`). The least recently used entries go first. Default 16 MB.
   */
  maxBytes?: number;
  /** Upper bound on the number of entries. Default 10 000. */
  maxEntries?: number;
  /**
   * Approximate size of a value in bytes. The default measures it as JSON,
   * once, when it is stored.
   */
  sizeOf?: (value: V) => number;
}

export interface CacheEntryOptions<V> {
  /** Labels known before the load; see `tags.ts`. */
  tags?: readonly string[];
  /**
   * Labels known only from the loaded value (a course read by its slug is
   * labelled with its id). Until the load finishes, any invalidation at all
   * keeps its result out of the cache, as it may be what was invalidated.
   */
  tagsOf?: (value: V) => readonly string[];
  /**
   * Whether to keep a loaded value; when false it is returned to the
   * callers but not stored. For "not found" answers (null), which would
   * otherwise let made-up keys fill the cache, or hide a record created
   * just after.
   */
  keepIf?: (value: V) => boolean;
}

export interface CacheStats {
  name: string;
  entries: number;
  bytes: number;
  maxBytes: number;
  hits: number;
  misses: number;
  /** Loads that finished; their results are stored unless discarded. */
  loads: number;
  loadFailures: number;
  /** Loaded while their data changed, so returned but not stored. */
  discardedLoads: number;
  invalidatedEntries: number;
  /** Removed to stay within `maxBytes` / `maxEntries`. */
  evictions: number;
}

export interface Cache<V> {
  readonly name: string;
  /**
   * The value under `key`: the cached one while it is fresh, otherwise
   * `load()`'s, which is stored. Callers asking for the same key while it
   * loads share that one load. A failed load is not stored. Values are
   * shared between callers: never mutate one.
   */
  fetch(
    key: string,
    load: () => Promise<V>,
    options?: CacheEntryOptions<V>,
  ): Promise<V>;
  /** The fresh value under `key`, without loading. */
  get(key: string): { value: V } | undefined;
  set(key: string, value: V, options?: { tags?: readonly string[] }): void;
  delete(key: string): void;
  /** Removes the entries labelled with any of `tags` (see `invalidateCache`). */
  invalidate(tags: ReadonlySet<string>): void;
  clear(): void;
  stats(): CacheStats;
  /** Empties the cache and removes it from the registry. */
  dispose(): void;
}

interface Entry<V> {
  value: V;
  tags: readonly string[];
}

interface Load<V> {
  promise: Promise<V>;
  /** Null while the tags depend on the value still being loaded. */
  tags: ReadonlySet<string> | null;
  stale: boolean;
}

const DEFAULT_MAX_BYTES = 16 * 1024 * 1024;
const DEFAULT_MAX_ENTRIES = 10_000;
/** Assumed for a value JSON cannot measure. */
const UNMEASURABLE_SIZE = 1024;

/** UTF-16 code units, two bytes each, as JSON: close enough for a budget. */
function estimateSize(value: unknown): number {
  try {
    const json = JSON.stringify(value);
    return json === undefined ? 16 : json.length * 2;
  } catch {
    return UNMEASURABLE_SIZE;
  }
}

function overlaps(
  tags: Iterable<string>,
  invalidated: ReadonlySet<string>,
): boolean {
  for (const tag of tags) if (invalidated.has(tag)) return true;
  return false;
}

/**
 * A process-local cache: least-recently-used, bounded by size, entries
 * expiring after `ttlMs`, cleared by tag. Registered by name, so that
 * `invalidateCache`, `clearAllCaches` and `getCacheStats` reach it.
 *
 * Create one per kind of data, at module level, so every service instance
 * in the process shares it.
 */
export function createCache<V>(options: CacheOptions<V>): Cache<V> {
  const { name, ttlMs } = options;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const sizeOf = options.sizeOf ?? estimateSize;

  const counters = {
    hits: 0,
    misses: 0,
    loads: 0,
    loadFailures: 0,
    discardedLoads: 0,
    invalidatedEntries: 0,
    evictions: 0,
  };

  const lru = new LRUCache<string, Entry<V>>({
    max: options.maxEntries ?? DEFAULT_MAX_ENTRIES,
    maxSize: maxBytes,
    sizeCalculation: (entry, key) =>
      Math.max(1, sizeOf(entry.value) + key.length * 2),
    ...(ttlMs > 0 ? { ttl: ttlMs } : {}),
    dispose: (_entry, _key, reason) => {
      if (reason === "evict") counters.evictions += 1;
    },
  });
  const loads = new Map<string, Load<V>>();

  function active(): boolean {
    return ttlMs > 0 && isCachingEnabled();
  }

  function store(key: string, value: V, tags: readonly string[]): void {
    lru.set(key, { value, tags });
  }

  async function fetch(
    key: string,
    load: () => Promise<V>,
    entryOptions: CacheEntryOptions<V> = {},
  ): Promise<V> {
    if (!active()) return await load();

    const cached = lru.get(key);
    if (cached) {
      counters.hits += 1;
      return cached.value;
    }
    const pending = loads.get(key);
    if (pending) {
      counters.hits += 1;
      return await pending.promise;
    }
    counters.misses += 1;

    const { tags = [], tagsOf, keepIf } = entryOptions;
    const current = {
      tags: tagsOf ? null : new Set(tags),
      stale: false,
    } as Load<V>;
    current.promise = (async () => {
      try {
        const value = await load();
        const allTags = tagsOf ? [...tags, ...tagsOf(value)] : tags;
        counters.loads += 1;
        if (current.stale || !active()) counters.discardedLoads += 1;
        else if (!keepIf || keepIf(value)) store(key, value, allTags);
        return value;
      } catch (error) {
        counters.loadFailures += 1;
        throw error;
      } finally {
        if (loads.get(key) === current) loads.delete(key);
      }
    })();
    loads.set(key, current);
    return await current.promise;
  }

  function invalidate(invalidated: ReadonlySet<string>): void {
    if (invalidated.has(ALL_CACHE_TAG)) {
      clear();
      return;
    }
    const keys: string[] = [];
    for (const [key, entry] of lru.entries()) {
      if (overlaps(entry.tags, invalidated)) keys.push(key);
    }
    for (const key of keys) lru.delete(key);
    counters.invalidatedEntries += keys.length;

    // A load in progress may have read what just changed: let it finish for
    // its callers, but do not keep its result, and let the next caller load
    // afresh.
    for (const [key, pending] of loads) {
      if (pending.tags === null || overlaps(pending.tags, invalidated)) {
        pending.stale = true;
        loads.delete(key);
      }
    }
  }

  function clear(): void {
    counters.invalidatedEntries += lru.size;
    lru.clear();
    for (const pending of loads.values()) pending.stale = true;
    loads.clear();
  }

  const cache: Cache<V> & RegisteredCache = {
    name,
    fetch,
    get(key) {
      if (!active()) return undefined;
      const entry = lru.get(key);
      if (entry) counters.hits += 1;
      else counters.misses += 1;
      return entry ? { value: entry.value } : undefined;
    },
    set(key, value, setOptions = {}) {
      if (active()) store(key, value, setOptions.tags ?? []);
    },
    delete(key) {
      lru.delete(key);
      const pending = loads.get(key);
      if (pending) {
        pending.stale = true;
        loads.delete(key);
      }
    },
    invalidate,
    clear,
    stats: () => ({
      name,
      entries: lru.size,
      bytes: lru.calculatedSize,
      maxBytes,
      ...counters,
    }),
    dispose() {
      clear();
      unregisterCache(cache);
    },
  };
  registerCache(cache);
  return cache;
}
