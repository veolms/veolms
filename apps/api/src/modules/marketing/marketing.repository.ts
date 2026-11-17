import type {
  MarketingAudience,
  MarketingEmailStats,
  MarketingRecipientFilter,
} from "@veolms/contracts";
import type {
  DatabaseExecutor,
  MarketingEmailKind,
  MarketingEmailStatus,
} from "@veolms/database";
import { sql } from "kysely";

import { audienceQuery } from "./marketing-audience.ts";

export interface MarketingEmailRow {
  id: string;
  kind: MarketingEmailKind;
  automation_key: string | null;
  name: string;
  subject: string;
  preheader: string;
  blocks: unknown[];
  design: Record<string, unknown>;
  audience: Record<string, unknown> | null;
  settings: Record<string, unknown> | null;
  status: MarketingEmailStatus;
  scheduled_at: Date | null;
  started_at: Date | null;
  finished_at: Date | null;
  enabled_at: Date | null;
  resend_of: string | null;
  created_at: Date;
  updated_at: Date;
}

const emailColumns = [
  "id",
  "kind",
  "automation_key",
  "name",
  "subject",
  "preheader",
  "blocks",
  "design",
  "audience",
  "settings",
  "status",
  "scheduled_at",
  "started_at",
  "finished_at",
  "enabled_at",
  "resend_of",
  "created_at",
  "updated_at",
] as const;

export const EMPTY_STATS: MarketingEmailStats = {
  recipients: 0,
  pending: 0,
  sent: 0,
  failed: 0,
  skipped: 0,
  opened: 0,
  clicked: 0,
  unsubscribed: 0,
};

// --- Emails ---

export async function listEmails(
  database: DatabaseExecutor,
  kind: MarketingEmailKind,
): Promise<MarketingEmailRow[]> {
  return (await database
    .selectFrom("marketing_emails")
    .select(emailColumns)
    .where("kind", "=", kind)
    .where("deleted_at", "is", null)
    .orderBy("created_at", "desc")
    .limit(500)
    .execute()) as MarketingEmailRow[];
}

export async function findEmail(
  database: DatabaseExecutor,
  id: string,
): Promise<MarketingEmailRow | null> {
  return ((await database
    .selectFrom("marketing_emails")
    .select(emailColumns)
    .where("id", "=", id)
    .where("deleted_at", "is", null)
    .executeTakeFirst()) ?? null) as MarketingEmailRow | null;
}

export async function findAutomationEmail(
  database: DatabaseExecutor,
  key: string,
): Promise<MarketingEmailRow | null> {
  return ((await database
    .selectFrom("marketing_emails")
    .select(emailColumns)
    .where("automation_key", "=", key)
    .where("deleted_at", "is", null)
    .executeTakeFirst()) ?? null) as MarketingEmailRow | null;
}

export interface NewMarketingEmail {
  kind: MarketingEmailKind;
  automationKey: string | null;
  name: string;
  subject: string;
  preheader: string;
  blocks: unknown[];
  design?: Record<string, unknown>;
  audience: MarketingAudience | null;
  settings: Record<string, unknown> | null;
  status: MarketingEmailStatus;
  resendOf?: string | null;
  createdBy: string | null;
}

export async function insertEmail(
  database: DatabaseExecutor,
  input: NewMarketingEmail,
): Promise<MarketingEmailRow> {
  return (await database
    .insertInto("marketing_emails")
    .values({
      kind: input.kind,
      automation_key: input.automationKey,
      name: input.name,
      subject: input.subject,
      preheader: input.preheader,
      blocks: JSON.stringify(input.blocks),
      design: JSON.stringify(input.design ?? {}),
      audience: input.audience ? JSON.stringify(input.audience) : null,
      settings: input.settings ? JSON.stringify(input.settings) : null,
      status: input.status,
      resend_of: input.resendOf ?? null,
      created_by: input.createdBy,
    })
    .returning(emailColumns)
    .executeTakeFirstOrThrow()) as MarketingEmailRow;
}

