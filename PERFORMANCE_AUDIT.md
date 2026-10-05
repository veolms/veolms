# VeoLMS Backend & Database Performance, Scalability & Benchmark Audit

**Date:** 2026-10-05 · **Branch:** `fix/backend-database-performance` · **Scope:** `apps/api`, `packages/{database,config,api-core,storage,contracts}`
**Method:** full static audit of all 234 API routes, all 55 migrations and every repository, plus **measured benchmarks** against an isolated local environment (synthetic 10k-user dataset, separate `veolms_bench` database). No application code, schema, or dependencies were changed. One untracked SQL dataset generator and the benchmark harness live only in the session scratchpad.

Every claim is labeled **Measured**, **Observed** (from code/schema), **Estimated** (calculation with stated assumptions), or **Unknown**.

---

## 1. Executive Summary

### Current System Verdict

```text
Overall Rating:            55/100
Performance:               60/100  (fast p50s on user paths; pathological admin/analytics paths)
Scalability:               45/100  (pool of 10, single-replica-only pollers, unbounded fan-outs)
PostgreSQL:                55/100  (good keyset pagination + some perf migrations; ~20 missing hot-path indexes, no retention)
Reliability:               45/100  (solid idempotency in payments; confirmed refund-unit bug, webhook queue poison risk)
Production Readiness:      50/100  (fine at ≤ ~1k users; P0s must land before meaningful commerce volume)
```

Rubric: scores are anchored to the measured baseline below plus observed code evidence; a score ≥70 requires no P0/P1 finding in that area, ≥50 requires user-facing p50s under 250 ms at the tested scale, <50 means a confirmed defect or an unmitigated scaling cliff exists. Where production runtime evidence is missing (infrastructure, Neon sizing) the score reflects only what the repository shows.

**Direct answers:**

1. **How optimized is the backend today?** User-facing read paths are genuinely good: catalog p50 17 ms, auth'd `/me` p50 30 ms, notifications p50 55 ms at 25 concurrent connections on a 10k-user / 1M-progress-row dataset (Measured). Admin paths are not: students list p50 **1.13 s**, analytics dashboard p50 **7.0 s** on the same dataset (Measured).
2. **How scalable?** A single instance sustained **~1,000–1,100 RPS** on the public catalog and **~900 RPS** on authenticated `/me` with zero errors up to 250 connections (Measured, local). Throughput plateaus at ~10 connections — the default `pg.Pool` max of 10 is the ceiling; added concurrency only adds queueing latency. Horizontal scaling is currently **unsafe**: in-process pollers have no cross-replica locking (Observed).
3. **Current safe RPS:** ~500–800 RPS mixed authenticated reads at p99 < 300 ms on the test hardware, provided no analytics/students requests are in flight (Measured + Estimated). Production safe RPS: **Unknown** (production topology and DB sizing not in repo).
4. **Maximum stable tested RPS:** 1,092 RPS (catalog, c=50, 10 s, 0 errors); 14,936 RPS on `/health` (framework ceiling) (Measured).
5. **Estimated concurrency capacity:** ~250 concurrent in-flight requests tested without errors; latency is pure queueing beyond ~25. Mapped to users: ~2,500–5,000 concurrently _active_ users per instance for normal browsing mixes (Estimated, assumptions in §29).
6. **What limits scalability today?** In order: (a) `pg.Pool` max 10 with infinite acquire wait, (b) unindexed aggregate scans over `learning_progress` (1M-row seq scan measured at 118 ms _per aggregate_, ~30 aggregates per dashboard request), (c) 5–9 serial queries per authenticated request before any handler runs, (d) single-process background pollers, (e) zero metrics/observability.
7. **Top 10 bottlenecks/gaps:** §30.
8. **P0 issues:** §31 — refund unit mismatch (financial correctness), webhook queue poison/head-of-line/no-lock, payment re-initialization orphan-capture race, pool exhaustion with no timeouts.
9. **P1 issues:** §32.
10. **Fix first:** the four P0s, then the missing-index bundle + pool configuration (one day of work, measured 10–60× headroom on the worst endpoints).
11. **Realistic improvement:** students list and analytics are index/N+1 problems, not architecture problems. The measured 118 ms seq-scan aggregate becomes an index scan over ~1/3 of the table per course; with `learning_progress(course_id)` + batching the per-student user lookups, dashboard p50 of 7 s should drop to low hundreds of ms (Estimated — validate with the before/after plan in §36). Auth overhead per request can drop from 5 queries to 1–2 with a short-TTL session cache.
12. **Architecture changes actually necessary:** none structural. Keep Fastify + PostgreSQL + the layered pattern. Required changes are configuration (pool), indexes, job-claiming semantics (`FOR UPDATE SKIP LOCKED` on `webhook_events`), fan-out batching, and a scheduler/leader story for the pollers. Redis/queues/microservices are **not** justified by any measurement in this audit.

---

## 2. Scope, Evidence, and Limitations

**Benchmark environment (isolated, non-production):**

| Item               | Value                                                                                                                                                                                                                                                                  |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Host               | Windows 11, Intel i7-13620H (10C/16T), 15.7 GB RAM — developer laptop                                                                                                                                                                                                  |
| API                | Node 24.20.0 running `src/index.ts` directly (same as production per deploy workflow), Fastify 5.11.0, structured JSON logs (pretty logs off), `API_RESPONSE_DELAY_MS` unset                                                                                           |
| DB                 | PostgreSQL 18.6 (`postgres:18-alpine` in Docker, **no resource limits**, stock config, `max_connections=100`), dedicated `veolms_bench` database                                                                                                                       |
| Driver             | pg 8.23.1 via Kysely, default pool (max 10)                                                                                                                                                                                                                            |
| Dataset            | 10,001 users · 3 courses · 30 sections · 450 lessons · 17,500 enrollments · **1,000,000 learning_progress** · **500,000 notifications** · 1,001 sessions. Orders/payments/webhook tables ~empty (commerce write paths not load-tested — no gateway sandbox configured) |
| Tool               | autocannon (ephemeral via `pnpm dlx`), 3 s warm-up + 15 s measured runs unless noted                                                                                                                                                                                   |
| Auth               | Real session cookies (rows seeded with SHA-256 token hashes). `SKIP_ADMIN_MFA=true` for the admin-endpoint runs only (the bench admin has no TOTP enrolled); this _removes_ two MFA queries from admin requests, so admin numbers are slightly optimistic              |
| Email/SMS/payments | Console transport / not configured — no external side effects were possible                                                                                                                                                                                            |

**Limitations (all labeled Unknown where relevant):**

