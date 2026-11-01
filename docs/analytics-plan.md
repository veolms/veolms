# Analytics: free (core) vs paid (cloud) — implementation plan

Branch: `feat/analytics-tabs` (core). Cloud work lands in `veolms/veolms-cloud`.
Written 2026-10-19 against core `origin/dev` f958a3af.

## 1. The rule that decides free vs paid

**Free (core, open source) = ledger facts.** Money, orders, refunds, coupons,
enrollments, catalogue counts. Anything that is a row in `orders`,
`payments`, `enrollments`, `courses`, `media_assets`. An admin can see _what
the platform did_.

**Paid (cloud) = behaviour.** Who was active and when, how long they learned,
where they drop off, retention, device and country, conversion funnels,
what was streamed and from where, playback health, storage footprint.
Anything that needs _event collection_, _Cloudflare_, _per-learner time
series_, or _background roll-ups_.

Two things that already ship in the core overview fall on the paid side of
that line: **Active Learners** and **Est. Watch Time** (and the started /
completed learning funnel). Recommendation: move them to cloud and replace
them in core with Total Students and Refund Rate. This is a product call,
see the decisions list in section 8. Everything else in this plan assumes
"strict": core does not show per-learner activity.

## 2. Tabs

The `/analytics` page gets a tab bar (`?tab=`), one shared filter bar
(date range, compare-with, course, and asset type on Delivery/Storage), and
one loading/empty/error treatment for every tab.

| Tab               | Edition      | Data already in the DB?          | New collection needed              |
| ----------------- | ------------ | -------------------------------- | ---------------------------------- |
| Overview          | core         | yes                              | no                                 |
| Revenue           | core         | yes                              | no                                 |
| Courses & Content | core (basic) | yes                              | no                                 |
| Learning          | cloud        | yes (daily activity, progress)   | hourly activity for the heatmap    |
| Learners          | cloud        | mostly                           | country, device per session        |
| Conversion        | cloud        | partly (orders, payments, carts) | page/checkout events, UTM          |
| Data Delivery     | cloud        | no                               | Cloudflare (worker + GraphQL)      |
| Storage           | cloud        | yes (media sizes)                | last-accessed from delivery events |
| Video Quality     | cloud        | no                               | player telemetry beacon            |

Core builds the tab bar and a registry. The cloud plugin registers its six
tabs through a new web-core contribution (`analyticsTabs`), the same way it
already contributes lesson-card actions and profile-menu links. Core never
knows which tabs cloud adds.

### 2.1 Core tabs, card by card

**Overview** (design 7)

- KPIs: Net Revenue, Orders, New Enrollments, Total Students, Refund Rate,
  Completion Rate. (Completion rate is per-course progress, not per-learner
  time, so it stays; swap it out if you want strict.)
- Performance over time: net revenue per day (exists).
- Commerce funnel: Added to cart (`cart_items.created_at`, exists and unused),
  Checkout started (`orders` created), Payment successful (`paid`), Refunded.
  "Course page views" needs events, so it is a cloud-only extra row.
- Course performance table (exists). Add Orders, Refunds columns. The row
  menu links to the course's Students and Orders pages instead of a dead
  kebab.
- Insights panel (exists, rule-based sentences).

**Revenue** (design 6)

- KPIs: Gross Sales, Net Revenue, Orders, Unique Buyers, Avg Order Value,
  Refund Rate.
- Revenue over time; Revenue by product (courses and bundles from
  `order_items`); Payment methods (`payments.payment_method` jsonb carries
  the Razorpay method: upi, card, netbanking, wallet); Refund trends
  (`refunds`, `credit_notes`); Coupon performance (`orders.coupon_id`,
  `coupon_redemptions`); Top revenue courses table.
- "Revenue sources" (Direct / Organic / Coupon / Referral / Campaign) needs
  attribution, so core shows a three-way split only: full price, coupon,
  free grant. The five-way split is a cloud extra on the same card.

**Courses & Content** (design 5, trimmed)

- KPIs: Active Courses, Enrollments, Avg Completion, Lessons Published,
  Total Duration, Quizzes.
- Enrollments and completions over time; Top courses table (enrollments,
  completions, completion rate); Content insights (lectures, duration,
  quizzes, assignments). Quiz summary across courses (pass rate, avg score)
  from `quiz_attempts`: free, since core already has per-quiz analytics.
- Section performance, lesson drop-off, top lectures by engagement, resource
  downloads: cloud (they need per-lesson watch and download events).
- "Avg Rating" and "Ratings & Feedback": there is no reviews feature in the
  product. Deferred until one exists.

### 2.2 Cloud tabs, card by card

**Learning** (design 6/9)

- KPIs: Active Learners, Returning Learners, Avg Course Progress, Completion
  Rate, Watch Time, Start Rate.