/** An automation's email, made the first time it is opened (once). */
export async function insertAutomationEmailOnce(
  database: DatabaseExecutor,
  input: NewMarketingEmail,
): Promise<MarketingEmailRow> {
  const existing = await findAutomationEmail(database, input.automationKey!);
  if (existing) return existing;
  try {
    return await insertEmail(database, input);
  } catch (error) {
    // Opened twice at once: the other request made it (the unique rule on
    // the key, which a multi-academy install widens per academy).
    if ((error as { code?: unknown } | null)?.code !== "23505") throw error;
    const row = await findAutomationEmail(database, input.automationKey!);
    if (!row) throw error;
    return row;
  }
}

export interface MarketingEmailPatch {
  name?: string;
  subject?: string;
  preheader?: string;
  blocks?: unknown[];
  design?: Record<string, unknown>;
  audience?: MarketingAudience;
  settings?: Record<string, unknown>;
}

/**
 * Saves a patch while the email is in one of `statuses` (a draft, or any
 * automation); null when it is not (already sending, or gone).
 */
export async function updateEmail(
  database: DatabaseExecutor,
  id: string,
  patch: MarketingEmailPatch,
  statuses: readonly MarketingEmailStatus[],
): Promise<MarketingEmailRow | null> {
  return ((await database
    .updateTable("marketing_emails")
    .set({
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.subject !== undefined ? { subject: patch.subject } : {}),
      ...(patch.preheader !== undefined ? { preheader: patch.preheader } : {}),
      ...(patch.blocks !== undefined
        ? { blocks: JSON.stringify(patch.blocks) }
        : {}),
      ...(patch.design !== undefined
        ? { design: JSON.stringify(patch.design) }
        : {}),
      ...(patch.audience !== undefined
        ? { audience: JSON.stringify(patch.audience) }
        : {}),
      ...(patch.settings !== undefined
        ? { settings: JSON.stringify(patch.settings) }
        : {}),
      updated_at: new Date(),
    })
    .where("id", "=", id)
    .where("deleted_at", "is", null)
    .where("status", "in", [...statuses])
    .returning(emailColumns)
    .executeTakeFirst()) ?? null) as MarketingEmailRow | null;
}

/** Moves an email from one of `from` to `to`; null when it was not in `from`. */
export async function setStatus(
  database: DatabaseExecutor,
  id: string,
  from: readonly MarketingEmailStatus[],
  to: MarketingEmailStatus,
  extra: { scheduled_at?: Date | null; enabled_at?: Date | null } = {},
): Promise<MarketingEmailRow | null> {
  return ((await database
    .updateTable("marketing_emails")
    .set({ status: to, ...extra, updated_at: new Date() })
    .where("id", "=", id)
    .where("deleted_at", "is", null)
    .where("status", "in", [...from])
    .returning(emailColumns)
    .executeTakeFirst()) ?? null) as MarketingEmailRow | null;
}

export async function softDeleteEmail(
  database: DatabaseExecutor,
  id: string,
): Promise<boolean> {
  const result = await database
    .updateTable("marketing_emails")
    .set({ deleted_at: new Date(), updated_at: new Date() })
    .where("id", "=", id)
    .where("deleted_at", "is", null)
    .where("kind", "=", "broadcast")
    .where("status", "in", ["draft", "scheduled", "sent", "cancelled"])
    .executeTakeFirst();
  return Number(result.numUpdatedRows) > 0;
}

// --- Numbers ---

export async function statsFor(
  database: DatabaseExecutor,
  emailIds: readonly string[],
): Promise<Map<string, MarketingEmailStats>> {
  const stats = new Map<string, MarketingEmailStats>();
  if (emailIds.length === 0) return stats;
  const rows = await sql<{
    email_id: string;
    recipients: string;
    pending: string;
    sent: string;
    failed: string;
    skipped: string;
    opened: string;
    clicked: string;
    unsubscribed: string;
  }>`
    select email_id,
      count(*) as recipients,
      count(*) filter (where status = 'pending') as pending,
      count(*) filter (where status = 'sent') as sent,
      count(*) filter (where status = 'failed') as failed,
      count(*) filter (where status = 'skipped') as skipped,
      count(*) filter (where opened_at is not null or clicked_at is not null) as opened,
      count(clicked_at) as clicked,
      count(unsubscribed_at) as unsubscribed
    from marketing_email_recipients
    where email_id = any(${sql.val(emailIds)}::uuid[])
    group by email_id
  `.execute(database);
  for (const row of rows.rows) {
    stats.set(row.email_id, {
      recipients: Number(row.recipients),
      pending: Number(row.pending),
      sent: Number(row.sent),
      failed: Number(row.failed),
      skipped: Number(row.skipped),
      opened: Number(row.opened),
      clicked: Number(row.clicked),
      unsubscribed: Number(row.unsubscribed),
    });
  }
  return stats;
}

