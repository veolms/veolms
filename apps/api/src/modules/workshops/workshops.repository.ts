import type {
  Database,
  DatabaseExecutor,
  WorkshopResourceJson,
  WorkshopRegistrationTable,
  WorkshopSessionTable,
  WorkshopStatus,
  WorkshopTable,
} from "@veolms/database";
import type { WorkshopAdminTab } from "@veolms/contracts";
import { sql, type Kysely, type Selectable } from "kysely";

export type WorkshopRow = Selectable<WorkshopTable>;
export type WorkshopSessionRow = Selectable<WorkshopSessionTable>;

/** A workshop with its host, course title and live registration count. */
export interface WorkshopDetailRow extends WorkshopRow {
  host_name: string;
  host_username: string | null;
  host_avatar: string | null;
  course_title: string | null;
  course_slug: string | null;
  registration_count: number;
}

/** The list adds what its cards show about the sessions. */
export interface WorkshopListRow extends WorkshopDetailRow {
  session_count: number;
  next_session_at: Date | null;
  first_session_at: Date | null;
  last_session_ends_at: Date | null;
}

const ADMIN_LIST_LIMIT = 200;

function withJoins(database: DatabaseExecutor) {
  return database
    .selectFrom("workshops")
    .innerJoin("users as host", "host.id", "workshops.host_user_id")
    .leftJoin("courses", "courses.id", "workshops.course_id")
    .selectAll("workshops")
    .select([
      "host.display_name as host_name",
      "host.username as host_username",
      "host.avatar_data_url as host_avatar",
      "courses.title as course_title",
      "courses.slug as course_slug",
      sql<number>`(
        select count(*)::int from workshop_registrations r
        where r.workshop_id = workshops.id and r.cancelled_at is null
      )`.as("registration_count"),
    ])
    .where("workshops.deleted_at", "is", null);
}

export async function findWorkshopById(
  database: DatabaseExecutor,
  id: string,
): Promise<WorkshopDetailRow | undefined> {
  return (await withJoins(database)
    .where("workshops.id", "=", id)
    .executeTakeFirst()) as WorkshopDetailRow | undefined;
}

/** Whether a slug is in use by any workshop, deleted ones included (the
 * unique constraint counts them too). */
export async function slugTaken(
  database: DatabaseExecutor,
  slug: string,
  exceptId?: string,
): Promise<boolean> {
  let query = database
    .selectFrom("workshops")
    .select("id")
    .where("slug", "=", slug);
  if (exceptId) query = query.where("id", "!=", exceptId);
  return Boolean(await query.executeTakeFirst());
}

export async function userExists(
  database: DatabaseExecutor,
  userId: string,
): Promise<boolean> {
  const row = await database
    .selectFrom("users")
    .select("id")
    .where("id", "=", userId)
    .where("is_deleted", "=", false)
    .executeTakeFirst();
  return Boolean(row);
}

export async function courseExists(
  database: DatabaseExecutor,
  courseId: string,
): Promise<boolean> {
  const row = await database
    .selectFrom("courses")
    .select("id")
    .where("id", "=", courseId)
    .where("deleted_at", "is", null)
    .executeTakeFirst();
  return Boolean(row);
}

export interface NewWorkshopRow {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  description: string | null;
  cover_media_id: string | null;
  cover_url: string | null;
  host_user_id: string;
  course_id: string | null;
  price_minor: number | null;
  currency: string;
  capacity: number | null;
  resources: WorkshopResourceJson[];
  created_by: string;
}

export async function insertWorkshop(
  database: DatabaseExecutor,
  row: NewWorkshopRow,
): Promise<void> {
  await database
    .insertInto("workshops")
    .values({ ...row, resources: JSON.stringify(row.resources) })
    .execute();
}

export type WorkshopPatch = Partial<
  Pick<
    NewWorkshopRow,
    | "slug"
    | "title"
    | "summary"
    | "description"
    | "cover_media_id"
    | "cover_url"
    | "host_user_id"
    | "course_id"
    | "price_minor"
    | "currency"
    | "capacity"
    | "resources"
  >
