import { extname } from "node:path";
import type { Readable } from "node:stream";

import {
  SUPPORT_ATTACHMENT_MAX_BYTES,
  supportStatusFitsKind,
  type CreateSupportMessageRequest,
  type CreateSupportTicketRequest,
  type SupportAdminListQuery,
  type SupportAdminListResponse,
  type SupportAdminStatsResponse,
  type SupportAttachment,
  type SupportTicketDetail,
  type SupportTicketListResponse,
  type SupportTicketStatus,
  type UpdateSupportTicketRequest,
} from "@veolms/contracts";
import type { Database } from "@veolms/database";
import type { Kysely } from "kysely";

import { httpError } from "../../lib/errors.ts";
import { isCursorUuid } from "../../lib/keyset.ts";
import { createOutboxService } from "../../events/outbox.service.ts";
import type { AppServices } from "../../services/index.ts";
import { hasAcademyPermission } from "../authorization/index.ts";
import { displayAvatarUrl } from "../avatars/index.ts";
import {
  DISCUSSION_DEFAULT_EXTENSION_FOR_MIME,
  createDiscussionUploadStore,
  isAllowedExtensionForMimeType,
  isSupportedDiscussionUploadMimeType,
} from "../discussion-uploads/index.ts";
import * as supportRepository from "./support.repository.ts";
import { createSupportStaffService } from "./support-staff.service.ts";
import { iso, markdownToPlainText, snippetFrom } from "./support.text.ts";

const OBJECT_PREFIX = "protected/support-uploads";
const DAILY_UPLOAD_BYTES = 500 * 1024 * 1024;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface IncomingSupportFile {
  filename: string;
  mimetype: string;
  stream: Readable;
  isTruncated: () => boolean;
  /** Read once the file is stored: fields sent after the file are parsed
   * only then. */
  dimensions: () => { width: number | null; height: number | null };
}

function titleFrom(plainText: string, fallback: string): string {
  const firstLine =
    plainText
      .split("\n")
      .map((line) => line.trim())
      .find(Boolean) ?? "";
  if (!firstLine) return fallback;
  return firstLine.length > 120
    ? `${firstLine.slice(0, 117).trimEnd()}…`
    : firstLine;
}

function attachmentUrl(id: string): string {
  return `/support/attachments/${id}`;
}

function presentAttachment(row: {
  id: string;
  file_name: string;
  mime_type: string;
  file_size: string | number;
  width: number | null;
  height: number | null;
}): SupportAttachment {
  return {
    id: row.id,
    fileName: row.file_name,
    mimeType: row.mime_type,
    fileSize: Number(row.file_size),
    width: row.width,
    height: row.height,
    url: attachmentUrl(row.id),
  };
}

function encodeCursor(row: { id: string; created_at: Date }): string {
  return Buffer.from(
    JSON.stringify({ id: row.id, t: row.created_at.toISOString() }),
  ).toString("base64url");
}

function decodeCursor(
  cursor: string | undefined,
): { id: string; createdAt: Date } | null {
  if (!cursor) return null;
  try {
    const parsed = JSON.parse(
      Buffer.from(cursor, "base64url").toString("utf8"),
    ) as { id?: unknown; t?: unknown };
    const createdAt = new Date(String(parsed.t));
    if (isCursorUuid(parsed.id) && !Number.isNaN(createdAt.getTime())) {
      return { id: parsed.id, createdAt };
    }
  } catch {
    // Falls through to the error below.
  }
  throw httpError(400, "INVALID_CURSOR", "This page link is not valid.");
}

function resolveExtension(fileName: string, mimeType: string): string {
  const ext = extname(fileName).toLowerCase();
  if (ext && isAllowedExtensionForMimeType(mimeType, ext)) return ext;
  return DISCUSSION_DEFAULT_EXTENSION_FOR_MIME[mimeType] ?? "";
}

/**
 * Support: learners report problems and send feedback, and talk with the
 * team about them. Staff need `support.read` to see everyone's, and
 * `support.manage` to answer and change a status.
 */
