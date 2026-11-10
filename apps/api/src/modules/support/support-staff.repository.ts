import type {
  DatabaseExecutor,
  SupportEventType,
  SupportTicketCategory,
  SupportTicketPriority,
  SupportTicketStatus,
} from "@veolms/database";
import { sql } from "kysely";

/**
 * The team's side of support: who works on a ticket, its priority, the
 * Activity log, and internal notes edited, pinned or deleted.
 */

/** The ticket's row, locked until the transaction ends. */
export async function lockTicket(database: DatabaseExecutor, ticketId: string) {
  return await database
    .selectFrom("support_tickets")
    .select([
      "id",
      "number",
      "kind",
      "category",
      "status",
      "title",
      "assignee_id",
      "priority",
    ])
    .where("id", "=", ticketId)
    .forUpdate()
    .executeTakeFirst();
}

export async function updateTicketFields(
  database: DatabaseExecutor,
  ticketId: string,
  patch: {
    status?: SupportTicketStatus;
    resolvedAt?: Date | null;
    category?: SupportTicketCategory;
    priority?: SupportTicketPriority | null;
    assignee?: { id: string | null; by: string; at: Date };
  },
) {
  await database
    .updateTable("support_tickets")
    .set({
      ...(patch.status !== undefined ? { status: patch.status } : {}),
      ...(patch.resolvedAt !== undefined
        ? { resolved_at: patch.resolvedAt }
        : {}),
      ...(patch.category !== undefined ? { category: patch.category } : {}),
      ...(patch.priority !== undefined ? { priority: patch.priority } : {}),
      ...(patch.assignee
        ? {
            assignee_id: patch.assignee.id,
            assigned_at: patch.assignee.id ? patch.assignee.at : null,
            assigned_by: patch.assignee.id ? patch.assignee.by : null,
          }
        : {}),
      updated_at: new Date(),
    })
    .where("id", "=", ticketId)
    .execute();
}

export async function insertEvent(
  database: DatabaseExecutor,
  event: {
    ticketId: string;
    actorId: string;
    type: SupportEventType;
    data: Record<string, unknown>;
    at?: Date;
  },
) {
  await database
    .insertInto("support_events")
    .values({
      id: crypto.randomUUID(),
      ticket_id: event.ticketId,
      actor_id: event.actorId,
      type: event.type,
      data: JSON.stringify(event.data),
      ...(event.at ? { created_at: event.at } : {}),
    })
    .execute();
}

export async function listEvents(database: DatabaseExecutor, ticketId: string) {
  return await database
    .selectFrom("support_events as e")
    .leftJoin("users as actor", "actor.id", "e.actor_id")
    .select([
      "e.id",
      "e.type",
      "e.data",
      "e.created_at",
      "e.actor_id",
      "actor.display_name as actor_name",
      "actor.username as actor_username",
      "actor.avatar_data_url as actor_avatar",
    ])
    .where("e.ticket_id", "=", ticketId)
    .orderBy("e.seq")
    .execute();
}

export async function findPeople(
  database: DatabaseExecutor,
  userIds: readonly string[],
) {
  if (userIds.length === 0) return [];
  return await database
    .selectFrom("users")
    .select(["id", "display_name", "username", "avatar_data_url"])
    .where("id", "in", userIds)
    .execute();
}

/** An internal note on this ticket that is not deleted, locked. */
export async function lockNote(
  database: DatabaseExecutor,
  ticketId: string,
  messageId: string,
) {
  return await database
    .selectFrom("support_messages")
    .select(["id", "author_id", "internal", "pinned", "content"])
    .where("id", "=", messageId)
    .where("ticket_id", "=", ticketId)
    .where("internal", "=", true)
    .where("deleted_at", "is", null)
    .forUpdate()
    .executeTakeFirst();
}

export async function editNote(
  database: DatabaseExecutor,
  messageId: string,
  input: { content: string; plainText: string; editorId: string; at: Date },
) {
  await database
    .updateTable("support_messages")
    .set({
      content: input.content,
      plain_text: input.plainText,
      updated_at: input.at,
      edited_by: input.editorId,
    })
    .where("id", "=", messageId)
    .execute();
}

export async function pinNote(
  database: DatabaseExecutor,
  messageId: string,
  pinned: boolean,
  at: Date,
) {
  await database
    .updateTable("support_messages")
    .set({ pinned, pinned_at: pinned ? at : null })
    .where("id", "=", messageId)
    .execute();
}

export async function deleteNote(
  database: DatabaseExecutor,
  messageId: string,
  deletedBy: string,
  at: Date,
) {
  await database
    .updateTable("support_messages")
    .set({ deleted_at: at, deleted_by: deletedBy, pinned: false })
    .where("id", "=", messageId)
    .execute();
}

/** Whether the person holds the admin role, on the platform. */
export async function isAdmin(
  database: DatabaseExecutor,
  userId: string,
): Promise<boolean> {
  const result = await sql<{ admin: boolean }>`
    select exists (
      select 1 from user_roles ur
      join roles r on r.id = ur.role_id
      where ur.user_id = ${userId} and lower(r.name) = 'admin'
      union all
      select 1 from role_assignments ra
      join roles r on r.id = ra.role_id
      where ra.user_id = ${userId} and lower(r.name) = 'admin'
        and ra.scope_type = 'platform'
        and (ra.expires_at is null or ra.expires_at > current_timestamp)
    ) as admin
  `.execute(database);
  return Boolean(result.rows[0]?.admin);
}

/**
 * The people given, with the name of their main role and how much is
 * assigned to them and not done: reports not resolved, feedback not
 * planned (the end of feedback's triage).
 */
export async function describeTeam(
  database: DatabaseExecutor,
  userIds: readonly string[],
) {
  if (userIds.length === 0) return [];
  const result = await sql<{
    id: string;
    display_name: string;
    username: string | null;
    avatar_data_url: string | null;
    role_name: string | null;
    open_reports: string;
    open_feedback: string;
  }>`
    select
      u.id, u.display_name, u.username, u.avatar_data_url,
      (
        select r.name from (
          select ur.role_id from user_roles ur where ur.user_id = u.id
          union
          select ra.role_id from role_assignments ra
          where ra.user_id = u.id and ra.scope_type = 'platform'
            and (ra.expires_at is null or ra.expires_at > current_timestamp)
        ) held
        join roles r on r.id = held.role_id
        where lower(r.name) <> 'student'
        order by (lower(r.name) = 'admin') desc, r.name
        limit 1
      ) as role_name,
      (
        select count(*) from support_tickets t
        where t.assignee_id = u.id and t.kind = 'problem'
          and t.status <> 'resolved'
      ) as open_reports,
      (
        select count(*) from support_tickets t
        where t.assignee_id = u.id and t.kind = 'feedback'
          and t.status <> 'planned'
      ) as open_feedback
    from users u
    where u.id in (${sql.join(userIds)}) and u.is_deleted = false
    order by u.display_name
  `.execute(database);
  return result.rows;
}

/** Not done and assigned to this person, by kind. */
export async function countAssignedTo(
  database: DatabaseExecutor,
  userId: string,
) {
  const row = await database
    .selectFrom("support_tickets")
    .select([
      sql<string>`count(*) filter (where kind = 'problem' and status <> 'resolved')`.as(
        "problems",
      ),
      sql<string>`count(*) filter (where kind = 'feedback' and status <> 'planned')`.as(
        "feedback",
      ),
    ])
    .where("assignee_id", "=", userId)
    .executeTakeFirst();
  return {
    problems: Number(row?.problems ?? 0),
    feedback: Number(row?.feedback ?? 0),
  };
}
