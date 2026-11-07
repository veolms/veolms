import {
  CHAT_BODY_MAX_BYTES,
  CHAT_CHANGES_MAX,
  CHAT_DELETE_FOR_EVERYONE_HOURS,
  CHAT_EDIT_WINDOW_MINUTES,
  CHAT_MAX_PINNED_MESSAGES,
  CHAT_PAGE_SIZE,
  CHAT_RESTORE_DAYS,
  type ChatMessage,
  type ChatSendMessageRequest,
} from "@veolms/contracts";
import { createCache } from "@veolms/api-core";

import type { ChatAttachmentRef } from "@veolms/database";

import { AppError } from "../../../lib/errors.ts";
import { createOutboxService } from "../../../events/outbox.service.ts";
import { encodeChatEvent } from "../realtime/chat-bus.ts";
import { ROLE_LEVEL } from "../shared/chat.access.ts";
import { ChatErrors } from "../shared/chat.errors.ts";
import {
  presentMessage,
  presentPerson,
  preview,
} from "../shared/chat.presenters.ts";
import { createRoomViews, type RoomAccess } from "../shared/chat.room-views.ts";
import type { ChatRuntime } from "../shared/chat.runtime.ts";

const HOUR_MS = 60 * 60 * 1000;
/** One emoji (with skin tones / joiners), like WhatsApp reactions. */
const EMOJI =
  /^(?:\p{Extended_Pictographic}|\p{Regional_Indicator})(?:[\p{Emoji_Modifier}‍️\p{Extended_Pictographic}\p{Regional_Indicator}])*$/u;

/** People listed in Message info (big groups show the first ones). */
const MESSAGE_INFO_LIMIT = 200;
const SEARCH_PAGE = 30;

/**
 * Pages of a chat's messages as everyone sees them, keyed by the chat's
 * change number: any new, edited, deleted, pinned or reacted message moves
 * it, so a cached page is never out of date and needs no clearing, on this
 * server or another. When 400 people open the same course group, the
 * database is read once per change, not once per person. Each viewer's
 * "deleted for me" messages are taken out afterwards (a tiny lookup).
 */
const pageCache = createCache<{
  messages: ChatMessage[];
  hasMoreBefore: boolean;
  hasMoreAfter: boolean;
  oldestSeq: number | null;
}>({
  name: "chat.message-pages",
  ttlMs: 10 * 60_000,
  maxBytes: 48 * 1024 * 1024,
});