> & {
  status?: WorkshopStatus;
  published_at?: Date | null;
  cancelled_at?: Date | null;
  cancel_reason?: string | null;
  deleted_at?: Date | null;
};

export async function updateWorkshop(
  database: DatabaseExecutor,
  id: string,
  patch: WorkshopPatch,
  now: Date,
): Promise<void> {
  const { resources, ...rest } = patch;
  await database
    .updateTable("workshops")
    .set({
      ...rest,
      ...(resources ? { resources: JSON.stringify(resources) } : {}),
      updated_at: now,
    })
    .where("id", "=", id)
    .execute();
}

export async function listSessions(
  database: DatabaseExecutor,
  workshopId: string,
): Promise<WorkshopSessionRow[]> {
  return await database
    .selectFrom("workshop_sessions")
    .selectAll()
    .where("workshop_id", "=", workshopId)
    .orderBy("position", "asc")
    .orderBy("starts_at", "asc")
    .execute();
}

export interface SessionWrite {
  id: string;
  title: string | null;
  starts_at: Date;
  ends_at: Date;
  time_zone: string;
  join_url_encrypted: string | null;
  passcode: string | null;
}

/**
 * Makes the workshop's sessions exactly `sessions`, in that order: rows
 * with a known id are updated, new ids inserted, and sessions left out are
 * removed.
 */
export async function replaceSessions(
  database: DatabaseExecutor,
  workshopId: string,
  sessions: readonly SessionWrite[],
  now: Date,
): Promise<void> {
  const keep = sessions.map((session) => session.id);
  let removal = database
    .deleteFrom("workshop_sessions")
    .where("workshop_id", "=", workshopId);
  if (keep.length > 0) removal = removal.where("id", "not in", keep);
  await removal.execute();

  for (const [position, session] of sessions.entries()) {
    await database
      .insertInto("workshop_sessions")
      .values({
        id: session.id,
        workshop_id: workshopId,
        position,
        title: session.title,
        starts_at: session.starts_at,
        ends_at: session.ends_at,
        time_zone: session.time_zone,
        join_url_encrypted: session.join_url_encrypted,
        passcode: session.passcode,
        recording_media_id: null,
        recording_ready_at: null,
      })
      .onConflict((conflict) =>
        conflict.column("id").doUpdateSet({
          position,
          title: session.title,
          starts_at: session.starts_at,
          ends_at: session.ends_at,
          time_zone: session.time_zone,
          join_url_encrypted: session.join_url_encrypted,
          passcode: session.passcode,
          updated_at: now,
        }),
      )
      .execute();
  }
}

/** Which session ids of this workshop exist (so a patch cannot claim another's). */
export async function listSessionIds(
  database: DatabaseExecutor,
  workshopId: string,
): Promise<Set<string>> {
  const rows = await database
    .selectFrom("workshop_sessions")
    .select("id")
    .where("workshop_id", "=", workshopId)
    .execute();
  return new Set(rows.map((row) => row.id));
}

