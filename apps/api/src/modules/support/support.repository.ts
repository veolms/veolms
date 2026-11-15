import type {
  DatabaseExecutor,
  SupportTicketCategory,
  SupportTicketKind,
  SupportTicketStatus,
} from "@veolms/database";
import { sql } from "kysely";

import { exactCursorTimestamp } from "../../lib/keyset.ts";

export interface NewSupportTicket {
  id: string;
  userId: string;
  kind: SupportTicketKind;
  category: SupportTicketCategory;
  rating: number | null;
  status: SupportTicketStatus;
  title: string;
  content: string;
  plainText: string;
  pagePath: string | null;
  pageLabel: string | null;
  courseId: string | null;
  technical: string | null;
  contactAllowed: boolean;
}

export async function insertTicket(
  database: DatabaseExecutor,
  ticket: NewSupportTicket,
) {
  return await database
    .insertInto("support_tickets")
    .values({
      id: ticket.id,
      user_id: ticket.userId,
      kind: ticket.kind,
      category: ticket.category,
      rating: ticket.rating,
      status: ticket.status,
      title: ticket.title,
      content: ticket.content,
      plain_text: ticket.plainText,
      page_path: ticket.pagePath,
      page_label: ticket.pageLabel,
      course_id: ticket.courseId,
      technical: ticket.technical,
      contact_allowed: ticket.contactAllowed,
    })
    .returning(["id", "number"])
    .executeTakeFirstOrThrow();
}

/** A course id from the page the learner was on, kept only if it exists. */
export async function courseExists(
  database: DatabaseExecutor,
  courseId: string,
): Promise<boolean> {
  const row = await database
    .selectFrom("courses")
    .select("id")
    .where("id", "=", courseId)
    .executeTakeFirst();
  return Boolean(row);
}

export async function insertMessage(
  database: DatabaseExecutor,
  message: {
    id: string;
    ticketId: string;
    authorId: string;
    authorRole: "user" | "staff";
    internal: boolean;
    content: string;
    plainText: string;
  },
) {
  return await database
    .insertInto("support_messages")
    .values({
      id: message.id,
      ticket_id: message.ticketId,
      author_id: message.authorId,
      author_role: message.authorRole,
      internal: message.internal,
      content: message.content,
      plain_text: message.plainText,
    })
    .returning(["id", "created_at"])
    .executeTakeFirstOrThrow();
}

export async function updateTicket(
  database: DatabaseExecutor,
  ticketId: string,
  patch: {
    status?: SupportTicketStatus;
    resolvedAt?: Date | null;
    userUnread?: boolean;
    staffUnread?: boolean;
    lastMessageAt?: Date;
  },
) {
  await database
    .updateTable("support_tickets")
    .set({
      ...(patch.status !== undefined ? { status: patch.status } : {}),
      ...(patch.resolvedAt !== undefined
        ? { resolved_at: patch.resolvedAt }
        : {}),
      ...(patch.userUnread !== undefined
        ? { user_unread: patch.userUnread }
        : {}),
      ...(patch.staffUnread !== undefined
        ? { staff_unread: patch.staffUnread }
        : {}),
      // Never moved back: of two replies saved together, the later stays.
      ...(patch.lastMessageAt !== undefined
        ? {
            last_message_at: sql<Date>`greatest(last_message_at, ${patch.lastMessageAt})`,
          }
        : {}),
      updated_at: new Date(),
    })
    .where("id", "=", ticketId)
    .execute();
}

/** Marks a ticket read for one side, writing only when something changes. */
export async function markRead(
  database: DatabaseExecutor,
  ticketId: string,
  side: "user" | "staff",
) {
  const column = side === "user" ? "user_unread" : "staff_unread";
  await database
    .updateTable("support_tickets")
    .set({ [column]: false })
    .where("id", "=", ticketId)
    .where(column, "=", true)
    .execute();
}

const requesterColumns = [
  "requester.id as requester_id",
  "requester.display_name as requester_name",
  "requester.username as requester_username",
  "requester.email as requester_email",
  "requester.avatar_data_url as requester_avatar",
] as const;