export async function countAudience(
  database: DatabaseExecutor,
  audience: MarketingAudience,
): Promise<number> {
  const result = await sql<{ count: string }>`
    select count(*) as count from (${audienceQuery(audience)}) people
  `.execute(database);
  return Number(result.rows[0]?.count ?? 0);
}

/** Paid orders within 7 days after a recipient clicked the email. */
export async function revenueFor(
  database: DatabaseExecutor,
  emailId: string,
): Promise<{ amount: number; currency: string; orders: number }> {
  const result = await sql<{
    amount: string | null;
    orders: string;
    currency: string | null;
  }>`
    select coalesce(sum(o.total_amount), 0) as amount,
      count(distinct o.id) as orders,
      min(o.currency) as currency
    from marketing_email_recipients r
    join orders o on o.user_id = r.user_id
    where r.email_id = ${emailId}
      and r.clicked_at is not null
      and o.status in ('paid', 'partially_refunded')
      and o.paid_at >= r.clicked_at
      and o.paid_at < r.clicked_at + interval '7 days'
  `.execute(database);
  const row = result.rows[0];
  return {
    amount: Number(row?.amount ?? 0),
    currency: row?.currency ?? "INR",
    orders: Number(row?.orders ?? 0),
  };
}

export async function listRecipients(
  database: DatabaseExecutor,
  emailId: string,
  filter: MarketingRecipientFilter,
  page: number,
  pageSize: number,
) {
  let query = database
    .selectFrom("marketing_email_recipients as r")
    .innerJoin("users as u", "u.id", "r.user_id")
    .where("r.email_id", "=", emailId);
  switch (filter) {
    case "opened":
      query = query.where((eb) =>
        eb.or([
          eb("r.opened_at", "is not", null),
          eb("r.clicked_at", "is not", null),
        ]),
      );
      break;
    case "clicked":
      query = query.where("r.clicked_at", "is not", null);
      break;
    case "not_opened":
      query = query
        .where("r.status", "=", "sent")
        .where("r.opened_at", "is", null)
        .where("r.clicked_at", "is", null);
      break;
    case "unsubscribed":
      query = query.where("r.unsubscribed_at", "is not", null);
      break;
    case "failed":
      query = query.where("r.status", "=", "failed");
      break;
    case "skipped":
      query = query.where("r.status", "=", "skipped");
      break;
    case "all":
      break;
  }
  const [rows, total] = await Promise.all([
    query
      .select([
        "r.user_id",
        "u.display_name",
        "r.email",
        "r.status",
        "r.sent_at",
        "r.opened_at",
        "r.clicked_at",
        "r.unsubscribed_at",
        "r.last_error",
      ])
      .orderBy("r.sent_at", (ob) => ob.desc().nullsLast())
      .orderBy("r.user_id")
      .limit(pageSize)
      .offset((page - 1) * pageSize)
      .execute(),
    query
      .select((eb) => eb.fn.countAll<string>().as("count"))
      .executeTakeFirst(),
  ]);
  return { rows, total: Number(total?.count ?? 0) };
}

// --- The send queue ---

/** Copies a broadcast's audience into its queue, once per person. */
export async function queueAudience(
  database: DatabaseExecutor,
  emailId: string,
  audience: MarketingAudience,
): Promise<number> {
  const result = await sql`
    insert into marketing_email_recipients (email_id, user_id, email)
    select ${emailId}::uuid, people.user_id, people.email
    from (${audienceQuery(audience)}) people
    on conflict do nothing
  `.execute(database);
  return Number(result.numAffectedRows ?? 0);
}

/**
 * Starts a broadcast: its audience copied into the queue and the email
 * marked sending, in one transaction (the caller's). Null when it was not
 * a draft or scheduled any more.
 */