- Load generator, API and DB share one machine: network latency is near-zero (optimistic vs production), CPU is shared (pessimistic). Treat absolute RPS as relative/indicative, not as production capacity.
- The local `.env` points `DATABASE_URL` at a **Neon serverless Postgres pooler in ap-southeast-1** (Observed). That strongly suggests production runs on Neon. Neon was **not** benchmarked (shared environment — unsafe to load-test). Every serial query pays a WAN round trip there, which multiplies the 5–9-query-per-request auth cost; see §19/§29.
- Production API topology (instance count, CPU/RAM, proxy) is **Unknown** — the deploy workflow SSHes to a VM and restarts a systemd/pm2 service whose unit file is not in the repo (Observed).
- Soak and failure tests were not run (duration/safety); plans provided in §23–24. No SLOs exist in the repo; none were invented — status labels in §7 state their criteria.

---

## 3. Architecture Overview

Observed (verified against the checkout):

- pnpm 11 monorepo, Node ≥24 <25, Fastify 5.11, TypeScript executed directly via Node type-stripping (no build output), Kysely + pg against PostgreSQL (local compose: PG 18; production DB version Unknown — Neon per `.env`).
- Layered `Route → Controller → Service → Repository → PostgreSQL`, feature-first modules; 234 endpoints in 45 route files under `/v1` (Observed; inventory §5).
- **No Redis, no MongoDB, no message broker** — confirmed absent. All queues are PostgreSQL tables (`webhook_events`, `outbox_events`, `notification_deliveries`, `image_jobs`, `video_jobs`, course-deletion tables). Caching audit §20 covers the three small in-process caches that exist.
- Background work: payment-webhook poller (5 s) and commerce fulfillment scheduler (5 min) run **inside every API process**; the notification outbox/email worker and three retention scripts are separate one-shot/`--watch` processes that **nothing in the repo schedules** (Observed — operational gap).
- Integrations: Razorpay, Google/GitHub OAuth, SMTP (nodemailer pooled), MSG91/Vonage/Twilio SMS, S3-compatible storage + CDN worker with HMAC-signed URLs, AWS MediaConvert/Lambda/HTTP fleet dispatch, GitHub Actions static-page refresh.

## 4. System Performance Map

```text
Client ──> (production proxy: Unknown, not in repo) ──> Fastify API  [every replica also runs:
   │                                                     payment-event poller (5s),
   │  per request:                                       fulfillment scheduler (5min),
   │  cookie → sessions lookup (1q)                      static-page refresh queue (in-memory)]
   │  → users selectAll (1q)
   │  → TOTP? + roles + passkey count (3q parallel)
   │  → [authorize(): scope + feature + 2 perm q]
   │  → handler → service → repository → pg.Pool(max 10) → PostgreSQL
   │                       └─> Razorpay / OAuth / SMTP / S3 / MediaConvert  (mostly NO timeouts)
   │
Async paths (all PostgreSQL-backed):
   Razorpay webhook → webhook_events insert → in-process poller (no lock/claim) → fulfillment txn
   Domain event → outbox_events (dedupe_key) → notification worker (separate process, SKIP LOCKED + lease)
                → notifications + notification_deliveries → SMTP (serial, 50/cycle)
   Media upload → presigned PUT → confirm (S3 HEAD, ffprobe in-request) → video_jobs → MediaConvert → webhook
   image_jobs → enqueued on upload → **no consumer exists in this repo** (uploads stay "processing")
```

Per-authenticated-request DB cost: **5 queries in 3 serial round trips** before any handler; **8–9** on `authorize()` routes (Observed: `session.service.ts:205-275`, `authorization.repository.ts:24-80`). Measured end-to-end as `/auth/me` p50 30 ms local; on a WAN DB each serial round trip adds RTT (Estimated impact §29).

## 5. API Inventory

234 endpoints across 17 modules (auth 38, commerce 41, courses 42, discussions 50, quizzes 27, media 13, notifications 8, analytics 3, students 2, remainder small). The full per-route table (method, path, auth, pagination) was compiled during the audit; the operative classification:

- **Latency-critical, high-frequency:** session auth (every request), `/auth/me`, catalog + course overview, playback bootstrap/token, lesson feed, notifications list/summary, learning-progress GET/batch.
- **Business-critical, low-frequency:** checkout, payment verify, Razorpay webhook, refunds, enrollment grant.
- **Operationally dangerous:** `/analytics/*` (measured 7 s), `/students` (measured 1.1 s), quiz analytics (worst N+1: assignments × students queries, Observed `quizzes/analytics/analytics.service.ts:68-189`).
- **Unbounded (no LIMIT) endpoints (Observed):** `GET /courses` when `limit` omitted (optional in the contract, `contracts/src/course/course.ts:123`), `/courses/mine`, `/courses/creator/:id`, `/courses/options`, `/categories`, `/bundles`, `/bundles/manage`, `/manual-payments{,/my}`, `/refund-requests{,/my}`, `/refunds/order/:id`, `/enrollments/courses`, `/access/users/:id/grants`, `/auth/sessions`, `/auth/me/avatars`, all quiz lists, `/courses/:id/includes`.
- **Rate-limited routes: exactly two** (`/auth/otp/send` 5/min, `/auth/oauth/google/one-tap` 10/min). Login, register, OTP/TOTP verify, passkeys, webhooks, uploads: none (Observed `factory.ts:198-206`, route files).

## 6. Current Performance Baseline (Measured)

Single instance, c=25, 15 s runs, zero errors/timeouts in every row. All values ms.