export async function listAdminWorkshops(
  database: Kysely<Database>,
  input: { tab: WorkshopAdminTab; search?: string | undefined; now: Date },
): Promise<WorkshopListRow[]> {
  const { now } = input;
  const hasFutureSession = sql<boolean>`exists (
    select 1 from workshop_sessions s
    where s.workshop_id = workshops.id and s.ends_at > ${now}
  )`;
  let query = withJoins(database).select([
    sql<number>`(
      select count(*)::int from workshop_sessions s where s.workshop_id = workshops.id
    )`.as("session_count"),
    sql<Date | null>`(
      select min(s.starts_at) from workshop_sessions s
      where s.workshop_id = workshops.id and s.ends_at > ${now}
    )`.as("next_session_at"),
    sql<Date | null>`(
      select min(s.starts_at) from workshop_sessions s where s.workshop_id = workshops.id
    )`.as("first_session_at"),
    sql<Date | null>`(
      select max(s.ends_at) from workshop_sessions s where s.workshop_id = workshops.id
    )`.as("last_session_ends_at"),
  ]);

  switch (input.tab) {
    case "drafts":
      query = query
        .where("workshops.status", "=", "draft")
        .orderBy("workshops.updated_at", "desc");
      break;
    case "cancelled":
      query = query
        .where("workshops.status", "=", "cancelled")
        .orderBy("workshops.updated_at", "desc");
      break;
    case "past":
      query = query
        .where("workshops.status", "=", "published")
        .where(sql<boolean>`not ${hasFutureSession}`)
        .orderBy(sql`last_session_ends_at`, "desc");
      break;
    case "upcoming":
    default:
      query = query
        .where("workshops.status", "=", "published")
        .where(hasFutureSession)
        .orderBy(sql`next_session_at`, "asc");
      break;
  }
  if (input.search) {
    query = query.where("workshops.title", "ilike", `%${input.search}%`);
  }
  return (await query.limit(ADMIN_LIST_LIMIT).execute()) as WorkshopListRow[];
}

export async function countAdminTabs(
  database: Kysely<Database>,
  now: Date,
): Promise<{
  upcoming: number;
  past: number;
  drafts: number;
  cancelled: number;
}> {
  const row = await database
    .selectFrom("workshops")
    .select([
      sql<number>`count(*) filter (
        where status = 'published' and exists (
          select 1 from workshop_sessions s
          where s.workshop_id = workshops.id and s.ends_at > ${now}
        )
      )::int`.as("upcoming"),
      sql<number>`count(*) filter (
        where status = 'published' and not exists (
          select 1 from workshop_sessions s
          where s.workshop_id = workshops.id and s.ends_at > ${now}
        )
      )::int`.as("past"),
      sql<number>`count(*) filter (where status = 'draft')::int`.as("drafts"),
      sql<number>`count(*) filter (where status = 'cancelled')::int`.as(
        "cancelled",
      ),
    ])
    .where("deleted_at", "is", null)
    .executeTakeFirstOrThrow();
  return {
    upcoming: Number(row.upcoming),
    past: Number(row.past),
    drafts: Number(row.drafts),
    cancelled: Number(row.cancelled),
  };
}

// --- Step 2: learners ---

const listAggregates = (now: Date) => [
  sql<number>`(
    select count(*)::int from workshop_sessions s where s.workshop_id = workshops.id
  )`.as("session_count"),
  sql<Date | null>`(
    select min(s.starts_at) from workshop_sessions s
    where s.workshop_id = workshops.id and s.ends_at > ${now}
  )`.as("next_session_at"),
  sql<Date | null>`(
    select min(s.starts_at) from workshop_sessions s where s.workshop_id = workshops.id
  )`.as("first_session_at"),
  sql<Date | null>`(
    select max(s.ends_at) from workshop_sessions s where s.workshop_id = workshops.id
  )`.as("last_session_ends_at"),
];

/** Every published workshop, the ones with a session still to come first. */
export async function listPublicWorkshops(
  database: Kysely<Database>,
  now: Date,
): Promise<WorkshopListRow[]> {
  return (await withJoins(database)
    .select(listAggregates(now))
    .where("workshops.status", "=", "published")
    .orderBy(sql`next_session_at`, "asc")
    .orderBy(sql`last_session_ends_at`, "desc")
    .limit(ADMIN_LIST_LIMIT)
    .execute()) as WorkshopListRow[];
}

/** A published or cancelled workshop by its address; drafts are nobody's. */
export async function findPublicBySlug(
  database: Kysely<Database>,
  slug: string,
  now: Date,
): Promise<WorkshopListRow | undefined> {
  return (await withJoins(database)
    .select(listAggregates(now))
    .where("workshops.slug", "=", slug)
    .where("workshops.status", "in", ["published", "cancelled"])
    .executeTakeFirst()) as WorkshopListRow | undefined;
}