export async function findTicket(database: DatabaseExecutor, ticketId: string) {
  return await database
    .selectFrom("support_tickets as t")
    .innerJoin("users as requester", "requester.id", "t.user_id")
    .selectAll("t")
    .select(requesterColumns)
    .where("t.id", "=", ticketId)
    .executeTakeFirst();
}

export async function listMessages(
  database: DatabaseExecutor,
  ticketId: string,
  includeInternal: boolean,
) {
  let query = database
    .selectFrom("support_messages as m")
    .leftJoin("users as author", "author.id", "m.author_id")
    .select([
      "m.id",
      "m.author_id",
      "m.author_role",
      "m.internal",
      "m.content",
      "m.created_at",
      "m.updated_at",
      "m.pinned",
      "author.display_name as author_name",
      "author.username as author_username",
      "author.avatar_data_url as author_avatar",
    ])
    .where("m.ticket_id", "=", ticketId)
    // A deleted note is kept for the record, never shown.
    .where("m.deleted_at", "is", null);
  if (!includeInternal) query = query.where("m.internal", "=", false);
  return await query.orderBy("m.created_at").orderBy("m.id").execute();
}

export async function listTicketAttachments(
  database: DatabaseExecutor,
  ticketId: string,
) {
  return await database
    .selectFrom("support_attachments")
    .selectAll()
    .where("ticket_id", "=", ticketId)
    .orderBy("created_at")
    .orderBy("id")
    .execute();
}

/**
 * Gives uploads to the ticket (and message) they were sent with. Only the
 * sender's own uploads not given to anything yet are taken.
 */
export async function claimAttachments(
  database: DatabaseExecutor,
  input: {
    attachmentIds: readonly string[];
    ownerId: string;
    ticketId: string;
    messageId: string | null;
  },
): Promise<string[]> {
  if (input.attachmentIds.length === 0) return [];
  const rows = await database
    .updateTable("support_attachments")
    .set({ ticket_id: input.ticketId, message_id: input.messageId })
    .where("id", "in", input.attachmentIds)
    .where("owner_id", "=", input.ownerId)
    .where("ticket_id", "is", null)
    .returning("id")
    .execute();
  return rows.map((row) => row.id);
}

export async function insertAttachment(
  database: DatabaseExecutor,
  attachment: {
    id: string;
    ownerId: string;
    storageKey: string;
    fileName: string;
    mimeType: string;
    fileSize: number;
    width: number | null;
    height: number | null;
  },
) {
  await database
    .insertInto("support_attachments")
    .values({
      id: attachment.id,
      owner_id: attachment.ownerId,
      storage_key: attachment.storageKey,
      file_name: attachment.fileName,
      mime_type: attachment.mimeType,
      file_size: attachment.fileSize,
      width: attachment.width,
      height: attachment.height,
    })
    .execute();
}

/** An attachment with what deciding who may open it needs. */
export async function findAttachment(
  database: DatabaseExecutor,
  attachmentId: string,
) {
  return await database
    .selectFrom("support_attachments as a")
    .leftJoin("support_tickets as t", "t.id", "a.ticket_id")
    .leftJoin("support_messages as m", "m.id", "a.message_id")
    .select([
      "a.id",
      "a.owner_id",
      "a.storage_key",
      "a.file_name",
      "a.mime_type",
      "a.ticket_id",
      "t.user_id as ticket_user_id",
      "m.internal as message_internal",
    ])
    .where("a.id", "=", attachmentId)
    .executeTakeFirst();
}

/** Bytes this account uploaded since a moment, for the daily allowance. */
export async function uploadedBytesSince(
  database: DatabaseExecutor,
  ownerId: string,
  since: Date,
): Promise<number> {
  const row = await database
    .selectFrom("support_attachments")
    .select(sql<string>`coalesce(sum(file_size), 0)`.as("bytes"))
    .where("owner_id", "=", ownerId)
    .where("created_at", ">=", since)
    .executeTakeFirst();
  return Number(row?.bytes ?? 0);
}

