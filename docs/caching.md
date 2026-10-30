# Caching

The API keeps data that is read often and changes rarely in process memory.
Every cache is built on `createCache` from `@veolms/api-core`, so they all
behave the same way and are cleared, measured and switched off in one place.

## How it fits together

```text
write committed ──► invalidateCache(["course:<id>"])
                        │
                        ├─► every cache in this process drops entries tagged course:<id>
                        └─► cache bus ──► Postgres NOTIFY veolms_cache
                                              │
        every other API process (LISTEN) ◄────┘  drops the same entries
```

- **Caches** (`createCache`) are least-recently-used, bounded by bytes and
  entries, and expire entries after a TTL. Callers asking for a key while it
  loads share one load; a failed load is never kept.
- **Tags** label entries (`tags.ts`): `course:<id>`, `user:<id>`, `site`,
  `catalog`, ... One `invalidateCache(tags)` clears them in every cache.
- **The cache bus** (`bus.ts`) carries invalidations to every other process
  through Postgres LISTEN/NOTIFY: one listening connection per process, no
  other infrastructure. A process that loses that connection clears all of
  its caches when it reconnects, since it may have missed messages. TTLs stay
  as the bound if anything is lost.
- **Successful writes under `/courses/:id/...` and the site-wide routes** are
  invalidated automatically by api-core's factory
  (`detectSiteContentChange`). Anything else invalidates explicitly.

## Adding a cache

```ts
import { cacheTags, createCache } from "@veolms/api-core";

// Module level: one per kind of data, shared by every service instance.
const lessonOrder = createCache<OrderedLesson[]>({
  name: "courses.lesson-order", // unique; shows up in the ops heartbeat
  ttlMs: 5 * 60_000,
  maxBytes: 8 * 1024 * 1024,
});

export function getLessonOrder(courseId: string) {
  return lessonOrder.fetch(
    courseId,
    () => repo.listOrderedLessons(db, courseId),
    {
      tags: [cacheTags.course(courseId)],
    },
  );
}
```

After a write that changes it, once the transaction has committed:

```ts
invalidateCache([cacheTags.course(courseId)]);
```

From a process that is not an API server (CLI, one-shot job):

```ts
await publishCacheInvalidation(database, [cacheTags.course(courseId)]);
```

## Rules

1. **Invalidate after commit**, never inside the transaction: another process
   could reload the old data before the commit and keep it.
2. **Never cache** what decides money or access at the moment it is used:
   prices used to charge, coupons and their usage, orders, payments, refunds,
   idempotency keys, invoice numbers, gateway secrets, access grants and
   enrollments. Read those live.
3. **No signed URLs or tokens in a cache** unless the TTL is well under their
   lifetime; sign at response time instead.
4. **Cached values are shared**: never mutate one.
5. **Pick a TTL for the worst case** (a lost message): minutes for
   configuration and course content, seconds for anything that grants access.
6. Tests: `clearAllCaches()` between cases, or `CACHE_ENABLED=false`.

## Operations

| Env                 | Default | Effect                                                                                           |
| ------------------- | ------- | ------------------------------------------------------------------------------------------------ |
| `CACHE_ENABLED`     | true    | `false` sends every read to the database (diagnosing a suspected stale answer without a deploy). |
| `CACHE_BUS_ENABLED` | true    | `false` stops cross-process invalidation; other processes then see a change within each TTL.     |

The ops heartbeat logs `caches`: entries, bytes, hits, misses, loads,
evictions and invalidations per cache.

Each API process holds one extra database connection for the bus: size
`max_connections` for `processes × (DATABASE_POOL_MAX + 1)`. The bus needs a
direct or session-mode connection; behind a transaction-mode pooler, point
it at a direct URL or turn it off. Past a few dozen processes, the bus can
move to Redis pub/sub behind the same interface without touching any cache.