export async function startBroadcast(
  trx: DatabaseExecutor,
  id: string,
  audience: MarketingAudience,
  now: Date,
): Promise<MarketingEmailRow | null> {
  const started = ((await trx
    .updateTable("marketing_emails")
    .set({
      status: "sending",
      started_at: now,
      scheduled_at: now,
      updated_at: now,
    })
    .where("id", "=", id)
    .where("deleted_at", "is", null)
    .where("status", "in", ["draft", "scheduled"])
    .returning(emailColumns)
    .executeTakeFirst()) ?? null) as MarketingEmailRow | null;
  if (started) await queueAudience(trx, id, audience);
  return started;
}

/** Sending broadcasts with nothing left to send become sent. */
export async function finishBroadcasts(database: DatabaseExecutor, now: Date) {
  await sql`
    update marketing_emails m
    set status = 'sent', finished_at = ${now}, updated_at = ${now}
    where m.kind = 'broadcast' and m.status = 'sending'
      and not exists (
        select 1 from marketing_email_recipients r
        where r.email_id = m.id and r.status = 'pending'
      )
  `.execute(database);
}

export async function listActiveAutomations(
  database: DatabaseExecutor,
): Promise<MarketingEmailRow[]> {
  return (await database
    .selectFrom("marketing_emails")
    .select(emailColumns)
    .where("kind", "=", "automation")
    .where("status", "=", "active")
    .where("deleted_at", "is", null)
    .execute()) as MarketingEmailRow[];
}

export interface ClaimedRecipient {
  email_id: string;
  user_id: string;
  email: string;
  course_id: string | null;
  attempt_count: number;
}

/**
 * The next due copies, leased to this sender. Copies of an email that was
 * cancelled, paused or deleted stay where they are.
 */
export async function claimDueRecipients(
  database: DatabaseExecutor,
  {
    limit,
    now,
    leaseUntil,
    maxAttempts,
  }: {
    limit: number;
    now: Date;
    leaseUntil: Date;
    maxAttempts: number;
  },
): Promise<ClaimedRecipient[]> {
  if (limit <= 0) return [];
  const result = await sql<ClaimedRecipient>`
    update marketing_email_recipients r
    set locked_until = ${leaseUntil}, attempt_count = r.attempt_count + 1
    from (
      select q.email_id, q.user_id
      from marketing_email_recipients q
      join marketing_emails m on m.id = q.email_id
      where q.status = 'pending'
        and q.due_at <= ${now}
        and (q.locked_until is null or q.locked_until < ${now})
        and q.attempt_count < ${maxAttempts}
        and m.deleted_at is null
        and m.status in ('sending', 'active')
      order by q.due_at
      limit ${limit}
      for update of q skip locked
    ) due
    where r.email_id = due.email_id and r.user_id = due.user_id
    returning r.email_id, r.user_id, r.email, r.course_id, r.attempt_count
  `.execute(database);
  return result.rows;
}

type RecipientKey = { emailId: string; userId: string };

export async function markRecipient(
  database: DatabaseExecutor,
  { emailId, userId }: RecipientKey,
  change:
    | { status: "sent"; at: Date }
    | { status: "skipped" | "failed"; error: string }
    | {
        status: "pending";
        retryAt: Date;
        error: string;
        rewindAttempt?: boolean;
      },
): Promise<void> {
  const query = database
    .updateTable("marketing_email_recipients")
    .where("email_id", "=", emailId)
    .where("user_id", "=", userId);
  if (change.status === "sent") {
    await query
      .set({
        status: "sent",
        sent_at: change.at,
        locked_until: null,
        last_error: null,
      })
      .execute();
  } else if (change.status === "pending") {
    await query
      .set((eb) => ({
        due_at: change.retryAt,
        locked_until: null,
        last_error: change.error.slice(0, 500),
        ...(change.rewindAttempt
          ? { attempt_count: eb("attempt_count", "-", 1) }
          : {}),
      }))
      .execute();
  } else {
    await query
      .set({
        status: change.status,
        locked_until: null,
        last_error: change.error.slice(0, 500),
      })
      .execute();
  }
}