/** Uploads this account never sent, older than a moment. */
export async function listAbandonedAttachments(
  database: DatabaseExecutor,
  ownerId: string,
  olderThan: Date,
) {
  return await database
    .selectFrom("support_attachments")
    .select(["id", "storage_key"])
    .where("owner_id", "=", ownerId)
    .where("ticket_id", "is", null)
    .where("created_at", "<", olderThan)
    .limit(50)
    .execute();
}

/** Deletes the uploads still not sent with anything; returns those deleted. */
export async function deleteUnclaimedAttachments(
  database: DatabaseExecutor,
  attachmentIds: readonly string[],
) {
  if (attachmentIds.length === 0) return [];
  return await database
    .deleteFrom("support_attachments")
    .where("id", "in", attachmentIds)
    .where("ticket_id", "is", null)
    .returning(["id", "storage_key"])
    .execute();
}

/** The ticket's status, its row locked until the transaction ends. */
export async function lockTicketStatus(
  database: DatabaseExecutor,
  ticketId: string,
) {
  const row = await database
    .selectFrom("support_tickets")
    .select("status")
    .where("id", "=", ticketId)
    .forUpdate()
    .executeTakeFirst();
  return row?.status;
}

const replyCount = sql<string>`(
  select count(*) from support_messages m
  where m.ticket_id = t.id and m.author_role = 'staff' and not m.internal
    and m.deleted_at is null
)`;

const attachmentCount = sql<string>`(
  select count(*) from support_attachments a where a.ticket_id = t.id
)`;

/** For the learner: files on internal notes are not theirs to see. */
const visibleAttachmentCount = sql<string>`(
  select count(*) from support_attachments a
  left join support_messages m on m.id = a.message_id
  where a.ticket_id = t.id and not coalesce(m.internal, false)
)`;

/** A learner's own tickets, newest activity first. */
export async function listUserTickets(
  database: DatabaseExecutor,
  userId: string,
) {
  return await database
    .selectFrom("support_tickets as t")
    .select([
      "t.id",
      "t.number",
      "t.kind",
      "t.category",
      "t.rating",
      "t.status",
      "t.title",
      "t.page_label",
      "t.created_at",
      "t.last_message_at",
      "t.user_unread as unread",
      replyCount.as("reply_count"),
      visibleAttachmentCount.as("attachment_count"),
    ])
    .where("t.user_id", "=", userId)
    .orderBy("t.last_message_at", "desc")
    .orderBy("t.id", "desc")
    .limit(200)
    .execute();
}

export async function countUserUnread(
  database: DatabaseExecutor,
  userId: string,
): Promise<number> {
  const row = await database
    .selectFrom("support_tickets")
    .select(sql<string>`count(*)`.as("count"))
    .where("user_id", "=", userId)
    .where("user_unread", "=", true)
    .executeTakeFirst();
  return Number(row?.count ?? 0);
}

export interface AdminTicketFilters {
  kind: SupportTicketKind;
  status?: SupportTicketStatus;
  category?: SupportTicketCategory;
  rating?: number;
  /** A person's id, or null for nobody. */
  assigneeId?: string | null;
  /** Leave out resolved reports. */
  active?: boolean;
  search?: string;
}