- Learning activity over time (active learners, lessons completed, hours):
  from `learning_daily_activity` and `learning_daily_course_activity`.
- Progress distribution (0–25 … 75–100) from `learning_progress`.
- Completion trends.
- Activity heatmap by weekday and hour: needs an hourly bucket. Add
  `learning_hourly_activity (user_id, hour_start, seconds)` written by the
  same heartbeat upsert, cloud-side via an event hook (see 3.3).
- Cohort retention (weekly cohorts by enrollment date, % still active):
  computable today from daily activity.
- Community engagement: questions, answers, upvotes, comments from
  `learning_threads`, `learning_replies`, `learning_likes`.
- Learning performance by course; Recent learning activity feed.
- Extra, not in the design and unique to VeoLMS: daily-goal met rate and
  streak distribution (`learning_daily_activity.goal_minutes`).

**Learners** (design 4)

- KPIs: Total, Active, Returning, At-Risk, Not Started, Avg Watch Time per
  Learner. Plus a live "Online now" tile (`sessions.last_used_at` within
  five minutes) and "Signed in today", which you asked for.
- Growth over time; Cohort retention; Activation funnel (visited →
  registered → started → completed a lesson → completed a course; "visited"
  needs the event pipeline, the rest exists); Segmentation by type
  (`enrollments.source`: paid, free, admin grant); Distribution by device
  and country; At-risk learners table (no activity for N days, progress
  under X%) with a link to the student profile and a "Send reminder" action
  reusing the learning-reminder worker.

**Conversion** (design 3)

- Needs the event pipeline (section 3.2). Until it is deployed the tab
  shows "Collecting since <date>" and only the order/payment cards.
- KPIs: Visitors, Enroll Clicks, Checkout Starts, Successful Purchases,
  Conversion Rate, Payment Success Rate.
- Funnel; Conversion over time; Traffic sources (referrer and UTM
  classification); Checkout drop-off (checkout steps come from the real
  flow: order created → phone verified → gateway opened → payment attempted
  → paid; the design's address/review steps do not exist here); Payment
  failure breakdown (`payment_attempts.error_code`, exists today); Course
  page conversion by course; Campaign/UTM table; Payment methods success
  rate. CPA needs ad spend, deferred.
- Extra: wishlist → purchase and cart abandonment (both tables exist).

**Data Delivery** (design 1)

- Source of truth is Cloudflare, two feeds:
  1. **Workers Analytics Engine** from `cdn-worker`: one data point per
     response with bytes sent (full or range length), cache status
     (HIT/MISS/BYPASS), asset class (video segment, manifest, image,
     resource), media id parsed from the key
     (`protected/transcoded/<mediaId>/…`), country (`request.cf.country`),
     device class from the User-Agent, colo. Gives per-course, per-asset,
     per-region, per-device figures.
  2. **Cloudflare GraphQL Analytics API** for the zone (requests, bytes,
     cache ratio by day) and R2 (`r2OperationsAdaptiveGroups`,
     `r2StorageAdaptiveGroups`) for origin egress and stored bytes.
- An hourly job in the cloud API pulls both into Postgres roll-ups
  (`cdn_delivery_daily`, `cdn_media_delivery_daily`), because Analytics
  Engine keeps three months and queries cost per call.
- Cards: Total Delivered, Video, Images, Resources, Origin Egress, Cache Hit
  Ratio; over time (stacked by type); split by type; CDN vs origin; top
  bandwidth content (joined to lessons and courses); delivery by course;
  requests by device; regional delivery; Delivery cost (R2 egress is free,
  so cost = Workers requests + R2 operations at configurable rates; show it
  as "estimated" or drop it, decision below); insights.

**Storage** (design 9)

- Mostly from `media_assets.size_bytes` grouped by type and course, plus
  cumulative growth from `created_at`. Transcoded variant sizes are not in
  the DB (`video_outputs` stores only the playlist path), so the sync job
  lists `protected/transcoded/<mediaId>/` in R2 once per asset and stores
  `transcoded_bytes` in a cloud table.
- Unused / stale assets: last accessed from the delivery roll-up.
- Cost: R2 storage at a configurable rate per GB-month.
- Largest assets, asset count by type, video storage composition.

**Video Quality** (design 2)

- Needs a player telemetry beacon (section 3.3). The `@veolms/video-player`
  engine already emits `loadstart`, `loaded`, `playing`, `bufferingchange`,
  `qualitychange`, `error` with Shaka codes. A collector turns those into
  one `playback_sessions` row per play (startup ms, buffering count and ms,
  error code, max/most-used quality, device, browser, country, lesson,
  course, learner) flushed with `sendBeacon` on unload and every 60 s.
- Cards: Video Starts, Start Failure Rate, Avg Startup Time, Buffering
  Rate, Playback Error Rate, Affected Learners; performance over time;
  problematic videos; errors by device / browser; buffering and startup by
  resolution; regional performance; quality distribution; retention vs
  playback issues (joins to progress).

## 3. Architecture changes

### 3.1 Core (this repo, open source)

1. **Tab shell.** `AnalyticsDashboardPage` becomes a shell: header, filter
   bar, tab bar, `<Outlet>`-like switch. Tabs come from a registry: core's
   three plus `contributions.analyticsTabs` (new type in
   `packages/web-core/src/contributions.ts`: id, label, icon, order,
   lazy component, `requiredPermission`). The filter state is passed to
   every tab as props so cloud tabs share it.
2. **Shared analytics UI package.** Cloud pages cannot import from
   `apps/web/src` (cloud rule 1). Move `components/analytics/*`,
   `analyticsShared.tsx`, formatters and the chart kit into a new workspace
   package `@veolms/analytics-ui` (recharts, app CSS tokens). Kit: KpiCard
   with sparkline, ChartSection, Trend (area/line, multi-series, dual axis),
   Bars, Donut with legend table, Funnel, Heatmap, DataTable (sortable,
   collapses to cards on phones), InsightsPanel, EmptyState and
   "Collecting since" state.
3. **Contracts.** Split `analyticsOverviewResponseSchema` into
   `analyticsOverview`, `analyticsRevenue`, `analyticsCourses`. Export the
   primitives (`kpi`, `trendPoint`, filter query with `compareFrom/To`,
   `assetType`) so the cloud schemas reuse them.
4. **API.** `modules/analytics` gains `GET /analytics/{admin,instructor}/
{overview,revenue,courses}`; the service keeps the 30 s response cache
   and the "previous equal period" comparison. New repository reads:
   unique buyers, AOV, revenue by product, payment methods, refund trend,
   coupon performance, content counts, quiz summary, cart adds.
5. **Event hooks, no-op in core.** Two small generic seams so cloud can
   collect without core knowing about it:
   - web: `contributions.analyticsSink.track(event)`; core calls it at page
     view, course view, enrol click, checkout start, checkout step, payment
     result. Nothing is sent when no sink is registered.
   - web: `PlaybackTelemetry` collector in the player wrapper that hands a
     finished playback summary to the same sink.
   - api: a `learningActivityRecorded` hook on the heartbeat (user, course,
     lesson, seconds, at) that plugins can subscribe to, for the hourly
     bucket. (Alternative: cloud wraps the route; the hook is cleaner.)
6. **CSV export** of the current tab's tables (client side, from the data
   already loaded). "Save report" is deferred.