export async function findPublicById(
  database: Kysely<Database>,
  workshopId: string,
  now: Date,
): Promise<WorkshopListRow | undefined> {
  return (await withJoins(database)
    .select(listAggregates(now))
    .where("workshops.id", "=", workshopId)
    .where("workshops.status", "in", ["published", "cancelled"])
    .executeTakeFirst()) as WorkshopListRow | undefined;
}

export type WorkshopRegistrationRow = Selectable<WorkshopRegistrationTable>;

export async function findRegistration(
  database: DatabaseExecutor,
  workshopId: string,
  userId: string,
): Promise<WorkshopRegistrationRow | undefined> {
  return await database
    .selectFrom("workshop_registrations")
    .selectAll()
    .where("workshop_id", "=", workshopId)
    .where("user_id", "=", userId)
    .executeTakeFirst();
}

/** Locks the workshop row for the rest of the transaction. */
export async function lockWorkshop(
  database: DatabaseExecutor,
  workshopId: string,
): Promise<void> {
  await database
    .selectFrom("workshops")
    .select("id")
    .where("id", "=", workshopId)
    .forUpdate()
    .execute();
}

export async function countActiveRegistrations(
  database: DatabaseExecutor,
  workshopId: string,
): Promise<number> {
  const row = await database
    .selectFrom("workshop_registrations")
    .select((eb) => eb.fn.count<number>("id").as("total"))
    .where("workshop_id", "=", workshopId)
    .where("cancelled_at", "is", null)
    .executeTakeFirst();
  return Number(row?.total ?? 0);
}

/**
 * Registers, or re-activates a cancelled registration. The unique key on
 * (workshop, user) makes a repeat a no-op; the caller reads the row back.
 */
export async function upsertRegistration(
  database: DatabaseExecutor,
  input: {
    id: string;
    workshopId: string;
    userId: string;
    source: "free" | "order" | "admin";
    orderId: string | null;
    now: Date;
  },
): Promise<WorkshopRegistrationRow> {
  return await database
    .insertInto("workshop_registrations")
    .values({
      id: input.id,
      workshop_id: input.workshopId,
      user_id: input.userId,
      source: input.source,
      order_id: input.orderId,
      registered_at: input.now,
      cancelled_at: null,
    })
    .onConflict((conflict) =>
      conflict.columns(["workshop_id", "user_id"]).doUpdateSet({
        cancelled_at: null,
        registered_at: input.now,
        source: input.source,
        order_id: input.orderId,
      }),
    )
    .returningAll()
    .executeTakeFirstOrThrow();
}

export async function cancelRegistration(
  database: DatabaseExecutor,
  workshopId: string,
  userId: string,
  now: Date,
): Promise<void> {
  await database
    .updateTable("workshop_registrations")
    .set({ cancelled_at: now })
    .where("workshop_id", "=", workshopId)
    .where("user_id", "=", userId)
    .where("cancelled_at", "is", null)
    .execute();
}

// --- Step 3: reminders and joining ---

/** Everyone with an active registration, for a reminder's fan-out. */
export async function listActiveRegistrantUserIds(
  database: DatabaseExecutor,
  workshopId: string,
): Promise<string[]> {
  const rows = await database
    .selectFrom("workshop_registrations")
    .select("user_id")
    .where("workshop_id", "=", workshopId)
    .where("cancelled_at", "is", null)
    .execute();
  return rows.map((row) => row.user_id);
}

export async function findSession(
  database: DatabaseExecutor,
  workshopId: string,
  sessionId: string,
): Promise<WorkshopSessionRow | undefined> {
  return await database
    .selectFrom("workshop_sessions")
    .selectAll()
    .where("workshop_id", "=", workshopId)
    .where("id", "=", sessionId)
    .executeTakeFirst();
}

