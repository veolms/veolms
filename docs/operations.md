# API operations notes

Operational knobs and duties introduced by the 2026-10 performance &
reliability work (see `PERFORMANCE_AUDIT.md` for the measurements behind
them). Everything here applies to `apps/api`.

## Health endpoints

| Endpoint         | Meaning                                                                                                                                                                                                                             |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /v1/health` | Liveness only — process accepts requests. Does **not** touch the database.                                                                                                                                                          |
| `GET /v1/ready`  | Readiness — pings PostgreSQL (`503` when unreachable). Use this for load-balancer readiness and the deploy health check (`API_HEALTHCHECK_URL`), since `/health` reports ok even while every request is stuck on an exhausted pool. |

## Database pool (per process)

Defaults are safe for one API instance against a small database. Size
`DATABASE_POOL_MAX` against the database's connection limit **times the
number of processes** (API instances + notification worker + job scripts).
On Neon, check the plan's connection limit / pooler mode first.

| Env                             | Default  | Notes                                                                                                    |
| ------------------------------- | -------- | -------------------------------------------------------------------------------------------------------- |
| `DATABASE_POOL_MAX`             | 10       | Max connections for this process's pool.                                                                 |
| `DATABASE_CONNECT_TIMEOUT_MS`   | 5000     | Fail fast instead of queueing forever on pool exhaustion.                                                |
| `DATABASE_STATEMENT_TIMEOUT_MS` | 30000    | Server-side bound per statement. Migrations/reset disable it themselves.                                 |
| `DATABASE_APPLICATION_NAME`     | `veolms` | Shows in `pg_stat_activity`; entry points set their own (`veolms-api`, `veolms-notification-worker`, …). |

## Notification delivery

The outbox/email processor runs **inside the API process by default**
(`NOTIFICATION_INLINE_WORKER=true`, cycle every
`NOTIFICATION_INLINE_INTERVAL_SECONDS`, default 5s). Nothing else in the
repo or deploy pipeline schedules the standalone worker, so without this,
notifications and emails simply never flow.

Running it in every replica — or alongside the dedicated
`pnpm notifications:watch` process — is safe: claims use
`FOR UPDATE SKIP LOCKED` with a lease, attempts count at claim time, and
every status write is fenced on the claim's lease. If you prefer a
dedicated worker process, set `NOTIFICATION_INLINE_WORKER=false` and run
`notifications:watch` under systemd/pm2.

## Ops heartbeat

Once per `OPS_HEARTBEAT_SECONDS` (default 60, `0` disables) the API logs a
single structured line (`job: "ops-heartbeat"`):

```json
{
  "pools": [
    { "name": "veolms-api", "max": 10, "total": 5, "idle": 5, "waiting": 0 }
  ],
  "webhookQueue": { "unprocessed": 0, "dead": 0 },
  "outbox": { "pending": 0, "processing": 0, "failed": 0 },
  "emailBacklog": 0
}
```

Alert on: sustained `pools[].waiting > 0` (pool starvation), growing
`webhookQueue.unprocessed`, any `webhookQueue.dead` (payment events that
exhausted retries — inspect `webhook_events.error`, clear `dead_at` to
requeue), growing `outbox.failed`, or a growing `emailBacklog`.

## Retention scripts (still need external scheduling)

These are one-shot scripts that nothing schedules; run them from cron or a
systemd timer (weekly is fine):

```bash
pnpm purge:sessions        # sessions older than SESSION_RETENTION_DAYS (30)
pnpm purge:quiz-attempts   # expire overdue in-progress quiz attempts
pnpm purge:course-deletions
```

Webhook events (processed, >30 days) and processed outbox events are
cleaned automatically by the in-process schedulers.

## Performance-related env added in this work

| Env                                    | Default | Purpose                                                                                                                                            |
| -------------------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SESSION_AUTH_CACHE_TTL_MS`            | 10000   | Per-request auth context cache; `0` disables. Revocation/MFA changes evict immediately in-process; cross-instance staleness is bounded by the TTL. |
| `NOTIFICATION_INLINE_WORKER`           | true    | See above.                                                                                                                                         |
| `NOTIFICATION_INLINE_INTERVAL_SECONDS` | 5       | Inline processor cycle.                                                                                                                            |
| `OPS_HEARTBEAT_SECONDS`                | 60      | Ops gauge interval; `0` disables.                                                                                                                  |

## Migration notes

- Index migrations run as plain `CREATE INDEX` (transactional migrations
  preclude `CONCURRENTLY`). On a database where the affected tables are
  already large, create the indexes manually with
  `CREATE INDEX CONCURRENTLY` first — the migrations use `IF NOT EXISTS`
  and will skip them.
- `payments_active_order_unique` intentionally fails if an order already
  has two concurrently-active (`initiated`/`processing`) payment rows —
  that duplication is the corruption it prevents; resolve such rows
  manually before migrating.
