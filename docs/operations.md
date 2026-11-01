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

# Discussion uploads that were never attached to a post, older than
# DISCUSSION_UPLOAD_ORPHAN_RETENTION_DAYS (7), and mentioned by no post, note,
# lesson or course text. Reports only; add "-- --apply" to remove them.
pnpm --filter @veolms/api purge:discussion-uploads
```

Webhook events (processed, >30 days) and processed outbox events are
cleaned automatically by the in-process schedulers.

### Discussion uploads: optional in-process purge

Instead of scheduling `purge:discussion-uploads` externally, the API can run
the same removal itself. It is **off by default**, because it deletes stored
files:

| Env                                       | Default | Notes                                                                                                                      |
| ----------------------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------- |
| `DISCUSSION_UPLOAD_PURGE_INTERVAL_HOURS`  | 0       | `0` = never runs. `1`–`168` = the API removes abandoned uploads 30 seconds after it starts and then every that many hours. |
| `DISCUSSION_UPLOAD_ORPHAN_RETENTION_DAYS` | 7       | How old an unattached upload must be before either the script or the in-process purge may remove it.                       |

What it removes is exactly what the script removes with `--apply`: uploads
attached to no thread, reply or note, older than the retention days, and
mentioned by no post, note, lesson or course text. At most 1000 uploads per
run; the rest go on the next run. The row is kept, marked `deleted`.

Each run logs one line with `job: "discussion-upload-retention"` and the
counts (`examined`, `referenced`, `removable`, `removableBytes`, `skipped`,
`failed`). The line is a warning when `failed > 0` (files that could not be
removed; they are tried again next run). To see what a run would remove
before turning it on, run the script without `--apply`.

Every API instance runs its own timer; that is safe (an upload's row is
claimed before its file is removed). In production the purge does not start
without `STORAGE_ACCESS_KEY_ID` and `STORAGE_SECRET_ACCESS_KEY`, and says so
in the log, for the same reason the script refuses `--apply` without them.

## Two-factor lockout (break-glass reset)

Someone who has lost their passkey or authenticator app signs in with one of
the backup codes issued when the factor was set up. When those are gone too,
nothing a signed-out visitor can reach removes a factor — the sign-in first
step is a code sent to the mailbox, so a mailbox-based reset would make the
second step worthless. The way back in is an operator, after confirming out
of band that the request comes from the account's owner:

```bash
pnpm --filter @veolms/api user:mfa-reset <email-or-phone>   # asks to confirm
pnpm --filter @veolms/api user:mfa-reset <email-or-phone> --yes
```

It removes the account's passkeys, authenticator app and backup codes and
ends all its sessions. Administrators and instructors are asked to set up
two-factor again on their next sign-in; other accounts sign in with the first
step alone. Run it on the API host so it reads that environment's `.env`.

## Changing MFA_ENCRYPTION_KEY

`MFA_ENCRYPTION_KEY` encrypts authenticator-app secrets
(`user_totp_credentials.secret_encrypted`) and creator gateway credentials
(`creator_payment_configs.encrypted_key_id`, `encrypted_key_secret`,
`encrypted_webhook_secret`). Changing it in `.env` alone makes all of them
unreadable: authenticator sign-in returns 500. Re-encrypt first, with the API
stopped:

```bash
OLD_MFA_ENCRYPTION_KEY=… NEW_MFA_ENCRYPTION_KEY=… \
  pnpm --filter @veolms/api encryption-key:rotate --dry-run   # counts only
OLD_MFA_ENCRYPTION_KEY=… NEW_MFA_ENCRYPTION_KEY=… \
  pnpm --filter @veolms/api encryption-key:rotate             # asks to confirm
```

It rewrites every value in one transaction and writes nothing if any value
fails to decrypt with the old key. Then set `MFA_ENCRYPTION_KEY` to the new key
and start the API. To undo, run it again with the keys swapped (add
`--allow-shipped-default` if the old key was the shipped default). Back up the
database first; dumps taken before the change still hold values encrypted
with the old key.

## Performance-related env added in this work

| Env                                    | Default | Purpose                                                                                                                                                                                           |
| -------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SESSION_AUTH_CACHE_TTL_MS`            | 30000   | Per-user caches: sign-in, roles behind permission checks, side navigation; `0` disables. Revocation, role and MFA changes clear them in every process at once; the TTL bounds a lost bus message. |
| `COURSE_CACHE_TTL_MS`                  | 30000   | Public course content cache (signed-out overview, curriculum, version); `0` disables, max 30000. Course writes evict in-process; other instances within the TTL.                                  |
| `CACHE_ENABLED`                        | true    | Every process-local cache; `false` sends every read to the database. See docs/caching.md.                                                                                                         |
| `CACHE_BUS_ENABLED`                    | true    | Cross-process cache invalidation over Postgres LISTEN/NOTIFY (one connection per process).                                                                                                        |
| `NOTIFICATION_INLINE_WORKER`           | true    | See above.                                                                                                                                                                                        |
| `NOTIFICATION_INLINE_INTERVAL_SECONDS` | 5       | Inline processor cycle.                                                                                                                                                                           |
| `OPS_HEARTBEAT_SECONDS`                | 60      | Ops gauge interval; `0` disables.                                                                                                                                                                 |

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
- `20261013100000-shorten-legacy-user-names` and
  `20261013110000-lowercase-user-emails` change account data and cannot be
  undone. The first cuts usernames over 30 characters and display names over
  100 (accounts that could not sign in or have their profile opened), so the
  affected accounts get a new username and profile address. The second
  lower-cases emails stored with capitals by an older Google/GitHub sign-in,
  except where another account already holds the same address in another
  spelling: those are left alone and need a person to decide which account
  is the real one. Checks 5 and 6 in `docs/audit-pre-push-checks.sql` count
  what each will touch and what will be left; run them first.
