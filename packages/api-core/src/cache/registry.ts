import type { CacheStats } from "./cache.ts";

/** What the registry needs from a cache. */
export interface RegisteredCache {
  readonly name: string;
  invalidate(tags: ReadonlySet<string>): void;
  clear(): void;
  stats(): CacheStats;
}

const caches = new Map<string, RegisteredCache>();
let enabled = true;
let broadcaster: ((tags: readonly string[]) => void) | null = null;
let scopeSource: (() => string | undefined) | null = null;

/**
 * Splits every cache by a scope the deployment chooses, read when a cache
 * is used (for example from an AsyncLocalStorage set per request). Entries
 * stored under one scope are never returned under another, and
 * `invalidateCache` called within a scope clears that scope's entries only.
 * An invalidation made outside any scope still clears every scope's
 * entries with those tags.
 *
 * Not set by default: there is one scope, and nothing changes.
 */
export function setCacheScope(source: (() => string | undefined) | null): void {
  scopeSource = source;
}

/** The scope caches use right now, if any. */
export function currentCacheScope(): string | undefined {
  const scope = scopeSource?.();
  return scope ? scope : undefined;
}

/** A tag as stored and invalidated within `scope`. */
export function scopedCacheTag(scope: string, tag: string): string {
  return `${scope}|${tag}`;
}

export function registerCache(cache: RegisteredCache): void {
  if (caches.has(cache.name)) {
    throw new Error(`A cache named "${cache.name}" already exists.`);
  }
  caches.set(cache.name, cache);
}

export function unregisterCache(cache: RegisteredCache): void {
  if (caches.get(cache.name) === cache) caches.delete(cache.name);
}

/**
 * Turns every cache off (or on again). Off, reads go straight to their
 * loader and nothing is kept; what was kept is dropped.
 */
export function configureCaches(options: { enabled: boolean }): void {
  enabled = options.enabled;
  if (!enabled) clearAllCaches();
}

export function isCachingEnabled(): boolean {
  return enabled;
}

/**
 * Clears every entry labelled with any of `tags`, in every cache of this
 * process and, through the cache bus when it runs, of every other process.
 * Call it after the change has committed: a process that reloads before
 * the commit would cache the old data again.
 */
export function invalidateCache(tags: readonly string[]): void {
  if (tags.length === 0) return;
  const scope = currentCacheScope();
  const sent = scope ? tags.map((tag) => scopedCacheTag(scope, tag)) : tags;
  applyCacheInvalidation(sent);
  broadcaster?.(sent);
}

/** Clears in this process only: what the bus does with a received change. */
export function applyCacheInvalidation(tags: readonly string[]): void {
  const tagSet = new Set(tags);
  for (const cache of caches.values()) cache.invalidate(tagSet);
}

/** Every entry of every cache in this process. */
export function clearAllCaches(): void {
  for (const cache of caches.values()) cache.clear();
}

/** Where invalidations are sent besides this process (the cache bus). */
export function setCacheBroadcaster(
  send: ((tags: readonly string[]) => void) | null,
): void {
  broadcaster = send;
}

export function getCacheStats(): CacheStats[] {
  return [...caches.values()].map((cache) => cache.stats());
}
