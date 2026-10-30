import { sql, type Kysely } from "kysely";

/**
 * Index bundle from the 2026-10 performance audit. Each entry covers a query
 * that currently seq-scans (verified against the repository queries and,
 * for learning_progress, EXPLAIN ANALYZE on a 1M-row dataset).
 *
 * Deploy note: these run as plain CREATE INDEX (Kysely migrations are
 * transactional, which precludes CONCURRENTLY). On a production database
 * where these tables are already large, prefer creating them manually with
 * CREATE INDEX CONCURRENTLY first — this migration's IF NOT EXISTS will
 * then skip them.
 */
export async function up(database: Kysely<unknown>): Promise<void> {
  // Queried on EVERY authenticated request (session.service resolveMfaState):
  // passkey count + TOTP lookup per request had no user_id index.
  await sql`
    create index if not exists idx_passkeys_user_id
      on passkeys (user_id)
  `.execute(database);
  await sql`
    create index if not exists idx_user_totp_credentials_user_id
      on user_totp_credentials (user_id)
  `.execute(database);

  // Session listing/revoke-all/delete-all by user, and the retention purge
  // by expiry — sessions only had pkey + token_hash.
  await sql`
    create index if not exists idx_sessions_user_id
      on sessions (user_id)
  `.execute(database);
  await sql`
    create index if not exists idx_sessions_expires_at
      on sessions (expires_at)
  `.execute(database);

  // Course-led analytics aggregates (admin/instructor dashboards, active
  // learner counts): every existing learning_progress index leads with
  // user_id, so course filters parallel-seq-scanned the whole table
  // (measured 118ms per aggregate at 1M rows). lesson_id additionally
  // serves FK cascade checks on lesson deletion.
  await sql`
    create index if not exists idx_learning_progress_course_updated
      on learning_progress (course_id, updated_at)
  `.execute(database);
  await sql`
    create index if not exists idx_learning_progress_lesson_id
      on learning_progress (lesson_id)
  `.execute(database);

  // OTP throttle checks (hasOtpSince/countOtpsSince) have no consumed_at
  // predicate, so the partial otp_codes_lookup index never applies and
  // every OTP send seq-scans an append-only table.
  await sql`
    create index if not exists idx_otp_codes_throttle
      on otp_codes (identifier, identifier_type, purpose, created_at)
  `.execute(database);

  // Course-led participant expansion (mentions, quiz analytics):
  // access_grants unique leads with user_id.
  await sql`
    create index if not exists idx_access_grants_course_status
      on access_grants (course_id, status)
  `.execute(database);

  // Revoke-by-order on refunds; enrollments had no order_id index.
  await sql`
    create index if not exists idx_enrollments_order_id
      on enrollments (order_id)
      where order_id is not null
  `.execute(database);

  // Coupon FK lookups during checkout/stats.
  await sql`
    create index if not exists idx_orders_coupon_id
      on orders (coupon_id)
      where coupon_id is not null
  `.execute(database);

  // The three fulfillment pollers (every 5 minutes, every replica) filter
  // on status columns that had no leading index:
  // - order expiration: status IN (pending, payment_processing) + expires_at
  // - payment recovery: status IN (initiated, processing) + updated_at
  // - refund reconciliation: status = pending + created_at
  await sql`
    create index if not exists idx_orders_expirable
      on orders (expires_at)
      where status in ('pending', 'payment_processing')
  `.execute(database);
  await sql`
    create index if not exists idx_payments_recoverable
      on payments (updated_at)
      where status in ('initiated', 'processing')
  `.execute(database);
  await sql`
    create index if not exists idx_refunds_pending_created
      on refunds (created_at)
      where status = 'pending'
  `.execute(database);

  // Lesson discussion feed's notes branch and course notes workspace:
  // learning_notes only had (user_id, lesson_id, created_at), so the
  // non-"mine" feed filtered by course/lesson seq-scans.
  await sql`
    create index if not exists idx_learning_notes_lesson_created
      on learning_notes (lesson_id, created_at)
  `.execute(database);
  await sql`
    create index if not exists idx_learning_notes_course_created
      on learning_notes (course_id, created_at)
  `.execute(database);
}

export async function down(database: Kysely<unknown>): Promise<void> {
  for (const name of [
    "idx_passkeys_user_id",
    "idx_user_totp_credentials_user_id",
    "idx_sessions_user_id",
    "idx_sessions_expires_at",
    "idx_learning_progress_course_updated",
    "idx_learning_progress_lesson_id",
    "idx_otp_codes_throttle",
    "idx_access_grants_course_status",
    "idx_enrollments_order_id",
    "idx_orders_coupon_id",
    "idx_orders_expirable",
    "idx_payments_recoverable",
    "idx_refunds_pending_created",
    "idx_learning_notes_lesson_created",
    "idx_learning_notes_course_created",
  ]) {
    await sql`drop index if exists ${sql.raw(name)}`.execute(database);
  }
}