7. Optional: show cloud tabs as locked teasers in core, decision below.

### 3.2 Cloud (`veolms-cloud`)

1. **`packages/plugin-advanced-analytics`** rebuilt around the six tabs:
   `shared/` schemas per tab, `api/` one service per tab plus ingest
   routes, `web/` six tab components registered through `analyticsTabs`
   from the plugin's root layout. Authorization: `request.cloudUser` plus
   the same `analytics.revenue.read` / `analytics.course.read` check core
   uses (read `role_permissions`).
2. **Ingest routes.** `POST /v1/analytics/events` (batched, anonymous
   allowed, visitor id cookie, rate limited) and `POST /v1/analytics/
playback`. Server derives country (`cf-ipcountry` header when the API is
   behind Cloudflare, else a GeoIP lookup), device and browser
   (`ua-parser-js`), never stores raw IPs.
3. **Cloud migrations** (isolated `cloud_kysely_migration`):
   `analytics_events`, `analytics_visitors`, `playback_sessions`,
   `learning_hourly_activity`, `cdn_delivery_daily`,
   `cdn_media_delivery_daily`, `media_storage_details`,
   `analytics_daily_rollups` (DAU, WAU, MAU, at-risk counts, per day).
4. **Jobs** in the cloud API: hourly Cloudflare sync, nightly roll-ups,
   retention purge (raw events 90 days, roll-ups kept).
5. **`apps/cdn-worker`:** Analytics Engine binding and one `writeDataPoint`
   per response. No change to the serving path.
6. Billing gate: the `advanced_analytics` feature key already exists in
   `featureKeys`; the plugin checks it once tenancy/billing lands. Until
   then the plugin is simply present in cloud.

### 3.3 Why events are first-party and not Google Analytics

Conversion by course, at-risk learners and video quality all need the
learner id, lesson id and order id on the event. A third-party tool cannot
join those to the DB. First-party also keeps the paid tier inside the
product. GA can still be added later for marketing.

## 4. Extras worth adding (not in the designs)