/** Remembers that this learner clicked Join on a session (once per session). */
export async function recordJoin(
  database: DatabaseExecutor,
  workshopId: string,
  userId: string,
  sessionId: string,
): Promise<void> {
  await database
    .updateTable("workshop_registrations")
    .set({
      joined_session_ids: sql`(
        select array_agg(distinct x) from unnest(
          array_append(joined_session_ids, ${sessionId}::uuid)
        ) as x
      )`,
    })
    .where("workshop_id", "=", workshopId)
    .where("user_id", "=", userId)
    .where("cancelled_at", "is", null)
    .execute();
}

// --- Step 4: recordings ---

/** Points a session at its recording (or clears it); readiness starts over. */
export async function setSessionRecording(
  database: DatabaseExecutor,
  sessionId: string,
  mediaId: string | null,
  readyAt: Date | null,
  now: Date,
): Promise<void> {
  await database
    .updateTable("workshop_sessions")
    .set({
      recording_media_id: mediaId,
      recording_ready_at: mediaId ? readyAt : null,
      updated_at: now,
    })
    .where("id", "=", sessionId)
    .execute();
}

export interface SessionAwaitingRecordingRow {
  session_id: string;
  session_title: string | null;
  recording_media_id: string;
  workshop_id: string;
  slug: string;
  title: string;
  status: string;
}

/** Sessions whose recording is attached but not yet known to be ready. */
export async function listSessionsAwaitingRecording(
  database: DatabaseExecutor,
): Promise<SessionAwaitingRecordingRow[]> {
  const rows = await database
    .selectFrom("workshop_sessions as s")
    .innerJoin("workshops as w", "w.id", "s.workshop_id")
    .select([
      "s.id as session_id",
      "s.title as session_title",
      "s.recording_media_id",
      "w.id as workshop_id",
      "w.slug",
      "w.title",
      "w.status",
    ])
    .where("s.recording_media_id", "is not", null)
    .where("s.recording_ready_at", "is", null)
    .where("w.deleted_at", "is", null)
    .limit(200)
    .execute();
  return rows as SessionAwaitingRecordingRow[];
}

/** Marks the recording ready if it is still the same one; true when it was. */
export async function markRecordingReady(
  database: DatabaseExecutor,
  sessionId: string,
  mediaId: string,
  now: Date,
): Promise<boolean> {
  const result = await database
    .updateTable("workshop_sessions")
    .set({ recording_ready_at: now, updated_at: now })
    .where("id", "=", sessionId)
    .where("recording_media_id", "=", mediaId)
    .where("recording_ready_at", "is", null)
    .executeTakeFirst();
  return Number(result.numUpdatedRows) > 0;
}

// --- Step 5: paid registration ---

/** Published or cancelled workshops by id, with the list aggregates. */
export async function listPublicByIds(
  database: DatabaseExecutor,
  workshopIds: readonly string[],
  now: Date,
): Promise<WorkshopListRow[]> {
  if (workshopIds.length === 0) return [];
  return (await withJoins(database)
    .select(listAggregates(now))
    .where("workshops.id", "in", [...workshopIds])
    .where("workshops.status", "in", ["published", "cancelled"])
    .execute()) as WorkshopListRow[];
}

export async function cancelRegistrationsByOrder(
  database: DatabaseExecutor,
  orderId: string,
  workshopId: string | null,
  now: Date,
): Promise<void> {
  let query = database
    .updateTable("workshop_registrations")
    .set({ cancelled_at: now })
    .where("order_id", "=", orderId)
    .where("cancelled_at", "is", null);
  if (workshopId) query = query.where("workshop_id", "=", workshopId);
  await query.execute();
}

/** Registrations that came from a paid order and still stand. */
export async function listPaidRegistrations(
  database: DatabaseExecutor,
  workshopId: string,
): Promise<{ user_id: string; order_id: string }[]> {
  const rows = await database
    .selectFrom("workshop_registrations")
    .select(["user_id", "order_id"])
    .where("workshop_id", "=", workshopId)
    .where("source", "=", "order")
    .where("order_id", "is not", null)
    .where("cancelled_at", "is", null)
    .execute();
  return rows.filter((row): row is { user_id: string; order_id: string } =>
    Boolean(row.order_id),
  );
}