function adminTicketsQuery(
  database: DatabaseExecutor,
  filters: AdminTicketFilters,
) {
  let query = database
    .selectFrom("support_tickets as t")
    .innerJoin("users as requester", "requester.id", "t.user_id")
    .leftJoin("users as assignee", "assignee.id", "t.assignee_id")
    .where("t.kind", "=", filters.kind);
  if (filters.status) query = query.where("t.status", "=", filters.status);
  if (filters.active) query = query.where("t.status", "<>", "resolved");
  if (filters.assigneeId === null) {
    query = query.where("t.assignee_id", "is", null);
  } else if (filters.assigneeId) {
    query = query.where("t.assignee_id", "=", filters.assigneeId);
  }
  if (filters.category) {
    query = query.where("t.category", "=", filters.category);
  }
  if (filters.rating) query = query.where("t.rating", "=", filters.rating);
  const search = filters.search?.trim();
  if (search) {
    const number = /^#?(\d{1,12})$/u.exec(search)?.[1];
    const pattern = `%${search.replace(/[\\%_]/gu, (match) => `\\${match}`)}%`;
    query = query.where((eb) =>
      eb.or([
        ...(number ? [eb("t.number", "=", number)] : []),
        eb("t.title", "ilike", pattern),
        eb("t.plain_text", "ilike", pattern),
        eb("requester.display_name", "ilike", pattern),
        eb("requester.username", "ilike", pattern),
        eb("requester.email", "ilike", pattern),
      ]),
    );
  }
  return query;
}

export async function listAdminTickets(
  database: DatabaseExecutor,
  filters: AdminTicketFilters,
  page: {
    sort: "newest" | "oldest";
    limit: number;
    cursor: { id: string; createdAt: Date } | null;
  },
) {
  let query = adminTicketsQuery(database, filters).select([
    "t.id",
    "t.number",
    "t.kind",
    "t.category",
    "t.rating",
    "t.status",
    "t.title",
    "t.plain_text",
    "t.page_label",
    "t.contact_allowed",
    "t.created_at",
    "t.last_message_at",
    "t.staff_unread as unread",
    "t.priority",
    "t.assignee_id",
    "assignee.display_name as assignee_name",
    "assignee.username as assignee_username",
    "assignee.avatar_data_url as assignee_avatar",
    replyCount.as("reply_count"),
    attachmentCount.as("attachment_count"),
    ...requesterColumns,
  ]);
  const newest = page.sort === "newest";
  if (page.cursor) {
    const at = exactCursorTimestamp(
      ["support_tickets"],
      "created_at",
      page.cursor.id,
      page.cursor.createdAt,
    );
    query = newest
      ? query.where(
          sql<boolean>`(t.created_at, t.id) < (${at}, ${page.cursor.id}::uuid)`,
        )
      : query.where(
          sql<boolean>`(t.created_at, t.id) > (${at}, ${page.cursor.id}::uuid)`,
        );
  }
  return await query
    .orderBy("t.created_at", newest ? "desc" : "asc")
    .orderBy("t.id", newest ? "desc" : "asc")
    .limit(page.limit + 1)
    .execute();
}

export async function countAdminTickets(
  database: DatabaseExecutor,
  filters: AdminTicketFilters,
): Promise<number> {
  const row = await adminTicketsQuery(database, filters)
    .select(sql<string>`count(*)`.as("count"))
    .executeTakeFirst();
  return Number(row?.count ?? 0);
}

export async function countByStatus(database: DatabaseExecutor) {
  return await database
    .selectFrom("support_tickets")
    .select([
      "kind",
      "status",
      sql<string>`count(*)`.as("count"),
      sql<string>`count(*) filter (where staff_unread)`.as("unread"),
    ])
    .groupBy(["kind", "status"])
    .execute();
}

export async function feedbackBreakdown(database: DatabaseExecutor) {
  const [ratings, categories, totals] = await Promise.all([
    database
      .selectFrom("support_tickets")
      .select(["rating", sql<string>`count(*)`.as("count")])
      .where("kind", "=", "feedback")
      .where("rating", "is not", null)
      .groupBy("rating")
      .execute(),
    database
      .selectFrom("support_tickets")
      .select(["category", sql<string>`count(*)`.as("count")])
      .where("kind", "=", "feedback")
      .groupBy("category")
      .execute(),
    database
      .selectFrom("support_tickets")
      .select([
        sql<string>`count(*)`.as("total"),
        sql<string>`count(*) filter (where contact_allowed)`.as("contactable"),
        sql<string | null>`avg(rating)`.as("average"),
      ])
      .where("kind", "=", "feedback")
      .executeTakeFirst(),
  ]);
  return { ratings, categories, totals };
}
