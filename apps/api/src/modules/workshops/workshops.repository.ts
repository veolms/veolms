import type {
  Database,
  DatabaseExecutor,
  WorkshopResourceJson,
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