export function createMessagesService(runtime: ChatRuntime) {
  const { database, repository, access, receipts, updates } = runtime;
  const views = createRoomViews(runtime);
  const outbox = createOutboxService();

  async function publishMessage(
    type: "message" | "update",
    message: ChatMessage,
  ) {
    try {
      await repository.publish(
        database,
        encodeChatEvent({
          type,
          roomId: message.roomId,
          seq: message.seq,
          eventSeq: message.eventSeq,
          json: JSON.stringify(message),
        }),
      );
    } catch {
      // Best effort: clients catch up by number (CHAT_ROOM_PLAN.md §5.4).
    }
  }

  async function loadMessage(roomId: string, seq: number) {
    const row = await repository.findMessage(database, roomId, seq);
    if (!row) throw ChatErrors.messageNotFound();
    return row;
  }

  async function reloadAndPublish(roomId: string, seq: number) {
    const message = presentMessage(await loadMessage(roomId, seq));
    await publishMessage("update", message);
    return message;
  }

  /** Throws unless the person may post here now. */
  async function assertCanPost(userId: string, ctx: RoomAccess) {
    const { room } = ctx;
    if (room.status !== "active") {
      throw room.status === "locked"
        ? ChatErrors.locked()
        : ChatErrors.roomNotFound();
    }
    if (!ctx.canModerate) {
      const restriction = views.activeRestriction(ctx.restrictions, room.id, [
        "ban",
        "mute",
      ]);
      if (restriction) {
        throw restriction.type === "ban"
          ? ChatErrors.banned()
          : ChatErrors.muted(restriction.until);
      }
    }
    if (room.kind === "course") {
      if (
        !ctx.canModerate &&
        room.course_id &&
        !(await access.canParticipateInCourse(database, userId, room.course_id))
      ) {
        throw ChatErrors.joinCourseFirst();
      }
      if (room.posting_policy === "staff_only" && !ctx.canModerate) {
        throw ChatErrors.staffOnly();
      }
    }
    if (room.kind === "direct") {
      const peers = (await repository.listMembersOf(database, room.id)).filter(
        (m) => m.user_id !== userId,
      );
      const peer = peers[0];
      if (!peer) throw ChatErrors.noAccess();
      if (
        (await repository.blocksBetween(database, userId, peer.user_id))
          .length > 0
      ) {
        throw ChatErrors.blocked();
      }
      if (room.direct_status === "declined") throw ChatErrors.requestDeclined();
      const settings = await repository.getSettings(database);
      if (
        !(await access.directAllowed(
          database,
          settings.direct_policy,
          userId,
          peer.user_id,
        ))
      ) {
        throw ChatErrors.directNotAllowed();
      }
      return { peerId: peer.user_id };
    }
    return { peerId: null };
  }

  /**
   * In-app notifications for @mentions, through the outbox (the
   * notification worker delivers them). Only people in the group who have
   * not turned its notifications off; never for normal group messages.
   */
  async function notifyMentions(
    roomId: string,
    senderName: string,
    message: { id: string; seq: number; body: string },
    mentions: readonly string[],
    roomTitle: string,
  ) {
    if (mentions.length === 0) return;
    const recipients = await repository.listNotifiableMembers(
      database,
      roomId,
      mentions,
    );
    if (recipients.length === 0) return;
    await database.transaction().execute(async (trx) => {
      for (const recipientUserId of recipients) {
        await outbox.publish(trx, {
          type: "chat.mentioned",
          version: 1,
          dedupeKey: `chat.mentioned:${message.id}:${recipientUserId}`,
          occurredAt: new Date(),
          payload: {
            recipientUserId,
            actorName: senderName.slice(0, 255),
            roomTitle: roomTitle.slice(0, 255),
            snippet: preview(message.body).slice(0, 500) || "…",
            deepLink: `/chat/${roomId}?seq=${message.seq}`,
          },
        });
      }
    });
  }

  /** One page of a chat as everyone sees it (cached above). */
  async function readPage(
    roomId: string,
    query: { before?: number; after?: number; around?: number },
    limit: number,
  ) {
    let rows;
    let hasMoreBefore = false;
    let hasMoreAfter = false;
    if (query.around !== undefined) {
      const half = Math.max(1, Math.floor(limit / 2));
      const before = await repository.listMessages(database, null, roomId, {
        mode: "before",
        seq: query.around + 1,
        limit: half,
      });
      const after = await repository.listMessages(database, null, roomId, {
        mode: "after",
        seq: query.around,
        limit: limit - half,
      });
      rows = [...before.rows, ...after.rows];
      hasMoreBefore = before.hasMore;
      hasMoreAfter = after.hasMore;
    } else if (query.after !== undefined) {
      const page = await repository.listMessages(database, null, roomId, {
        mode: "after",
        seq: query.after,
        limit,
      });
      rows = page.rows;
      hasMoreAfter = page.hasMore;
    } else if (query.before !== undefined) {
      const page = await repository.listMessages(database, null, roomId, {
        mode: "before",
        seq: query.before,
        limit,
      });
      rows = page.rows;
      hasMoreBefore = page.hasMore;
    } else {
      const page = await repository.listMessages(database, null, roomId, {
        mode: "latest",
        limit,
      });
      rows = page.rows;
      hasMoreBefore = page.hasMore;
    }
    return {
      messages: rows.map(presentMessage),
      hasMoreBefore,
      hasMoreAfter,
      oldestSeq: await repository.oldestSeq(database, roomId),
    };
  }

  return {
    /** Throws unless the person may post in this chat now (uploads ask first). */
    async assertCanPostIn(userId: string, roomId: string) {
      const ctx = await views.assertCanRead(database, userId, roomId);
      await assertCanPost(userId, ctx);
      return ctx;
    },

    /**
     * "Message info" for your own message (WhatsApp): who has read it and
     * who has only received it. In a private chat with read receipts off on
     * either side, "read" is not told apart from "received".
     */
    async info(userId: string, roomId: string, seq: number) {
      const ctx = await views.assertCanRead(database, userId, roomId);
      const row = await loadMessage(roomId, seq);
      if (row.sender_id !== userId) throw ChatErrors.notYourMessage();
      const { reached, waiting } = await repository.messageReceipts(
        database,
        roomId,
        seq,
        userId,
        MESSAGE_INFO_LIMIT,
      );
      let receiptsHidden = false;
      if (ctx.room.kind === "direct") {
        const profiles = await repository.getProfiles(database, [
          userId,
          ...reached.map((r) => r.id),
        ]);
        receiptsHidden = profiles.some((p) => !p.read_receipts);
      }
      const readBy = receiptsHidden
        ? []
        : reached.filter((r) => Number(r.last_read_seq) >= seq);
      const read = new Set(readBy.map((r) => r.id));
      const withTime = (row: (typeof reached)[number], at: Date | null) => ({
        ...presentPerson(row),
        at: at ? new Date(at).toISOString() : null,
      });
      return {
        readBy: readBy.map((r) => withTime(r, r.read_at)),
        deliveredTo: reached
          .filter((r) => !read.has(r.id))
          .map((r) => withTime(r, r.delivered_at)),
        waiting,
        receiptsHidden,
      };
    },

    /** "Search in this chat": newest matches first, 30 at a time. */
    async search(
      userId: string,
      roomId: string,
      term: string,
      before: number | undefined,
    ) {
      await views.assertCanRead(database, userId, roomId);
      const page = await repository.searchMessages(
        database,
        userId,
        roomId,
        term,
        before ?? null,
        SEARCH_PAGE,
      );
      return {
        messages: page.rows.map(presentMessage),
        hasMore: page.hasMore,
      };
    },

    async list(
      userId: string,
      roomId: string,
      query: {
        before?: number;
        after?: number;
        around?: number;
        limit?: number;
      },
    ) {
      const ctx = await views.assertCanRead(database, userId, roomId);
      const limit = query.limit ?? CHAT_PAGE_SIZE;
      const key = [
        roomId,
        ctx.room.last_event_seq,
        query.around ?? "",
        query.after ?? "",
        query.before ?? "",
        limit,
      ].join(":");
      const page = await pageCache.fetch(key, () =>
        readPage(roomId, query, limit),
      );
      const hidden = await repository.hiddenSeqs(
        database,
        userId,
        roomId,
        page.messages.map((m) => m.seq),
      );
      return {
        ...page,
        messages:
          hidden.size > 0
            ? page.messages.filter((m) => !hidden.has(m.seq))
            : page.messages,
        lastSeq: Number(ctx.room.last_seq),
        lastEventSeq: Number(ctx.room.last_event_seq),
      };
    },

    /** Everything new, edited, deleted, pinned or reacted to since `since`. */
    async changes(userId: string, roomId: string, since: number) {
      const ctx = await views.assertCanRead(database, userId, roomId);
      const lastEventSeq = Number(ctx.room.last_event_seq);
      const lastSeq = Number(ctx.room.last_seq);
      if (lastEventSeq - since > CHAT_CHANGES_MAX || since > lastEventSeq) {
        // Too far behind, or numbers went back (a failover lost the newest
        // events): reload the latest page instead.
        return { reset: true, messages: [], lastSeq, lastEventSeq };
      }
      const rows = await repository.listChangesSince(
        database,
        userId,
        roomId,
        since,
        CHAT_CHANGES_MAX,
      );
      if (rows.length > CHAT_CHANGES_MAX) {
        return { reset: true, messages: [], lastSeq, lastEventSeq };
      }
      return {
        reset: false,
        messages: rows.map(presentMessage),
        lastSeq,
        lastEventSeq,
      };
    },

    async send(userId: string, roomId: string, input: ChatSendMessageRequest) {
      if (Buffer.byteLength(input.body) > CHAT_BODY_MAX_BYTES) {
        throw new AppError(
          400,
          "CHAT_MESSAGE_TOO_LONG",
          "This message is too long.",
        );
      }
      const ctx = await views.assertCanRead(database, userId, roomId);
      const { room } = ctx;
      await assertCanPost(userId, ctx);

      const level = ROLE_LEVEL[ctx.role];
      const isStaff = level >= ROLE_LEVEL.staff;

      // Files: finished uploads of this sender for this chat. A retry of a
      // message already sent finds its files attached: return that message.
      const attachmentIds = [...new Set(input.attachmentIds ?? [])];
      let attachments: ChatAttachmentRef[] = [];
      if (attachmentIds.length > 0) {
        if (!room.attachments_allowed && !ctx.canModerate) {
          throw ChatErrors.attachmentsOff();
        }
        const uploads = await repository.listReadyUploads(
          database,
          userId,
          roomId,
          attachmentIds,
        );
        if (uploads.length !== attachmentIds.length) {
          const already = await repository.findSeqByClient(
            database,
            roomId,
            userId,
            input.clientId,
          );
          if (already !== null) {
            return {
              message: presentMessage(await loadMessage(roomId, already)),
              duplicate: true,
            };
          }
          throw ChatErrors.uploadNotReady();
        }
        const byId = new Map(uploads.map((u) => [u.id, u]));
        attachments = attachmentIds.map((uploadId) => {
          const u = byId.get(uploadId)!;
          return {
            id: u.id,
            kind: u.kind,
            name: u.file_name,
            mimeType: u.mime_type,
            size: Number(u.size_bytes),
            width: u.width,
            height: u.height,
            durationMs: u.duration_ms,
            waveform: u.waveform,
          };
        });
      }

      const recipientOfRequest =
        room.kind === "direct" &&
        room.direct_status === "requested" &&
        room.requested_by !== userId;
      const maxBeforeAccept =
        room.kind === "direct" &&
        room.direct_status === "requested" &&
        room.requested_by === userId
          ? 1
          : null;

      const [sender] = await repository.getPeople(database, [userId]);
      const senderName = sender?.display_name ?? "Someone";
      const mentions = [...new Set(input.mentions ?? [])].filter(
        (id) => id !== userId,
      );
      const mentionAll =
        Boolean(input.mentionAll) && isStaff && room.kind !== "direct";
      const roomTitle =
        room.kind === "course" && room.course_id
          ? ((await access.courseGate(database, room.course_id))?.title ??
            "a group")
          : (room.title ?? "a chat");

      const id = crypto.randomUUID();
      const result = await repository.sendMessage(database, {
        roomId,
        id,
        senderId: userId,
        senderRole: ctx.role,
        clientId: input.clientId,
        kind: "text",
        body: input.body,
        replyToSeq: input.replyToSeq ?? null,
        mentions,
        mentionAll,
        exemptLimits: isStaff,
        maxBeforeAccept,
        attachments,
      });

      switch (result.outcome) {
        case "room_missing":
          throw ChatErrors.roomNotFound();
        case "locked":
          throw ChatErrors.locked();
        case "slow_mode":
          throw ChatErrors.slowMode(result.wait_seconds ?? 1);
        case "repeated":
          throw ChatErrors.repeated();
        case "awaiting_accept":
          throw ChatErrors.awaitingAccept();
        case "sent":
        case "duplicate":
          break;
      }

      const seq = Number(result.message_seq);
      const message = presentMessage(await loadMessage(roomId, seq));
      if (result.outcome === "sent") {
        await publishMessage("message", message);
        // Replying to a request accepts it, as in WhatsApp.
        if (recipientOfRequest) {
          await acceptRequest(room.id);
        }
        if (room.kind !== "direct") {
          await notifyMentions(
            roomId,
            senderName,
            { id, seq, body: input.body },
            mentions,
            roomTitle,
          ).catch(() => {
            // The message is sent; a lost mention notification is not fatal.
          });
        }
      }
      if (result.outcome === "sent" && attachments.length > 0) {
        await repository.attachUploads(
          database,
          attachments.map((a) => a.id),
          roomId,
          seq,
        );
      }
      // Your own message counts as read.
      receipts.add({ roomId, userId, readSeq: seq, deliveredSeq: seq });
      return { message, duplicate: result.outcome === "duplicate" };
    },

    async edit(userId: string, roomId: string, seq: number, body: string) {
      if (Buffer.byteLength(body) > CHAT_BODY_MAX_BYTES) {
        throw new AppError(
          400,
          "CHAT_MESSAGE_TOO_LONG",
          "This message is too long.",
        );
      }
      const ctx = await views.assertCanRead(database, userId, roomId);
      const row = await loadMessage(roomId, seq);
      if (row.sender_id !== userId) throw ChatErrors.notYourMessage();
      if (row.deleted_at) throw ChatErrors.alreadyDeleted();
      if (
        Date.now() - row.created_at.getTime() >
        CHAT_EDIT_WINDOW_MINUTES * 60_000
      ) {
        throw ChatErrors.editWindowOver();
      }
      await assertCanPost(userId, ctx);
      if (row.body === body) return { message: presentMessage(row) };
      await repository.changeMessage(database, roomId, seq, {
        kind: "edit",
        body,
      });
      return { message: await reloadAndPublish(roomId, seq) };
    },

    /** Delete for everyone (own message, or as admin) or for me only. */
    async remove(
      userId: string,
      roomId: string,
      seq: number,
      scope: "everyone" | "me",
    ) {
      const ctx = await views.assertCanRead(database, userId, roomId);
      const row = await loadMessage(roomId, seq);
      if (scope === "me") {
        await repository.hideMessageFor(database, userId, roomId, seq);
        return { ok: true as const };
      }
      if (row.deleted_at) return { ok: true as const };
      const own = row.sender_id === userId;
      if (own) {
        if (
          Date.now() - row.created_at.getTime() >
          CHAT_DELETE_FOR_EVERYONE_HOURS * HOUR_MS
        ) {
          throw ChatErrors.deleteWindowOver();
        }
      } else {
        await assertCanActOnSender(userId, ctx, row.sender_id, row.sender_role);
      }
      await repository.changeMessage(database, roomId, seq, {
        kind: "delete",
        by: userId,
        reason: own ? "self" : "admin",
      });
      if (!own) {
        await repository.log(database, {
          actorId: userId,
          action: "message.delete",
          roomId,
          targetUserId: row.sender_id,
          seq,
        });
      }
      await reloadAndPublish(roomId, seq);
      return { ok: true as const };
    },

    async restore(userId: string, roomId: string, seq: number) {
      const ctx = await views.assertCanRead(database, userId, roomId);
      if (!ctx.canModerate) throw ChatErrors.notModerator();
      const row = await loadMessage(roomId, seq);
      if (
        !row.deleted_at ||
        row.deleted_reason !== "admin" ||
        row.body === "" ||
        Date.now() - row.deleted_at.getTime() > CHAT_RESTORE_DAYS * 24 * HOUR_MS
      ) {
        throw ChatErrors.notRestorable();
      }
      await repository.changeMessage(database, roomId, seq, {
        kind: "restore",
      });
      await repository.log(database, {
        actorId: userId,
        action: "message.restore",
        roomId,
        targetUserId: row.sender_id,
        seq,
      });
      return { message: await reloadAndPublish(roomId, seq) };
    },

    async pin(userId: string, roomId: string, seq: number, pinned: boolean) {
      const ctx = await views.assertCanRead(database, userId, roomId);
      // Group admins pin in groups; either person pins in a private chat.
      if (ctx.room.kind !== "direct" && !ctx.canModerate)
        throw ChatErrors.notModerator();
      const row = await loadMessage(roomId, seq);
      if (row.deleted_at) throw ChatErrors.alreadyDeleted();
      if (pinned === (row.pinned_at !== null))
        return { message: presentMessage(row) };
      if (
        pinned &&
        (await repository.countPinnedMessages(database, roomId)) >=
          CHAT_MAX_PINNED_MESSAGES
      ) {
        throw ChatErrors.pinLimit(CHAT_MAX_PINNED_MESSAGES);
      }
      await repository.changeMessage(
        database,
        roomId,
        seq,
        pinned ? { kind: "pin", by: userId } : { kind: "unpin" },
      );
      return { message: await reloadAndPublish(roomId, seq) };
    },

    async react(
      userId: string,
      roomId: string,
      seq: number,
      emoji: string | null,
    ) {
      if (emoji !== null && !EMOJI.test(emoji))
        throw ChatErrors.invalidReaction();
      const ctx = await views.assertCanRead(database, userId, roomId);
      if (
        !ctx.canModerate &&
        views.activeRestriction(ctx.restrictions, roomId, ["ban", "mute"])
      ) {
        throw ChatErrors.muted(null);
      }
      const row = await loadMessage(roomId, seq);
      if (row.deleted_at) throw ChatErrors.alreadyDeleted();
      await repository.setReaction(database, roomId, seq, userId, emoji);
      const version = await repository.changeMessage(database, roomId, seq, {
        kind: "recount_reactions",
      });
      const message = presentMessage(await loadMessage(roomId, seq));
      updates.submit(`${roomId}:${seq}`, version ?? 0, async () => {
        // The newest state when the window ends.
        const latest = presentMessage(await loadMessage(roomId, seq));
        await publishMessage("update", latest);
      });
      return { message };
    },

    async star(userId: string, roomId: string, seq: number, starred: boolean) {
      await views.assertCanRead(database, userId, roomId);
      await loadMessage(roomId, seq);
      await repository.setStar(database, userId, roomId, seq, starred);
      return { ok: true as const };
    },

    async listStars(userId: string) {
      const rows = await repository.listStars(database, userId, 200);
      return {
        messages: rows.map((row) => ({
          ...presentMessage(row),
          roomTitle: row.course_title ?? row.room_title ?? "Chat",
          starredAt: row.starred_at.toISOString(),
        })),
      };
    },

    /** Queues read/delivered positions (written in batches). */
    receipts(
      userId: string,
      entries: ReadonlyArray<{
        roomId: string;
        readSeq?: number;
        deliveredSeq?: number;
      }>,
    ) {
      for (const entry of entries) {
        receipts.add({
          roomId: entry.roomId,
          userId,
          readSeq: entry.readSeq ?? 0,
          deliveredSeq: entry.deliveredSeq ?? 0,
        });
      }
      return { ok: true as const };
    },

    /** "typing…": private chats and team groups only; nothing is stored. */
    async typing(userId: string, roomId: string) {
      const ctx = await views.assertCanRead(database, userId, roomId);
      if (ctx.room.kind === "course") throw ChatErrors.wrongRoomKind();
      const [person] = await repository.getPeople(database, [userId]);
      await repository.publish(
        database,
        encodeChatEvent({
          type: "typing",
          roomId,
          userId,
          name: person?.display_name ?? "",
        }),
      );
      return { ok: true as const };
    },
  };

  /** Moderators act only on people below them; helpers only on learners. */
  async function assertCanActOnSender(
    userId: string,
    ctx: RoomAccess,
    senderId: string | null,
    senderRole: string,
  ) {
    const isHelperAction = ctx.isHelper && !ctx.canModerate;
    if (!ctx.canModerate && !isHelperAction) throw ChatErrors.notModerator();
    if (!senderId) return;
    const currentRole = await access.roleIn(
      database,
      senderId,
      ctx.room,
      await repository.findMember(database, ctx.room.id, senderId),
    );
    const targetLevel = Math.max(
      ROLE_LEVEL[currentRole],
      ROLE_LEVEL[(senderRole as keyof typeof ROLE_LEVEL) ?? "learner"] ?? 1,
    );
    if (targetLevel >= ROLE_LEVEL[ctx.role]) throw ChatErrors.targetOutranks();
    if (isHelperAction && targetLevel > ROLE_LEVEL.learner) {
      throw ChatErrors.targetOutranks();
    }
  }

  async function acceptRequest(roomId: string) {
    const updated = await repository.updateRoom(database, roomId, {
      direct_status: "accepted",
    });
    if (updated) {
      await repository.publish(
        database,
        encodeChatEvent({
          type: "room",
          roomId,
          eventSeq: Number(updated.last_event_seq),
        }),
      );
    }
  }
}

export type MessagesService = ReturnType<typeof createMessagesService>;