| API / Workflow                                                            |    Req/s |   min |       p50 |   p75 |   p90 | p97.5 |   p99 |   max | non-2xx |
| ------------------------------------------------------------------------- | -------: | ----: | --------: | ----: | ----: | ----: | ----: | ----: | ------: |
| GET /health (framework ceiling)                                           |   14,936 |     1 |         1 |     1 |     2 |     2 |     3 |    20 |       0 |
| GET /courses?limit=20 (public)                                            |    1,395 |    11 |        17 |    19 |    21 |    24 |    26 |   168 |       0 |
| GET /home/discovery (public)                                              |      382 |    35 |        61 |    69 |    82 |    93 |   102 |   151 |       0 |
| GET /auth/me (auth'd)                                                     |      579 |    18 |        30 |    47 |    81 |   115 |   175 |   234 |       0 |
| GET /notifications?limit=25                                               |      400 |    40 |        55 |    63 |    84 |   133 |   175 |   292 |       0 |
| GET /notifications/summary                                                |      238 |    45 |        83 |   111 |   183 |   279 |   364 |   476 |       0 |
| GET /learning-progress/:course                                            |      120 |   123 |       193 |   232 |   290 |   369 |   421 |   479 |       0 |
| GET /courses/:slug/overview                                               |      136 |    95 |       159 |   178 |   253 |   469 |   541 |   659 |       0 |
| GET /enrollments/courses                                                  |      312 |    49 |        74 |    86 |   101 |   133 |   180 |   265 |       0 |
| GET /orders?limit=20 (admin; **orders table empty** — not representative) |      630 |    27 |        35 |    41 |    56 |    72 |    83 |   146 |       0 |
| GET /students?limit=50 (admin)                                            | **20.9** |   433 | **1,126** | 1,212 | 1,350 | 1,459 | 1,478 | 1,486 |       0 |
| GET /analytics/dashboard (admin)                                          |  **3.2** | 4,940 | **7,010** | 7,472 | 8,021 | 8,382 | 8,466 | 8,466 |       0 |
| GET /analytics/admin/overview                                             |  **3.2** | 4,994 | **6,144** | 6,360 | 6,564 | 6,704 | 6,820 | 6,820 |       0 |
| POST /learning-progress/:course/batch (write)                             |      114 |     — |       185 |     — |   351 |     — |   578 |   624 |       0 |

Write caveat: the batch-write run used one user, so all 25 connections upserted the same row (row-lock contention). Real multi-user heartbeats should be somewhat faster per request (Estimated).

**Benchmark report table (per audit template):**

| Metric                                |                                     Current | Evidence                                    | Status             |
| ------------------------------------- | ------------------------------------------: | ------------------------------------------- | ------------------ |
| Average RPS (mixed read plateau)      |                                  ~900–1,100 | ramp table §8                               | Measured (local)   |
| Peak tested RPS                       |                            14,936 (/health) | autocannon c=10                             | Measured           |
| Max stable tested RPS (real endpoint) |                       1,092 (catalog, c=50) | §8                                          | Measured           |
| P50 / P90 / P99 (per endpoint)        |                                 table above | autocannon                                  | Measured           |
| Error rate                            |                              0% up to c=250 | §8                                          | Measured           |
| CPU                                   | PG ~373% (of 1600%), Node single-core-bound | docker stats / PS sample under c=100        | Measured (spot)    |
| Memory / RSS (API)                    |                          ~397 MB under load | PS sample                                   | Measured (spot)    |
| PostgreSQL connections                |                     10 (pool cap) + workers | pg_stat_activity: 4 active/7 idle at sample | Measured           |
| PG query latency                      |                             per-plan in §11 | EXPLAIN ANALYZE                             | Measured           |
| Pool wait                             |         not instrumented (no metric exists) | —                                           | Unknown            |
| Worker throughput/backlog             |                       queues empty in bench | —                                           | Unknown (plan §18) |
| Event-loop delay                      |                            not instrumented | —                                           | Unknown            |
| Cache hit rate                        |               only 3 tiny in-process caches | §20                                         | N/A                |

## 7. API Latency Benchmark — interpretation

No SLOs are defined in the repo (Observed), so statuses below use these audit criteria: **Good** = p99 < 250 ms at c=25 on the bench dataset; **Acceptable** = p99 < 600 ms; **Needs Optimization** = p50 > 250 ms or p99 > 600 ms; **Critical** = p50 > 1 s.

| Endpoint                                                                             | Status       | Dominant cost (evidence)                                                                                                                                                 |
| ------------------------------------------------------------------------------------ | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| health, courses, home/discovery, auth/me, notifications, orders, enrollments/courses | Good         | DB round trips; catalog runs 5 correlated subqueries/row but stays fast at 3 courses — cost grows with catalog size (Observed)                                           |
| notifications/summary                                                                | Good→watch   | 5 `count(*) FILTER` over all the user's notifications per call, no retention ⇒ degrades forever (Observed; plan: index-only now, 14 ms measured)                         |
| learning-progress GET, course overview, progress write                               | Acceptable   | 10–15 serial queries/request incl. `selectAll` course + all lessons (Observed)                                                                                           |
| students                                                                             | **Critical** | correlated per-user count/avg subqueries computed as sort keys + `countTotalStudents` with 3 EXISTS per page (Observed `students.repository.ts:102-113,240-262,273-382`) |
| analytics dashboard / overview                                                       | **Critical** | ~30 parallel aggregates incl. repeated 1M-row seq scans (measured plan §11) + full course N+1 media hydration just to get ids (Observed `analytics.service.ts:258-301`)  |

Long-tail note: auth/me p99 (175 ms) is 6× its p50 — that is pool-queueing, not query variance (the same query mix at c=10 shows p99 18 ms, §8).

## 8. Throughput and RPS (Measured)

Concurrency ramp, 10 s per step, zero errors at every step:

| Conc | catalog RPS | catalog p50/p99 | /auth/me RPS | /auth/me p50/p99 |
| ---: | ----------: | --------------- | -----------: | ---------------- |
|   10 |       1,004 | 9 / 17          |          893 | 10 / 18          |
|   50 |       1,092 | 44 / 64         |          908 | 52 / 79          |
|  100 |         983 | 96 / 202        |          813 | 105 / 273        |
|  250 |       1,056 | 230 / 318       |          918 | 248 / 734        |

- **Saturation point: ~10 connections.** Throughput is flat from c=10 to c=250 while latency grows linearly with concurrency ⇒ requests queue on the 10-connection pool (and Node's single event loop); the DB server itself had idle headroom (16 vCPU host, PG at ~23% of total during c=100).
- **Breaking point: not reached** on this hardware up to c=250 (no errors, no timeouts) — the failure mode is latency, and with `connectionTimeoutMillis=0` (Observed, pg default) requests would wait on the pool forever rather than shed load.
- **Interference test (Measured):** with just **5** concurrent `/analytics/dashboard` requests running, `/auth/me` at c=10 collapsed from 893 RPS / p50 10 ms to **92 RPS / p50 78 ms / p99 417 ms** — a ~10× degradation of every other user's traffic from one admin tab auto-refreshing. This is the single most important measured scalability fact in this audit.

## 9. Concurrent User Capacity — see §29 for the full model.

## 10. PostgreSQL Database Analysis

- PG 18.6 in the bench; production version/sizing **Unknown** (Neon per `.env`; Neon pooler imposes its own connection-count and `max_connections` semantics — must be confirmed before raising pool sizes).
- Schema quality is generally high: uuid PKs, proper FKs, unique constraints guarding idempotency (orders.idempotency_key, payments gateway ids, enrollments (user,course), outbox dedupe_key, webhook (provider,event_id)), keyset pagination nearly everywhere, and 9 dedicated performance migrations already landed (student list, orders, analytics, quiz read paths, catalog pagination, playback order) (Observed).
- `allowUnorderedMigrations: true` with duplicated filename prefixes (007/008/010/014 twice) and **no `CONCURRENTLY`** on any index build — index migrations on large tables will take write locks during deploys (Observed).
- **Schema drift (Observed):** `video_jobs.video_metadata` is written by `media.repository.ts:181-188` but no migration creates the column (`008-add-hardware-sizing` is a no-op). Works only if the column was created manually — verify production schema.
- Connection math: each process = its own pool of 10 (API, notification worker, each retention script, each CLI). 1 API + 1 worker = 20 potential connections; local PG default 100 is fine; **Neon pooler limits Unknown**.

## 11. Query, Index, and Migration Analysis

**Measured plans (EXPLAIN (ANALYZE, BUFFERS), bench dataset, warm-ish cache):**

| Query shape                                                                          | Plan                                                              |            Time | Verdict                                                                                                              |
| ------------------------------------------------------------------------------------ | ----------------------------------------------------------------- | --------------: | -------------------------------------------------------------------------------------------------------------------- |
| `learning_progress WHERE course_id=? GROUP BY user_id` (analytics core)              | **Parallel Seq Scan 1M rows**, 133k rows/worker removed by filter |      **118 ms** | Missing `learning_progress(course_id, …)` — every index leads with user_id. Dashboard runs many of these per request |
| notifications summary (user, 50 rows of 500k)                                        | Bitmap scan on `idx_notifications_recipient_created`              |           14 ms | OK today; unbounded growth without retention                                                                         |
| `sessions WHERE user_id=? …`                                                         | **Seq Scan** (only pkey + token_hash indexes exist)               | 1.5 ms @1k rows | Degrades linearly; also hits `purgeOldSessions`                                                                      |
| `webhook_events WHERE processed_at IS NULL ORDER BY created_at LIMIT 10` (every 5 s) | **Seq Scan + Sort**                                               |   <1 ms @0 rows | No index, no retention ⇒ this is a time bomb: the poll degrades as the table grows forever                           |

**Missing hot-path indexes (Observed, cross-referenced repository queries vs migrations; priority order):**

1. `passkeys(user_id)`, `user_totp_credentials(user_id)` — queried on **every authenticated request** (`mfa.repository.ts:25-36,173-184`); `sessions(user_id)` + purge index on `(expires_at)`/`(revoked_at)`.
2. `learning_progress(course_id)` (ideally `(course_id, updated_at)`) and `(lesson_id)` — analytics, active-learner counts, FK cascade checks.
3. `webhook_events(created_at) WHERE processed_at IS NULL` (partial).
4. `otp_codes(identifier, identifier_type, purpose, created_at)` usable by the throttle queries — `hasOtpSince`/`countOtpsSince` can't use the partial `otp_codes_lookup` (no `consumed_at` predicate) and seq-scan on every OTP send (Observed `otp.repository.ts:110-152`).
5. `access_grants(course_id, status)`; `enrollments(order_id)`; `orders(coupon_id)`; partial `orders(status, expires_at)`, `payments(status, created_at)`, `refunds(status, created_at)` for the three pollers.
6. `learning_notes(course_id/lesson_id, created_at)` — lesson feed note branch runs per discussion page view with no usable index; `learning_likes(target_type,target_id)`; `learning_bookmarks(note_id)/(thread_id)`; `order_items(course_id)`, `course_bundle_items(course_id)` (RESTRICT FKs that seq-scan on course delete); `role_assignments(course_id)`; audit/report list indexes.
7. Mention typeahead: `lower(display_name)/lower(username) LIKE '%q%'` defeats the existing GIN trgm index (built on raw columns) — per-keystroke seq scan of users (Observed `engagements.repository.ts:221-260`). Use ILIKE (trgm-compatible) or add `lower()` expression GIN.

**~15 redundant indexes** (single-column prefixes of composites: course_sections, course_lessons, enrollments, order_items, quizzes ×2, quiz_questions/options/assignments/attempts, `idx_learning_progress_user_course` ⊂ the unique, user_avatars trio, low-selectivity status indexes) — write amplification for no read benefit (Observed).

## 12. N+1 Analysis (all Observed, with request-math)

| Path                            | Shape                                                                                                                                | Cost at N                                                                                                                                    |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| **Quiz analytics** `course()`   | per assignment: participant list + **one `findUserById` per student** (`analytics.service.ts:57-102,141-189`)                        | assignments × (4 + students) queries; a 10-assignment course with 1,000 students ≈ **10,040 concurrent queries** into a pool of 10           |
| Analytics overview/dashboard    | `resolveCoursesInScope` → full `listMyCourses` N+1 media hydration (≤5 q/course) just to get ids                                     | 30 courses ≈ 150 queries before the 30 aggregates                                                                                            |
| `/courses/mine`, `/creator/:id` | unbounded course list, then ≤5 media queries per course concurrently                                                                 | 100 courses ≈ 500 concurrent queries                                                                                                         |
| Notification fan-out            | per recipient: `findRecipient` + per-channel preference + 2 inserts, **all in one transaction** (`notifications.service.ts:240-325`) | `course.published` to 10k enrollees ≈ **~40k statements in one txn** — exceeds the 300 s lease ⇒ reclaim ⇒ duplicate processing (no fencing) |
| Bundles list                    | `hydrateBundle` per bundle; create/update `findCourseById` per course serially                                                       | 1+2N                                                                                                                                         |
| `/me/quizzes`                   | `findCourseById` (selectAll) per distinct course + unbounded attempts selectAll                                                      | 1+N                                                                                                                                          |
| Curriculum/includes reorder     | one UPDATE per item serially in txn                                                                                                  | N round trips holding the txn                                                                                                                |

Fixes are standard: bounded `IN` batches / joins for user+course lookups, chunked fan-out transactions, a single `UPDATE … FROM (VALUES …)` for reorders. DataLoader-style machinery is not needed.

## 13–16. Application Runtime / Event Loop / Memory / CPU

- **Measured:** under c=100 catalog load, the Node process sat ~397 MB RSS; PostgreSQL consumed ~373% CPU (of 1600%) running the correlated-subquery catalog plan — the system is **DB-CPU-bound on query shape**, not Node-bound. Event-loop delay/ELU were not instrumented (Unknown; add `@fastify/under-pressure` or `perf_hooks.monitorEventLoopDelay` — §28).
- **CPU risks in handlers (Observed):** Zod response serialization is a full `safeEncode` pass per response (not fast-json-stringify) — material on the 57 KB course-overview payloads (measured avg response ≈ 57 KB = 7.7 MB/s ÷ 135 req/s); the global `onSend` hook regex-tests every mutation URL and **JSON.parses the full response body** of course mutations (`factory.ts:120-130`); ffprobe (`execFile`, ≤15 s) and OAuth avatar download+S3 upload run inside request paths.
- **Memory risks (Observed):** multipart uploads buffered fully in memory via `toBuffer()` with a 50 MB cap ⇒ 20 concurrent uploads can hold ~1 GB; static-page-refresh in-memory Maps never pruned; SSE progress stream polls DB every 1.5 s per connection with no max duration.
- **Serial awaits of independents (Observed):** invoice (4), lesson feed preamble (3), `listAccessibleCourseIds` (3), editor's 3 serial batches, login's duplicated `getUserRoles`. Each costs one extra DB RTT — cheap locally, expensive on Neon.

## 17. Connection Pool Analysis

Observed (`packages/database/src/client.ts:367-383`): `new Pool({ connectionString })` — **all defaults**: max 10, idle 10 s, `connectionTimeoutMillis = 0` (wait forever), no statement/query timeout, no `application_name`, no keepAlive. Every process builds its own pool; in-process pollers share the API pool with HTTP traffic. Shutdown is correct (`app.close()` → poller stop → `database.destroy()`, 10 s force-exit).

Measured consequences: the c≥10 throughput plateau (§8) and the 10× analytics interference. Single analytics requests burst 12–30 concurrent queries (Observed `analytics.service.ts:432-499`), i.e. **one request can consume the entire pool**; with no acquire timeout, everything behind it waits indefinitely and nothing records that it happened.

Recommended (validate against Neon limits first): explicit `max` sized to the DB (API ≈ 20–30/instance on a dedicated PG; on Neon pooled connections follow Neon guidance), `connectionTimeoutMillis` 2–5 s, `statement_timeout` 10–30 s via pool options, `application_name` per process, and pool metrics (pg exposes `pool.totalCount/idleCount/waitingCount`) — §28.

## 18. Background Job and Queue Analysis

| Queue                                                                                          | Claiming                                                 | Retry/poison                                                                                                                                                        | Retention                                          | Multi-replica                                                                               | Verdict                                                                                                                                                                          |
| ---------------------------------------------------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `webhook_events` poller (5 s, in-API)                                                          | **None** — plain `SELECT … LIMIT 10 ORDER BY created_at` | error column only; **retries every 5 s forever, no attempt cap**; 10 permanently failing rows = **head-of-line blockage of all payment fulfillment**                | none; no processed_at index                        | **double-processes** (handler gates absorb most, but `refund.succeeded` has no status gate) | **P0**                                                                                                                                                                           |
| `outbox_events` → notification worker (separate proc)                                          | `FOR UPDATE SKIP LOCKED` + 300 s lease ✅                | schedule 60/300/1800/7200 s, max 5 ✅; but mark-ops are **not fenced** to the lease holder, and `attempt_count` only increments in the catch path (crash loop risk) | processed >30 d only; **failed rows kept forever** | safe except lease-expiry duplicates                                                         | P1                                                                                                                                                                               |
| `notification_deliveries` (email)                                                              | same ✅                                                  | same; serial SMTP 50/cycle + 3 s sleep                                                                                                                              | **none** (stores full email HTML as jsonb)         | safe-ish                                                                                    | P1 — drain math below                                                                                                                                                            |
| Fulfillment scheduler (5 min, in-API): order-expiry / payment-recovery / refund-reconciliation | none (conditional UPDATEs only)                          | recovery: silently abandons captured-but-unfulfilled payments after 24 h                                                                                            | n/a                                                | every replica duplicates gateway calls                                                      | P1 (P0 via the refund bug §31)                                                                                                                                                   |
| `image_jobs`                                                                                   | SKIP LOCKED claim exists                                 | no lease ⇒ stuck `processing` forever on crash                                                                                                                      | none                                               | —                                                                                           | **no consumer exists in the repo** — uploaded images never finish processing (Observed)                                                                                          |
| course-deletion jobs                                                                           | SKIP LOCKED + 15 min lease ✅ backoff ✅                 | no max attempts                                                                                                                                                     | purged                                             | safe                                                                                        | Good                                                                                                                                                                             |
| Retention scripts (sessions/quiz/course) + notification worker                                 | —                                                        | —                                                                                                                                                                   | —                                                  | —                                                                                           | **nothing schedules them** (no cron in repo, deploy workflow doesn't run them) — notifications/email simply don't flow unless ops runs `notifications:watch` manually (Observed) |

**Producer vs consumer (Estimated):** webhook drain ≈ 2 events/s/replica when backlogged (10 per 5 s, serial fulfillment txns) — adequate for low sales volume, collapses under a flash-sale burst combined with any poison row. Email: 50/cycle serial ⇒ a 10k-recipient `course.published` takes **~10–80 min** to drain depending on SMTP latency, during which one outbox event's txn (~40k statements) likely outlives its lease.

## 19. External Dependency Analysis

Observed; provider latencies Unknown (no telemetry):

| Provider                             | Timeout                                                                           | Retry               | In request path?                                                   | Issues                                                                                                                                                                                                |
| ------------------------------------ | --------------------------------------------------------------------------------- | ------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Razorpay (fetch)                     | **none** (undici ~300 s default)                                                  | none                | checkout `createOrder`, verify `getPayment` — yes, outside txns ✅ | a hung gateway holds requests (and pool slots via surrounding code) for minutes                                                                                                                       |
| Google/GitHub OAuth                  | **none**                                                                          | none                | login path                                                         | same; plus avatar download+S3 upload on _every_ OAuth login (4 s timeout on avatar only)                                                                                                              |
| SMTP                                 | nodemailer defaults (~2 min connect)                                              | none                | **OTP send is synchronous in-request**                             | slow SMTP = slow/503 logins; OTP row deleted on failure ✅                                                                                                                                            |
| SMS chain                            | 4–5 s per provider ✅                                                             | sequential failover | OTP send                                                           | worst case ~14 s; duplicate-send on timeout-then-failover possible                                                                                                                                    |
| S3                                   | SDK defaults (3 attempts, no request timeout)                                     | SDK                 | presign/HEAD/stream                                                | `ensureBucketCors` sets bucket-wide `AllowedOrigins:["*"]` and re-issues `PutBucketCors` per presign on providers that reject it                                                                      |
| MediaConvert                         | none                                                                              | none                | **CreateJob synchronous in confirmUpload**                         | cancel sends the wrong job id (internal UUID) so AWS jobs are never cancelled; webhook secret placed in job UserMetadata                                                                              |
| GitHub Actions (page refresh)        | **no fetch timeout**; polls 2 s up to ~13.5 min per course, serialized, in-memory | —                   | fire-and-forget after response                                     | triggered by the URL regex for **any** 2xx mutation under `/courses/<uuid>` — including discussion posts, moderation and quiz-pricing (Observed `factory.ts:29-38`) — learner activity drives CI runs |
| Neon (prod DB, inferred from `.env`) | —                                                                                 | —                   | every query                                                        | per-query WAN RTT multiplies serial-query request costs; pooler connection limits must gate any pool-size change — **Unknown, measure first**                                                         |

## 20. Cache Analysis

Only three real in-process caches exist (Observed): order-stats (30 s TTL, 200 entries, in-flight dedupe — well built), link-preview (5 min/500), S3 CORS memo. Nothing caches sessions, roles/permissions, feature flags, the singleton `academy` row (queried on every discussion/quiz/order call), catalog, home discovery, or popular threads. No Redis — and none is needed yet: the measured bottlenecks are indexes and N+1s, not cacheable-read volume. The one cache with clear measured justification is a short-TTL (10–30 s) in-process session/user cache to cut the 5-query auth tax (invalidation risk is bounded by the TTL; revocation latency tradeoff must be accepted explicitly).

## 21. Large Dataset and Pagination Analysis

- Keyset/cursor pagination is used on every paginated list (Observed) — the right design; deep-page degradation testing therefore focused on the aggregates instead.
- The **only OFFSET** is playback's lesson-number→row mapping (bounded by course size; fine).
- Measured at 500k notifications: list p50 55 ms, summary p50 83 ms — healthy _because_ of `idx_notifications_recipient_created`; both degrade without retention as per-user history grows unboundedly.
- Measured at 1M progress rows: per-user paths fine (user-led indexes); any course-led aggregate seq-scans (§11).
- Unbounded endpoints (§5) return O(table) rows; `GET /courses` without `limit` is reachable anonymously (Observed) — a trivial resource-exhaustion vector given 1 MiB-free responses and no rate limit.
- `countTotalStudents`/per-page `count(*)` patterns (students, threads, notes, replies, moderation, workspace) each re-scan their filter set per page view; students' count was the measured 1.1 s offender.

## 22. Spike Test (partially run)

The c=10→250 step ramp (§8) is a bounded spike on this environment: no errors, no timeouts, latency = queueing only; recovery to baseline was immediate after each step (autocannon closes connections between runs). Breaking point not reached; pushing past 250 on a shared laptop measures the laptop, not the service. A production-like spike plan (10→500 RPS staged, stop on p99>1 s or errors>1%) is in §36.

## 23. Soak Test — **not run** (Unknown)

A ≥2 h soak was out of scope for this environment. Specific risks a soak must check, from observed code: static-page-refresh Maps (never pruned), SSE connections (no max duration), pooled SMTP transporter health, `webhook_events`/`outbox_events` growth under steady traffic, RSS creep under Zod serialization load. Plan: 2–4 h at 30–50% of plateau RPS with the §36 mix, sampling RSS/heap/ELU/pg table sizes every minute.

## 24. Failure and Recovery Analysis (code review; not fault-injected)

- **DB down/slow:** no statement timeout, infinite pool acquire wait, `/health` doesn't check the DB ⇒ instance reports healthy while every request hangs (Observed). Restart-under-load behavior Unknown.
- **Provider down:** no timeouts on Razorpay/OAuth/SMTP/MediaConvert ⇒ request threads hang to undici/OS defaults; OTP path returns 503 and cleans up ✅.
- **Worker crash:** outbox lease recovery works ✅, but `attempt_count` doesn't increment on crash-before-catch ⇒ infinite crash-loop on a poison event (Observed); `image_jobs` stuck `processing` forever (no lease).
- **Replica restart mid-webhook:** event stays unprocessed and is retried — safe ✅ (idempotent handler gates), except the ungated `refund.succeeded` path.
- **Graceful shutdown:** correctly ordered with a 10 s force-exit ✅; fulfillment scheduler `stop()` does **not** await an in-flight cycle ⇒ can hit a destroyed pool during deploys (Observed).

## 25. Edge Cases (each tied to a concrete path)

1. `GET /courses` with no `limit` → full-table response, anonymous (contract `course.ts:123`).
2. Poison webhook event → permanent 5 s retry loop + head-of-line blocking of payment fulfillment (`payment-event.queue.ts:125-169`).
3. `payment.succeeded` for a re-initialized order's _old_ gateway order → marked processed/skipped → **captured money, no fulfillment, no alert** (`payment.worker.ts:94-100`).
4. Course publish with 10k enrollees → single ~40k-statement outbox transaction → lease expiry → duplicate notifications (no fencing).
5. User with years of notifications → summary scans them all per header poll; no retention.
6. OTP throttle check-then-insert race → both pass; also throttle queries seq-scan `otp_codes` forever (no cleanup).
7. Registration advisory lock + `count(*)` over users → all signups serialized behind a full-table count (`authentication.service.ts:860-910`).
8. 20 concurrent 50 MB discussion uploads → ~1 GB heap (buffered `toBuffer()`).
9. Mention typeahead per keystroke → users seq scan (lower() defeats trgm index).
10. Admin opens analytics during peak → measured 10× degradation for everyone (§8).
11. HLS playback falling back to the API proxy path → several DB queries + S3 GetObject **per segment** through Node.
12. Learner posts a discussion message → matches the course-mutation regex → GitHub Actions workflow dispatched (`factory.ts:29-38`).

## 26. Security and Performance

- Session tokens are SHA-256 lookups (cheap, indexed ✅). No bcrypt/argon2 in the hot path (OTP/OAuth/passkey auth) — good for CPU.
- MFA/passkey checks add 2 queries per request (index gap §11); WebAuthn verification is per-login CPU, negligible at this scale.
- **Rate limiting is effectively absent** (2 routes only, in-memory store, per-replica; `TRUST_PROXY=false` default means behind any proxy all clients share one IP — keying breaks either way). Login/register/OTP-verify/TOTP-verify unlimited (Observed). This is simultaneously a security and a capacity problem; fixing it costs ~nothing.
- Signed CDN/media URLs are local HMAC (microseconds ✅). CSRF relies on SameSite=Lax + CORS; no token system to cost anything.
- No recommendation here weakens security; the OTP DB-side attempt caps are the safety net that must be preserved.

## 27. Infrastructure Analysis

Observed in repository: compose = Postgres only (no limits, no restart policy, stock config); **no Dockerfile/k8s/proc config for the API**; deploy = SSH + git checkout + `tsc --noEmit` + systemd/pm2 restart + `/v1/health` curl; web on Cloudflare/S3+CloudFront; media CDN worker config present but its `scripts/cdn-worker.js` is **missing from the repo**; `pnpm compose:up` referenced in docs doesn't exist.
Measured in test environment: §6–8. Unknown in production: instance count/size, proxy, PG sizing, autoscaling — all capacity statements about production are therefore Estimated or Unknown.
Bottleneck attribution from measurements: **PostgreSQL query shape** (students/analytics), then **application pool config**, then per-request **auth query tax**. Not network, not Node CPU, not infrastructure size — on this dataset.

## 28. Observability Analysis

Current: pino structured JSON (default level, Fastify default req logging), default `req-N` request ids, **no metrics, no tracing, no APM, no pool/queue/event-loop instrumentation, liveness-only health check** (Observed). Production performance is currently **unobservable**; most Unknowns in this report exist because of this.

Minimum set to resolve the audit's unknowns (smallest viable, no new stack):

1. Log-based: enable `pool.totalCount/idleCount/waitingCount` sampling (10 s interval log line), slow-query logging via `statement_timeout`+`log_min_duration_statement` (DB-side), per-route latency is already derivable from Fastify logs.
2. `@fastify/under-pressure` (ELU, heap, event-loop delay + load-shed) — one dependency, doubles as a readiness check.
3. Queue depth gauges: `webhook_events` unprocessed count, outbox pending/failed counts, delivery backlog — one cheap query each, logged by the pollers per tick.
4. A `/ready` endpoint that pings the DB.
   Full Prometheus/OTel can wait until these numbers motivate it.

## 29. Current Capacity Model

```text
Current Safe RPS (this hardware, mixed auth'd reads, no analytics): ~500–800   [Measured plateau × safety margin]
Current Maximum Stable Tested RPS: 1,092 (catalog, c=50, 0 errors)             [Measured]
Current Breaking Point: not reached at c=250; failure mode = unbounded queueing [Measured]
Estimated Safe Concurrent ACTIVE users per instance: ~2,500–5,000 (browse mix) [Estimated]
Estimated Max Concurrent: ~10,000 browsing-only, if no admin/analytics traffic [Estimated]
Estimated Supported DAU / MAU: see scenarios                                   [Estimated]
Primary Bottleneck: pg.Pool(10) + unindexed course-led aggregates              [Measured]
Confidence: high for relative ordering; low for absolute production numbers (topology Unknown)
```

Assumptions (stated per Rule 4): active user ≈ 0.05–0.1 req/s sustained (SPA with 30 s progress heartbeats + navigation); peak concurrent ≈ 5–10% of DAU; DAU ≈ 20–40% of registered for an active cohort LMS. Production on Neon adds per-query RTT: the 5-query serial auth chain alone would add ~3–5× the regional RTT to every request (Estimated; measure from the VM).

| Scenario      | Registered |     DAU | Peak conc. | Peak RPS | DB ops/s (×8–12) | Verdict                                                                                                                                                                                                                                                                                                       |
| ------------- | ---------: | ------: | ---------: | -------: | ---------------: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Very small    |        100 |      30 |        3–5 |       <1 |              <10 | Trivially supported (Measured headroom ≫)                                                                                                                                                                                                                                                                     |
| Small         |        500 |     150 |       8–15 |       ~1 |              ~10 | Supported                                                                                                                                                                                                                                                                                                     |
| 1,000         |      1,000 | 200–400 |      10–40 |      1–4 |            10–50 | Supported even with current defects, except commerce P0 risk                                                                                                                                                                                                                                                  |
| Medium 10,000 |     10,000 |    2–4k |    100–400 |     5–40 |           50–500 | Reads fine (measured at this dataset size). Risks: admin analytics (measured 7 s, pool starvation), 10k-recipient fan-outs (~hours of email drain), webhook table growth, no rate limits. Needs P0+P1                                                                                                         |
| Large 100,000 |    100,000 |  20–40k |       1–4k |   50–400 |           0.5–5k | **Not supported as-is.** Students/analytics scale linearly (≈11 s / 70 s extrapolated — Estimated), progress table ~10M+ rows, notifications ~5M+/mo with no retention, single-instance-only pollers block horizontal scale, pool/Neon limits unquantified. Requires the §35 roadmap + real staging load test |

## 30. Bottleneck Ranking (top 10)

| #   | Bottleneck                                                                                                             | Evidence                                           |
| --- | ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| 1   | `pg.Pool` default 10, infinite acquire wait, no statement timeout — whole-service queueing + measured 10× interference | Measured §8/§17                                    |
| 2   | Analytics endpoints: 1M-row seq-scan aggregates ×~30 + course N+1 preamble (p50 7 s @10k users, linear growth)         | Measured §6/§11                                    |
| 3   | Webhook queue: no lock/claim, no attempt cap, head-of-line blocking, no index/retention                                | Observed §18                                       |
| 4   | Students list correlated sort/count (p50 1.13 s @10k users)                                                            | Measured §6                                        |
| 5   | Per-request auth tax: 5–9 serial queries, 2 of them unindexed (passkeys/TOTP), uncached                                | Observed §4/§11; Measured /auth/me plateau 900 RPS |
| 6   | Notification fan-out: O(4N) single transaction, unfenced lease, 50-serial-email drain                                  | Observed §12/§18                                   |
| 7   | Missing-index bundle (sessions/otp/status columns/learning_notes/…)                                                    | Observed+plan-verified §11                         |
| 8   | No timeouts on Razorpay/OAuth/SMTP/MediaConvert; OTP email synchronous in-request                                      | Observed §19                                       |
| 9   | No rate limiting on auth surfaces + unbounded anonymous endpoints                                                      | Observed §5/§26                                    |
| 10  | Zero observability (no metrics, liveness-only health) — blocks diagnosing all of the above in production               | Observed §28                                       |

## 31. P0 Issues (confirmed, fix before scaling commerce traffic)

1. **Refund unit mismatch — financial correctness.** Reconciliation compares refunds in **paise** against `orders.total_amount` in **rupees** (`refund-reconciliation.worker.ts:151`); any refund ≥1% of the order is classified as a _full_ refund and `revokeAccessForOrder` runs. The admin item-refund default mixes units the other way (`refund.service.ts:184-188`), defaulting to 1/100 of the item price. The webhook `refund.processed` path can also take the _payment_ amount as the refund amount (`razorpay.gateway.ts:468`) and ignores `preserveAccess`, and webhook vs admin paths use different outbox dedupe keys ⇒ duplicate refund emails. Evidence: Observed, high confidence; validate with one sandbox partial refund.
2. **Webhook processing queue** (§18): add `FOR UPDATE SKIP LOCKED` claiming, an attempts column with capped backoff + dead-letter status, the partial index, retention — and stop burying `payment.succeeded` events whose payment row isn't found (currently marked processed; combined with the re-init race below this loses money silently, `payment.worker.ts:94-100`).
3. **Payment re-initialization race:** `payments.order_id` has no unique constraint; concurrent/repeat `initializePayment` creates multiple gateway orders and overwrites `gateway_order_id`; payment against the stale gateway order is captured but never fulfilled and never recovered (recovery checks only the current id). Observed (`payment.service.ts:129-188`, schema 010).
4. **Pool configuration as an outage vector:** one admin dashboard = full pool; infinite waits; no timeouts; no readiness check. Measured interference §8. Fix = explicit pool sizing + acquire/statement timeouts + DB-checking readiness (validate limits against Neon first).

## 32. P1 Issues

1. Missing-index bundle (§11 items 1–5) — includes the every-request passkey/TOTP lookups.
2. Analytics rewrite: add `learning_progress(course_id,…)`, replace the course-hydration preamble with an id-only query, batch per-course aggregates; same pattern for quiz analytics (batch user lookups) and students count/sort.
3. Notification pipeline: chunk fan-out transactions, fence mark-ops on lease ownership, increment attempts on claim, schedule the worker (it currently never runs unless started by hand), add retention for `notifications`/`notification_deliveries`/`webhook_events`/`otp_codes`/failed outbox rows.
4. External-call timeouts everywhere (AbortSignal ~5–10 s) + move OTP email to the outbox or a fire-and-wait with timeout; stop per-login OAuth avatar re-download.
5. Fulfillment scheduler: cross-replica leader/lock (e.g., `pg_advisory_lock`) before any multi-instance deploy; await in-flight cycle on stop; alert on payments abandoned at the 24 h recovery cutoff.
6. Rate limiting on login/register/OTP+TOTP verify/passkey endpoints; make `GET /courses` limit required/defaulted; bound the other §5 unbounded endpoints.
7. Short-TTL session/user auth cache (accepting bounded revocation latency) — biggest single cut to per-request DB load, especially on Neon RTTs.
8. Checkout idempotency 23505 race returns 500 (`checkout.service.ts:108,208`) — catch and return the existing order.

## 33. P2 Issues

Compression (57 KB overview payloads, no gzip/br — add `@fastify/compress` or proxy-level); `selectAll` over-fetch on users/courses/orders hot paths (notably `users.avatar_data_url` legacy blobs on every request); serialization double-work (envelope + Zod encode + `onSend` JSON.parse of course mutations); narrow the static-page-refresh URL matcher to actual course-content mutations and persist its state; stream multipart uploads (or presign direct like media); SSE max duration; `GET /media/:id/progress` writing on GET; redundant-index cleanup (§11); reorders as single statements; cache the `academy` singleton; `CONCURRENTLY` for future index migrations; registration advisory-lock + count(*) redesign when signup volume matters; schema-drift fix for `video_jobs.video_metadata`; MediaConvert cancel uses wrong job id; webhook secret out of job UserMetadata; SSRF guard's localhost allowance (shared with security review).

## 34. P3 Issues

Dead code (`apps/api/src/openapi.ts`, `middlewares/error.middleware.ts`); docs referencing nonexistent `pnpm compose:up`; missing `scripts/cdn-worker.js` for `wrangler.cdn.jsonc`; `callback_inbox` table unused; duplicate migration prefixes; low-selectivity status indexes; `application_name` on pools for debuggability.

## 35. Optimization Roadmap

**Phase 1 — P0 (before any traffic growth; ~3–5 dev-days):** §31 items. Each change is small and testable: a unit-normalization fix + tests on refund math; a claim/attempts/dead-letter migration + queue query change; a unique partial index on `payments(order_id) WHERE status IN (initiated,processing)` plus adopt-or-reject logic in `initializePayment`; a pool-options object + `/ready`. Contracts, auth and transaction boundaries untouched.
**Phase 2 — P1 (capacity; ~1–2 weeks):** index bundle (one migration, `CONCURRENTLY` on prod), analytics/students/quiz query rework, notification chunking+fencing+scheduling+retention, timeouts, rate limits, session cache. Success metrics: dashboard p50 < 300 ms on the bench dataset; students p50 < 150 ms; /auth/me plateau > 2,500 RPS locally; zero unbounded endpoints.
**Phase 3 — P2:** compression, serialization, upload streaming, cleanup. **Phase 4 — P3.**
For every item: evidence is cited above; benchmark-before/after per §36; behavior that must not change: API contracts in `@veolms/contracts`, auth/MFA/cookie semantics, payment idempotency gates, pagination ordering, retry semantics.

## 36. Before/After Benchmark Plan

Reproduce the baseline exactly (all commands non-destructive, local only):

1. `docker compose up -d` → `CREATE DATABASE veolms_bench` → `DATABASE_URL=postgresql://veolms:veolms@localhost:5433/veolms_bench pnpm db:migrate && … db:seed` → load the synthetic dataset (10k users / 1M progress / 500k notifications — generator SQL preserved from this audit; regenerate with `generate_series` inserts matching §2 counts).
2. Start: `DATABASE_URL=… API_PORT=4100 API_DEV_PRETTY_LOGS=false node --env-file-if-exists=../../.env src/index.ts` from `apps/api`.
3. For each endpoint in §6: `npx autocannon -d 15 -c 25 [-H cookie] <url>` after a 3 s warm-up; record the §6 columns. Ramp: c ∈ {10,50,100,250}. Interference: 5×dashboard + c=10 /auth/me.
4. DB side: `EXPLAIN (ANALYZE, BUFFERS)` on the §11 shapes; `pg_stat_activity` counts; docker stats.
   Compare in the §40-style table (p50/p95/p99/RPS/errors/PG CPU/pool waiting). A change ships only if its target metric improves and no §6 row regresses >10%.

## 37. Scalability Projection

With Phase 1+2 landed (Estimated, to be validated by the same harness): single-instance plateau should move from ~1,000 to 2,500–4,000 RPS locally (auth cache + indexes remove the dominant per-request DB work); analytics joins the normal latency band; horizontal scaling becomes _safe_ (locked pollers), making capacity ≈ linear in instances until the database writes dominate — at which point the next real constraints are Neon/PG sizing and the notification/email pipeline, both measurable with §28 instrumentation before any architectural change is justified.

## 38. Production Readiness Score

**50/100.** Gate to 70: all four P0s + timeouts + rate limits + readiness check + the index bundle, verified by the §36 rerun. Gate to 85: Phase 2 complete, staging load test on production-like infra (the one environment this audit could not measure), soak test §23, and the §28 observability minimum running in production.

## 39. Final Recommendation

The architecture is sound and does not need replacing — no Redis, no queue broker, no microservices are justified by any measurement here. The system today comfortably serves the ≤1k-user scenarios. What stands between it and 10k–100k users is: four confirmed P0 defects (one financial), one pool configuration block, roughly twenty missing indexes, three N+1 rewrites, and the fact that production currently cannot be observed. All of it is incremental, low-risk work with measured baselines to verify against — start with §31, re-run §36, then scale the load test on real infrastructure before trusting any production capacity number.

---

_Benchmark artifacts (raw autocannon JSONL, dataset SQL, suite script) were kept in the session scratchpad, outside the repository, per the audit's no-repo-changes rule._