- Online now and signed-in today (Learners).
- Daily goal met rate and streak distribution (Learning).
- Quiz summary across courses (core Courses).
- Wishlist → purchase, cart abandonment (Conversion).
- Unanswered questions and median first-reply time (Learning, community).
- Added to cart as a free funnel step (core Overview).
- "Send reminder" on at-risk rows, reusing the reminder worker.
- Compare-with any period, not just the previous one (filter bar).

## 5. Defer

- Ratings and reviews cards: no such feature exists yet.
- CPA, ad spend, "Revenue sources: Organic/Campaign" beyond UTM/referrer.
- Save report, scheduled email reports, PDF export.
- AI-written insights (keep rule-based sentences).
- Certificates issued (no issuing yet), Live classes.
- Exact delivery cost; keep an "estimated" tile with configurable rates
  or drop it.
- Per-second lesson retention curves (where in a video people leave):
  valuable, but needs position-level telemetry; phase 5 if wanted.

## 6. Phases and pull requests

| Phase | Repo         | Delivers                                                                                                                   | Size      |
| ----- | ------------ | -------------------------------------------------------------------------------------------------------------------------- | --------- |
| 0     | core         | tab shell, `analyticsTabs` contribution, `@veolms/analytics-ui`, split contracts, Overview + Revenue + Courses, CSV export | ~3–4 days |
| 1     | cloud        | plugin rebuilt, Learning + Learners + Storage tabs from existing tables, nightly roll-ups                                  | ~3 days   |
| 2     | core + cloud | event sink and playback telemetry seams; ingest routes and tables; Conversion + Video Quality tabs                         | ~4 days   |
| 3     | cloud        | cdn-worker Analytics Engine, Cloudflare GraphQL sync, Data Delivery tab, stale assets and transcoded sizes                 | ~3 days   |
| 4     | both         | country/device, compare-with, insights, retention purge, phone layouts, perf pass on heavy queries                         | ~2 days   |

Phase 0 and 1 need nothing from you except the decisions below. Phase 2
data only exists from the day it ships, so it should ship early even if the
tab UI follows. Phase 3 needs the Cloudflare items.

## 7. Design notes (making the mockups cleaner)

- One filter bar for all tabs, sticky under the tab row; the per-chart
  7D/30D/3M/1Y pills in the mockups are removed, the bar's range applies
  everywhere. Compare-with becomes a toggle with a preset menu.
- Six KPI tiles per tab, same tile component, sparkline from the tab's own
  trend series, period shown under every number, no fake decimals.
- Chart kit of six forms only (trend, bars, donut, funnel, heatmap, table).
  Same series palette app-wide from the CSS tokens, light and dark.
- Every card has a title, an info tooltip explaining the formula, and a
  "View all" link that goes to a real page (Students, Orders, Courses,
  Content) instead of a dead link.
- Empty states for fresh installs and "Collecting since <date>" for
  event-based cards, so the page never looks broken on day one.
- Phones: tiles 2-up, tables collapse to cards, charts keep 180 px height.
- Export is a CSV of the visible tab; Save report hidden until built.

## 8. Decisions and items needed from you

Decisions:

1. **Strict split or keep what ships.** Move Active Learners, Est. Watch
   Time and the learning funnel out of core (recommended, matches what you
   said), or leave them since they are already public.
2. **Locked tabs in core.** Show the six cloud tabs greyed with a "VeoLMS
   Cloud" note, or hide them entirely. Recommended: hide; the open-source
   page should feel complete, and the README can describe the cloud tier.
3. **Who gets cloud tabs.** Admins only, or also instructors for their own
   courses (Learning, Learners, Video Quality scoped to their courses).
   Recommended: admins now, instructors later.
4. **Cost tiles.** Keep "estimated" cost tiles with rates in env, or drop.
5. **Retention and privacy.** Raw events 90 days, roll-ups forever, no raw
   IPs stored, country only. OK?
6. **Overview KPI replacements** if strict: Total Students and Refund Rate.

Needed from you (phase 3, Cloudflare):

- Cloudflare **Account ID** and the **Zone ID** of the domain that serves
  `/cdn`.
- An **API token** with Account Analytics: Read and Zone Analytics: Read
  (and Workers R2 Storage: Read if we list transcoded sizes through the
  API rather than the worker). Put it in the cloud `.env` as
  `CLOUDFLARE_API_TOKEN`, do not paste it in chat.
- Confirm the plan the `cdn-worker` runs on (Analytics Engine limits differ
  between Free and Paid) and whether the API origin is proxied through
  Cloudflare (gives `cf-ipcountry` for free; otherwise a GeoIP database is
  needed).

Needed from you (general):

- The decisions above.
- A go-ahead to start phase 0 on this branch.