export function createSupportService({
  database,
  services,
}: {
  database: Kysely<Database>;
  services: AppServices;
}) {
  const outbox = createOutboxService();
  const staff = createSupportStaffService({ database });
  const uploadStore = createDiscussionUploadStore(services.storage, {
    objectPrefix: OBJECT_PREFIX,
    diskDirectory: `${process.cwd()}/.data/support-uploads`,
  });

  function fileNameOf(storageKey: string): string {
    return storageKey.slice(OBJECT_PREFIX.length + 1);
  }

  async function canRead(userId: string) {
    return await hasAcademyPermission(database, userId, "support.read");
  }

  async function canManage(userId: string) {
    return await hasAcademyPermission(database, userId, "support.manage");
  }

  /**
   * The ticket, if the viewer may see it: its sender, or support staff.
   * Staff who sent it themselves see it as the sender unless they ask to
   * see it as the team.
   */
  async function loadVisibleTicket(
    viewerId: string,
    ticketId: string,
    asStaff = false,
  ) {
    const ticket = await supportRepository.findTicket(database, ticketId);
    if (!ticket) {
      throw httpError(
        404,
        "SUPPORT_TICKET_NOT_FOUND",
        "We couldn't find this.",
      );
    }
    const isOwner = ticket.user_id === viewerId;
    const isStaff = (asStaff || !isOwner) && (await canRead(viewerId));
    if (!isOwner && !isStaff) {
      throw httpError(
        404,
        "SUPPORT_TICKET_NOT_FOUND",
        "We couldn't find this.",
      );
    }
    return { ticket, isStaff };
  }

  async function createTicket(
    userId: string,
    body: CreateSupportTicketRequest,
  ): Promise<{ id: string; number: number }> {
    const content = body.content.trim();
    const plainText = markdownToPlainText(content);
    const kind = body.kind;
    const fallbackTitle = kind === "problem" ? "Problem report" : "Feedback";
    const courseId =
      body.courseId &&
      (await supportRepository.courseExists(database, body.courseId))
        ? body.courseId
        : null;
    const attachmentIds = [...new Set(body.attachmentIds ?? [])];
    const id = crypto.randomUUID();

    const created = await database.transaction().execute(async (trx) => {
      const ticket = await supportRepository.insertTicket(trx, {
        id,
        userId,
        kind,
        category: body.category,
        rating: kind === "feedback" ? (body.rating ?? null) : null,
        status: kind === "problem" ? "open" : "new",
        title: titleFrom(plainText, fallbackTitle),
        content,
        plainText,
        pagePath: body.pagePath?.trim() || null,
        pageLabel: body.pageLabel?.trim() || null,
        courseId,
        technical: body.technical ? JSON.stringify(body.technical) : null,
        contactAllowed: body.contactAllowed ?? true,
      });
      const claimed = await supportRepository.claimAttachments(trx, {
        attachmentIds,
        ownerId: userId,
        ticketId: id,
        messageId: null,
      });
      if (claimed.length !== attachmentIds.length) {
        throw httpError(
          400,
          "INVALID_ATTACHMENT",
          "One of the files is no longer available. Remove it and add it again.",
        );
      }
      return ticket;
    });
    return { id: created.id, number: Number(created.number) };
  }

  async function listMine(userId: string): Promise<SupportTicketListResponse> {
    const rows = await supportRepository.listUserTickets(database, userId);
    return {
      tickets: rows.map((row) => ({
        id: row.id,
        number: Number(row.number),
        kind: row.kind,
        category: row.category,
        rating: row.rating,
        status: row.status,
        title: row.title,
        pageLabel: row.page_label,
        createdAt: iso(row.created_at),
        lastMessageAt: iso(row.last_message_at),
        unread: row.unread,
        replyCount: Number(row.reply_count),
        attachmentCount: Number(row.attachment_count),
      })),
    };
  }

  async function unreadCount(userId: string) {
    return {
      unread: await supportRepository.countUserUnread(database, userId),
    };
  }

  async function getTicket(
    viewerId: string,
    ticketId: string,
    asStaff = false,
  ): Promise<SupportTicketDetail> {
    const { ticket, isStaff } = await loadVisibleTicket(
      viewerId,
      ticketId,
      asStaff,
    );
    // Opening it is reading it. Cleared before the messages are read: a
    // reply that lands in between is then in this answer, or sets the flag
    // again, and is never marked read unseen.
    if (isStaff ? ticket.staff_unread : ticket.user_unread) {
      await supportRepository.markRead(
        database,
        ticketId,
        isStaff ? "staff" : "user",
      );
    }
    const [messages, attachments, staffSection] = await Promise.all([
      supportRepository.listMessages(database, ticketId, isStaff),
      supportRepository.listTicketAttachments(database, ticketId),
      // The assignee, priority and Activity are the team's alone.
      isStaff ? staff.staffSection(ticket, viewerId) : null,
    ]);

    const visibleMessageIds = new Set(messages.map((message) => message.id));
    const byMessage = new Map<string, SupportAttachment[]>();
    const onTicket: SupportAttachment[] = [];
    for (const attachment of attachments) {
      if (!attachment.message_id) {
        onTicket.push(presentAttachment(attachment));
      } else if (visibleMessageIds.has(attachment.message_id)) {
        const list = byMessage.get(attachment.message_id) ?? [];
        list.push(presentAttachment(attachment));
        byMessage.set(attachment.message_id, list);
      }
    }
    const staffReplies = messages.filter(
      (message) => message.author_role === "staff" && !message.internal,
    );

    return {
      id: ticket.id,
      number: Number(ticket.number),
      kind: ticket.kind,
      category: ticket.category,
      rating: ticket.rating,
      status: ticket.status,
      title: ticket.title,
      pageLabel: ticket.page_label,
      pagePath: ticket.page_path,
      courseId: ticket.course_id,
      technical: ticket.technical,
      contactAllowed: ticket.contact_allowed,
      content: ticket.content,
      createdAt: iso(ticket.created_at),
      lastMessageAt: iso(ticket.last_message_at),
      resolvedAt: ticket.resolved_at ? iso(ticket.resolved_at) : null,
      unread: false,
      replyCount: staffReplies.length,
      // What this viewer can open: a learner never counts internal notes' files.
      attachmentCount:
        onTicket.length +
        [...byMessage.values()].reduce((sum, list) => sum + list.length, 0),
      attachments: onTicket,
      requester: {
        id: ticket.requester_id,
        name: ticket.requester_name,
        username: ticket.requester_username,
        avatarUrl: displayAvatarUrl(ticket.requester_avatar),
        // A learner sees their own address; staff see it to reply.
        email: ticket.requester_email,
      },
      messages: messages.map((message) => ({
        id: message.id,
        authorRole: message.author_role,
        internal: message.internal,
        content: message.content,
        createdAt: iso(message.created_at),
        editedAt: message.updated_at ? iso(message.updated_at) : null,
        pinned: message.internal && message.pinned,
        author: {
          id: message.author_id,
          name:
            message.author_name ??
            (message.author_role === "staff"
              ? "ProCodrr team"
              : "Deleted user"),
          username: message.author_username,
          avatarUrl: displayAvatarUrl(message.author_avatar),
        },
        attachments: byMessage.get(message.id) ?? [],
      })),
      viewerIsStaff: isStaff,
      staff: staffSection,
    };
  }

  async function postMessage(
    viewerId: string,
    ticketId: string,
    body: CreateSupportMessageRequest,
    asStaff = false,
  ): Promise<SupportTicketDetail> {
    const { ticket, isStaff } = await loadVisibleTicket(
      viewerId,
      ticketId,
      asStaff,
    );
    if (isStaff && !(await canManage(viewerId))) {
      throw httpError(
        403,
        "FORBIDDEN",
        "You can read reports but not answer them.",
      );
    }
    const internal = isStaff && Boolean(body.internal);
    if (!isStaff && (body.internal || body.status)) {
      throw httpError(403, "FORBIDDEN", "Only the support team can do this.");
    }
    if (body.status && !supportStatusFitsKind(ticket.kind, body.status)) {
      throw httpError(
        400,
        "INVALID_STATUS",
        "This status does not apply here.",
      );
    }
    const content = body.content.trim();
    const plainText = markdownToPlainText(content);
    const attachmentIds = [...new Set(body.attachmentIds ?? [])];
    const messageId = crypto.randomUUID();
    const now = new Date();

    await database.transaction().execute(async (trx) => {
      // The status as it stands now, held until this reply is saved, so a
      // change made meanwhile by the team is not missed.
      const currentStatus = await supportRepository.lockTicketStatus(
        trx,
        ticketId,
      );
      // A learner answering a report that was waiting on them, or that was
      // closed, opens it again.
      const nextStatus: SupportTicketStatus | undefined = isStaff
        ? body.status
        : ticket.kind === "problem" &&
            (currentStatus === "waiting" || currentStatus === "resolved")
          ? "open"
          : undefined;
      await supportRepository.insertMessage(trx, {
        id: messageId,
        ticketId,
        authorId: viewerId,
        authorRole: isStaff ? "staff" : "user",
        internal,
        content,
        plainText,
      });
      const claimed = await supportRepository.claimAttachments(trx, {
        attachmentIds,
        ownerId: viewerId,
        ticketId,
        messageId,
      });
      if (claimed.length !== attachmentIds.length) {
        throw httpError(
          400,
          "INVALID_ATTACHMENT",
          "One of the files is no longer available. Remove it and add it again.",
        );
      }
      await supportRepository.updateTicket(trx, ticketId, {
        ...(nextStatus
          ? {
              status: nextStatus,
              resolvedAt: nextStatus === "resolved" ? now : null,
            }
          : {}),
        ...(internal
          ? {}
          : isStaff
            ? { userUnread: true, lastMessageAt: now }
            : { staffUnread: true, lastMessageAt: now }),
      });
      if (isStaff && !internal) {
        await outbox.publish(trx, {
          type: "support.reply_posted",
          version: 1,
          dedupeKey: `support.reply_posted:${messageId}`,
          occurredAt: now,
          payload: {
            recipientUserId: ticket.user_id,
            ticketId,
            ticketNumber: Number(ticket.number),
            ticketKind: ticket.kind,
            replySnippet: snippetFrom(plainText, 280) || "New reply",
            // Feedback sent with "don't contact me" gets the reply in the
            // app only, never by email.
            emailAllowed: ticket.kind === "problem" || ticket.contact_allowed,
          },
        });
      }
    });

    return await getTicket(viewerId, ticketId, asStaff);
  }

  /** Status, assignee, priority or category, changed by staff and logged. */
  async function updateTicket(
    staffId: string,
    ticketId: string,
    body: UpdateSupportTicketRequest,
  ): Promise<SupportTicketDetail> {
    await staff.updateTicket(staffId, ticketId, body);
    return await getTicket(staffId, ticketId, true);
  }

  async function editNote(
    staffId: string,
    ticketId: string,
    messageId: string,
    content: string,
  ): Promise<SupportTicketDetail> {
    await staff.editNote(staffId, ticketId, messageId, content);
    return await getTicket(staffId, ticketId, true);
  }

  async function pinNote(
    staffId: string,
    ticketId: string,
    messageId: string,
    pinned: boolean,
  ): Promise<SupportTicketDetail> {
    await staff.pinNote(staffId, ticketId, messageId, pinned);
    return await getTicket(staffId, ticketId, true);
  }

  async function deleteNote(
    staffId: string,
    ticketId: string,
    messageId: string,
  ): Promise<SupportTicketDetail> {
    await staff.deleteNote(staffId, ticketId, messageId);
    return await getTicket(staffId, ticketId, true);
  }

  async function listForStaff(
    viewerId: string,
    query: SupportAdminListQuery,
  ): Promise<SupportAdminListResponse> {
    const limit = query.limit ?? 30;
    const sort = query.sort ?? "newest";
    const filters = {
      kind: query.kind,
      status: query.status,
      category: query.category,
      rating: query.rating,
      active: query.active,
      assigneeId:
        query.assignee === undefined
          ? undefined
          : query.assignee === "none"
            ? null
            : query.assignee === "me"
              ? viewerId
              : query.assignee,
      search: query.search,
    };
    const [rows, totalCount] = await Promise.all([
      supportRepository.listAdminTickets(database, filters, {
        sort,
        limit,
        cursor: decodeCursor(query.cursor),
      }),
      supportRepository.countAdminTickets(database, filters),
    ]);
    const page = rows.slice(0, limit);
    const last = page.at(-1);
    return {
      tickets: page.map((row) => ({
        id: row.id,
        number: Number(row.number),
        kind: row.kind,
        category: row.category,
        rating: row.rating,
        status: row.status,
        title: row.title,
        snippet: snippetFrom(row.plain_text, 280),
        pageLabel: row.page_label,
        contactAllowed: row.contact_allowed,
        createdAt: iso(row.created_at),
        lastMessageAt: iso(row.last_message_at),
        unread: row.unread,
        replyCount: Number(row.reply_count),
        attachmentCount: Number(row.attachment_count),
        requester: {
          id: row.requester_id,
          name: row.requester_name,
          username: row.requester_username,
          avatarUrl: displayAvatarUrl(row.requester_avatar),
          email: row.requester_email,
        },
        assignee: row.assignee_id
          ? {
              id: row.assignee_id,
              name: row.assignee_name ?? "Former team member",
              username: row.assignee_username,
              avatarUrl: displayAvatarUrl(row.assignee_avatar),
            }
          : null,
        priority: row.priority,
      })),
      nextCursor: rows.length > limit && last ? encodeCursor(last) : null,
      totalCount,
    };
  }

  async function statsForStaff(
    viewerId: string,
  ): Promise<SupportAdminStatsResponse> {
    const [byStatus, breakdown, mine] = await Promise.all([
      supportRepository.countByStatus(database),
      supportRepository.feedbackBreakdown(database),
      staff.assignedToMe(viewerId),
    ]);
    const count = (kind: string, status: string) =>
      Number(
        byStatus.find((row) => row.kind === kind && row.status === status)
          ?.count ?? 0,
      );
    const unreadProblems = byStatus
      .filter((row) => row.kind === "problem")
      .reduce((sum, row) => sum + Number(row.unread), 0);
    const ratings = [1, 2, 3, 4, 5].map((rating) =>
      Number(
        breakdown.ratings.find((row) => row.rating === rating)?.count ?? 0,
      ),
    );
    const category = (name: string) =>
      Number(
        breakdown.categories.find((row) => row.category === name)?.count ?? 0,
      );
    const average = breakdown.totals?.average;
    return {
      problems: {
        open: count("problem", "open"),
        in_progress: count("problem", "in_progress"),
        waiting: count("problem", "waiting"),
        resolved: count("problem", "resolved"),
        unread: unreadProblems,
        assignedToMe: mine.problems,
      },
      feedback: {
        new: count("feedback", "new"),
        reviewed: count("feedback", "reviewed"),
        planned: count("feedback", "planned"),
        total: Number(breakdown.totals?.total ?? 0),
        averageRating:
          average === null || average === undefined
            ? null
            : Math.round(Number(average) * 10) / 10,
        ratings,
        idea: category("idea"),
        like: category("like"),
        confusing: category("confusing"),
        content: category("content"),
        contactable: Number(breakdown.totals?.contactable ?? 0),
        assignedToMe: mine.feedback,
      },
    };
  }

  /** Removes this account's uploads it never sent, a day after they were made. */
  async function tidyAbandonedUploads(userId: string) {
    const abandoned = await supportRepository.listAbandonedAttachments(
      database,
      userId,
      new Date(Date.now() - DAY_MS),
    );
    if (abandoned.length === 0) return;
    // Only those still unsent when deleted: one sent meanwhile is kept.
    const removed = await supportRepository.deleteUnclaimedAttachments(
      database,
      abandoned.map((row) => row.id),
    );
    await Promise.all(
      removed.map((row) => uploadStore.remove(fileNameOf(row.storage_key))),
    );
  }

  async function uploadAttachment(
    userId: string,
    file: IncomingSupportFile,
  ): Promise<SupportAttachment> {
    if (!isSupportedDiscussionUploadMimeType(file.mimetype)) {
      throw httpError(
        415,
        "UNSUPPORTED_MEDIA_TYPE",
        "Choose an image, a video, a PDF or a document.",
      );
    }
    const usedBytes = await supportRepository.uploadedBytesSince(
      database,
      userId,
      new Date(Date.now() - DAY_MS),
    );
    if (usedBytes >= DAILY_UPLOAD_BYTES) {
      throw httpError(
        429,
        "UPLOAD_QUOTA_EXCEEDED",
        "You've added a lot of files today. Try again tomorrow.",
      );
    }

    const id = crypto.randomUUID();
    const fileName = `${id}${resolveExtension(file.filename, file.mimetype)}`;
    const stored = await uploadStore.putNamedFromStream({
      fileName,
      mimeType: file.mimetype,
      stream: file.stream,
    });
    if (stored.size > SUPPORT_ATTACHMENT_MAX_BYTES || file.isTruncated()) {
      await uploadStore.remove(fileName);
      throw httpError(413, "PAYLOAD_TOO_LARGE", "Files can be up to 50 MB.");
    }
    if (stored.size === 0) {
      await uploadStore.remove(fileName);
      throw httpError(400, "EMPTY_FILE", "This file is empty.");
    }
    const row = {
      id,
      ownerId: userId,
      storageKey: `${OBJECT_PREFIX}/${fileName}`,
      fileName: file.filename.slice(0, 255) || fileName,
      mimeType: file.mimetype,
      fileSize: stored.size,
      ...file.dimensions(),
    };
    try {
      await supportRepository.insertAttachment(database, row);
    } catch (error) {
      await uploadStore.remove(fileName);
      throw error;
    }
    void tidyAbandonedUploads(userId).catch(() => undefined);
    return presentAttachment({
      id,
      file_name: row.fileName,
      mime_type: row.mimeType,
      file_size: row.fileSize,
      width: row.width,
      height: row.height,
    });
  }

  /**
   * A file for its uploader, the ticket's sender, or support staff. Files on
   * internal notes are for staff only. Anything else answers "not found".
   */
  async function openAttachment(viewerId: string, attachmentId: string) {
    const attachment = await supportRepository.findAttachment(
      database,
      attachmentId,
    );
    const notFound = () =>
      httpError(404, "SUPPORT_ATTACHMENT_NOT_FOUND", "File not found.");
    if (!attachment) throw notFound();
    // An internal note's file is for staff only, its uploader included.
    const isUploader =
      attachment.owner_id === viewerId && !attachment.message_internal;
    const isTicketOwner =
      attachment.ticket_user_id === viewerId && !attachment.message_internal;
    if (!isUploader && !isTicketOwner && !(await canRead(viewerId))) {
      throw notFound();
    }
    const file = await uploadStore.get(fileNameOf(attachment.storage_key));
    if (!file) throw notFound();
    return {
      ...file,
      mimeType: attachment.mime_type,
      fileName: attachment.file_name,
    };
  }

  return {
    createTicket,
    listMine,
    unreadCount,
    getTicket,
    postMessage,
    updateTicket,
    editNote,
    pinNote,
    deleteNote,
    listTeam: staff.listTeam,
    listForStaff,
    statsForStaff,
    uploadAttachment,
    openAttachment,
  };
}

export type SupportService = ReturnType<typeof createSupportService>;