/** Copies that ran out of tries while their lease was lost count as failed. */
export async function failExhausted(
  database: DatabaseExecutor,
  now: Date,
  maxAttempts: number,
) {
  await sql`
    update marketing_email_recipients
    set status = 'failed', last_error = coalesce(last_error, 'Gave up after repeated tries')
    where status = 'pending' and attempt_count >= ${maxAttempts}
      and (locked_until is null or locked_until < ${now})
  `.execute(database);
}

// --- Tracking ---

export async function recordOpen(
  database: DatabaseExecutor,
  key: RecipientKey,
) {
  await database
    .updateTable("marketing_email_recipients")
    .set({ opened_at: new Date() })
    .where("email_id", "=", key.emailId)
    .where("user_id", "=", key.userId)
    .where("opened_at", "is", null)
    .execute();
}

export async function recordClick(
  database: DatabaseExecutor,
  key: RecipientKey,
) {
  const now = new Date();
  await database
    .updateTable("marketing_email_recipients")
    .set((eb) => ({
      clicked_at: eb.fn.coalesce("clicked_at", sql<Date>`${now}`),
      opened_at: eb.fn.coalesce("opened_at", sql<Date>`${now}`),
    }))
    .where("email_id", "=", key.emailId)
    .where("user_id", "=", key.userId)
    .execute();
}

export async function recordUnsubscribe(
  database: DatabaseExecutor,
  key: RecipientKey,
) {
  await database
    .updateTable("marketing_email_recipients")
    .set({ unsubscribed_at: new Date() })
    .where("email_id", "=", key.emailId)
    .where("user_id", "=", key.userId)
    .where("unsubscribed_at", "is", null)
    .execute();
}

/** What a click needs: the stored blocks and the person's course. */
export async function findClickTarget(
  database: DatabaseExecutor,
  key: RecipientKey,
) {
  return (
    (await database
      .selectFrom("marketing_email_recipients as r")
      .innerJoin("marketing_emails as m", "m.id", "r.email_id")
      .leftJoin("courses as c", "c.id", "r.course_id")
      .select(["m.blocks", "c.slug as course_slug"])
      .where("r.email_id", "=", key.emailId)
      .where("r.user_id", "=", key.userId)
      .executeTakeFirst()) ?? null
  );
}

// --- People and courses, for rendering ---

export async function findPeople(
  database: DatabaseExecutor,
  userIds: readonly string[],
) {
  if (userIds.length === 0)
    return new Map<
      string,
      { display_name: string; email: string | null; is_deleted: boolean }
    >();
  const rows = await database
    .selectFrom("users")
    .select(["id", "display_name", "email", "is_deleted"])
    .where("id", "in", [...userIds])
    .execute();
  return new Map(rows.map((row) => [row.id, row]));
}

export async function findCourses(
  database: DatabaseExecutor,
  courseIds: readonly string[],
) {
  if (courseIds.length === 0)
    return new Map<string, { title: string; slug: string }>();
  const rows = await database
    .selectFrom("courses")
    .select(["id", "title", "slug"])
    .where("id", "in", [...courseIds])
    .execute();
  return new Map(rows.map((row) => [row.id, row]));
}

/** Still allowed to get marketing email: not suppressed, not opted out. */
export async function canStillReceive(
  database: DatabaseExecutor,
  userId: string,
  email: string,
): Promise<boolean> {
  const result = await sql<{ ok: boolean }>`
    select (
      not exists (select 1 from email_suppressions s where s.email = lower(${email}))
      and not exists (
        select 1 from notification_preferences p
        where p.user_id = ${userId} and p.notification_type = 'marketing.email'
          and p.channel = 'email' and p.enabled = false
      )
    ) as ok
  `.execute(database);
  return result.rows[0]?.ok === true;
}

/** Courses and workshops, for the audience pickers. */
export async function listAudienceOptions(database: DatabaseExecutor) {
  const [courses, workshops] = await Promise.all([
    database
      .selectFrom("courses")
      .select(["id", "title"])
      .where("deleted_at", "is", null)
      .orderBy("title")
      .limit(500)
      .execute(),
    database
      .selectFrom("workshops")
      .select(["id", "title"])
      .where("deleted_at", "is", null)
      .orderBy("created_at", "desc")
      .limit(200)
      .execute(),
  ]);
  return { courses, workshops };
}
