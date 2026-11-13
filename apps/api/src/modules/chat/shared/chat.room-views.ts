import type {
  ChatRoomDetail,
  ChatRoomSummary,
  ChatSenderRole,
} from "@veolms/contracts";
import type { DatabaseExecutor as Executor } from "@veolms/database";

import { ChatErrors } from "./chat.errors.ts";
import { chatRoomIconUrl, presentMessage, preview } from "./chat.presenters.ts";
import type { ChatRuntime } from "./chat.runtime.ts";
import type {
  ChatRoomRow,
  RestrictionRow,
  RoomListRow,
} from "./chat.repository.ts";

/** "Photo", "Voice message"… for a message that is only a file. */
function attachmentLabel(
  attachments: Array<{ kind: string; name: string }> | null,
): string {
  const first = attachments?.[0];
  if (!first) return "";
  if (first.kind === "audio") return "Voice message";
  if (first.kind === "image")
    return attachments.length > 1 ? `${attachments.length} photos` : "Photo";
  if (first.kind === "video") return "Video";
  return first.name;
}

type CannotPost = ChatRoomSummary["me"]["cannotPostReason"];

export interface RoomAccess {
  room: ChatRoomRow;
  member: Awaited<ReturnType<ChatRuntime["repository"]["findMember"]>>;
  role: ChatSenderRole;
  canModerate: boolean;
  isHelper: boolean;
  restrictions: RestrictionRow[];
}

/**
 * Turns chat rows into what the chat list and a chat's header show, and
 * answers "may this person read / post here" the same way everywhere.
 */
export function createRoomViews(runtime: ChatRuntime) {
  const { repository, access } = runtime;

  function activeRestriction(
    restrictions: readonly RestrictionRow[],
    roomId: string,
    types: ReadonlyArray<RestrictionRow["type"]>,
  ): RestrictionRow | undefined {
    return access
      .restrictionsFor(restrictions, roomId)
      .filter((r) => types.includes(r.type))
      .sort((a, b) => {
        // Bans first, then the longest.
        if (a.type !== b.type) return a.type === "ban" ? -1 : 1;
        if (a.until === null) return -1;
        if (b.until === null) return 1;
        return b.until.getTime() - a.until.getTime();
      })[0];
  }

  /**
   * Whether the person may open this chat; throws otherwise. Course groups
   * get the person's own row on first visit (read position = now).
   */
  async function assertCanRead(
    db: Executor,
    userId: string,
    roomId: string,
  ): Promise<RoomAccess> {
    const room = await repository.findRoom(db, roomId);
    if (!room) throw ChatErrors.roomNotFound();
    const restrictions = await repository.listActiveRestrictions(db, userId);
    let member = await repository.findMember(db, roomId, userId);

    if (room.kind === "course") {
      if (
        !room.course_id ||
        !(await access.canReadCourse(db, userId, room.course_id))
      ) {
        throw ChatErrors.noAccess();
      }
      const canModerate = await access.canModerateCourse(
        db,
        userId,
        room.course_id,
      );
      if (room.status === "archived" && !canModerate)
        throw ChatErrors.roomNotFound();
      if (!canModerate && activeRestriction(restrictions, room.id, ["ban"])) {
        throw ChatErrors.banned();
      }
      if (!member) {
        await repository.ensureMembers(db, [{ roomId, userId }]);
        member = await repository.findMember(db, roomId, userId);
      }
      const role = await access.roleIn(db, userId, room, member);
      return {
        room,
        member,
        role,
        canModerate,
        isHelper: member?.room_role === "moderator",
        restrictions,
      };
    }

    const manager = await access.isManager(db, userId);
    if (room.kind === "team") {
      if (!manager && (!member || member.state !== "active")) {
        throw ChatErrors.noAccess();
      }
    } else if (!member || member.state === "left") {
      throw ChatErrors.noAccess();
    }
    if (
      room.kind === "team" &&
      !manager &&
      activeRestriction(restrictions, room.id, ["ban"])
    ) {
      throw ChatErrors.banned();
    }
    const role = await access.roleIn(db, userId, room, member);
    return {
      room,
      member,
      role,
      canModerate:
        room.kind === "team" && (manager || member?.room_role === "owner"),
      isHelper: false,
      restrictions,
    };
  }

  function cannotPostReason(
    room: ChatRoomRow,
    view: {
      userId: string;
      canModerate: boolean;
      restrictions: readonly RestrictionRow[];
      blocked: boolean;
      lastSenderId: string | null;
    },
  ): CannotPost {
    if (room.status === "archived") return "archived";
    if (room.status === "locked") return "locked";
    if (
      !view.canModerate &&
      activeRestriction(view.restrictions, room.id, ["mute", "ban"])
    ) {
      return "muted";
    }
    if (room.kind === "course") {
      if (room.posting_policy === "staff_only" && !view.canModerate) {
        return "staff_only";
      }
      return null;
    }
    if (room.kind === "direct") {
      if (view.blocked) return "blocked";
      if (room.direct_status === "declined") return "request_declined";
      if (
        room.direct_status === "requested" &&
        room.requested_by === view.userId &&
        view.lastSenderId === view.userId
      ) {
        return "request_pending";
      }
    }
    return null;
  }

  /** The chat list for one person (rooms they can see), newest first. */
  async function summaries(
    db: Executor,
    userId: string,
    rows: RoomListRow[],
    restrictions: RestrictionRow[],
  ): Promise<ChatRoomSummary[]> {
    const directIds = rows.filter((r) => r.kind === "direct").map((r) => r.id);
    const groupIds = rows.filter((r) => r.kind !== "direct").map((r) => r.id);
    const [peers, blocks, groups, reactions] = await Promise.all([
      repository.listDirectPeers(db, userId, directIds),
      directIds.length > 0
        ? repository.listBlocksInvolving(db, userId)
        : Promise.resolve([]),
      repository.groupPositions(db, groupIds),
      repository.latestReactions(
        db,
        userId,
        rows.map((r) => r.id),
      ),
    ]);
    const reactionByRoom = new Map(reactions.map((r) => [r.room_id, r]));
    const peerByRoom = new Map(peers.map((p) => [p.room_id, p]));
    const groupByRoom = new Map(groups.map((g) => [g.room_id, g]));
    // Read receipts are reciprocal in private chats (WhatsApp): off on
    // either side hides blue ticks both ways.
    const profiles =
      peers.length > 0
        ? await repository.getProfiles(db, [userId, ...peers.map((p) => p.id)])
        : [];
    const off = await access.receiptsOff(db, profiles);
    const receiptsOn = new Map(
      profiles.map((p) => [p.user_id, !off.has(p.user_id)]),
    );
    const myReceipts = receiptsOn.get(userId) ?? true;
    const blockedWith = new Set(
      blocks.map((b) =>
        b.blocker_id === userId ? b.blocked_id : b.blocker_id,
      ),
    );
    const manager = await access.isManager(db, userId);

    const result: ChatRoomSummary[] = [];
    for (const row of rows) {
      const canModerate =
        row.kind === "course" && row.course_id
          ? await access.canModerateCourse(db, userId, row.course_id)
          : row.kind === "team"
            ? manager || row.room_role === "owner"
            : false;
      const peer = peerByRoom.get(row.id);
      const lastSeq = Number(row.last_seq);
      const lastReadSeq =
        row.last_read_seq === null ? lastSeq : Number(row.last_read_seq);
      const restriction = activeRestriction(restrictions, row.id, [
        "ban",
        "mute",
      ]);
      const reason = cannotPostReason(row, {
        userId,
        canModerate,
        restrictions,
        blocked: peer ? blockedWith.has(peer.id) : false,
        lastSenderId: row.lm_sender_id,
      });
      const peerRole: ChatSenderRole = peer
        ? (await access.isManager(db, peer.id))
          ? "admin"
          : (await access.isPlatformModerator(db, peer.id))
            ? "staff"
            : "learner"
        : "learner";
      result.push({
        id: row.id,
        kind: row.kind,
        title:
          row.kind === "course"
            ? (row.course_title ?? row.title ?? "Course group")
            : row.kind === "direct"
              ? peer
                ? peer.is_deleted
                  ? "Deleted user"
                  : peer.display_name
                : "Private chat"
              : (row.title ?? "Team"),
        courseId: row.course_id,
        iconUrl: chatRoomIconUrl(row),
        customIcon: row.kind !== "direct" && Boolean(row.icon_upload_id),
        peer: peer
          ? {
              id: peer.id,
              name: peer.is_deleted ? "Deleted user" : peer.display_name,
              avatarUrl: peer.is_deleted ? null : peer.avatar_data_url,
              role: peerRole,
            }
          : null,
        directStatus: row.direct_status,
        requestedByMe:
          row.kind === "direct" && row.direct_status === "requested"
            ? row.requested_by === userId
            : null,
        postingPolicy: row.posting_policy,
        slowModeSeconds: row.slow_mode_seconds,
        status: row.status,
        lastSeq,
        lastEventSeq: Number(row.last_event_seq),
        lastMessage:
          row.lm_seq === null ||
          Number(row.lm_seq) <= Number(row.cleared_seq ?? 0)
            ? null
            : {
                seq: Number(row.lm_seq),
                senderId: row.lm_sender_id,
                senderName: row.lm_sender_name,
                preview:
                  row.lm_deleted_at !== null
                    ? ""
                    : row.lm_body
                      ? preview(row.lm_body)
                      : attachmentLabel(row.lm_attachments),
                deleted: row.lm_deleted_at !== null,
                createdAt: (row.lm_created_at ?? new Date()).toISOString(),
              },
        lastMessageAt: row.last_message_at?.toISOString() ?? null,
        lastReaction: (() => {
          const reaction = reactionByRoom.get(row.id);
          // Shown while it is newer than the last message, as in WhatsApp.
          if (
            !reaction ||
            (row.lm_created_at && reaction.created_at <= row.lm_created_at)
          ) {
            return null;
          }
          return {
            emoji: reaction.emoji,
            byId: reaction.user_id,
            byName: reaction.user_deleted ? "Deleted user" : reaction.user_name,
            preview: reaction.body
              ? preview(reaction.body)
              : attachmentLabel(reaction.attachments),
            at: reaction.created_at.toISOString(),
          };
        })(),
        unreadCount: Math.max(0, lastSeq - lastReadSeq),
        // A request not accepted yet shows no ticks either way: opening it
        // is not answering it.
        ...(row.kind === "direct" && row.direct_status === "requested"
          ? { peerDeliveredSeq: null, peerReadSeq: null }
          : ticks(row.kind, peer, groupByRoom.get(row.id), (id) =>
              id === userId
                ? myReceipts
                : myReceipts && (receiptsOn.get(id) ?? true),
            )),
        me: {
          roomRole: (row.room_role ?? "member") as
            "owner" | "moderator" | "member",
          notifyLevel: (row.notify_level ?? "all") as
            "all" | "mentions" | "none",
          mutedUntil:
            row.muted_until && row.muted_until.getTime() > Date.now()
              ? row.muted_until.toISOString()
              : null,
          archived: row.archived_at !== null,
          pinned: row.member_pinned_at !== null,
          lastReadSeq,
          canPost: reason === null,
          cannotPostReason: reason,
          canModerate,
          isHelper: row.room_role === "moderator",
          restriction: restriction
            ? {
                type: restriction.type,
                until: restriction.until?.toISOString() ?? null,
                platformWide: restriction.room_id === null,
              }
            : null,
        },
      });
    }
    return result;
  }

  function ticks(
    kind: string,
    peer:
      | {
          id: string;
          last_delivered_seq: string | null;
          last_read_seq: string | null;
        }
      | undefined,
    group: { delivered: string; read: string; members: string } | undefined,
    /** Whether blue ticks show between the viewer and this person. */
    receiptsWith: (peerId: string) => boolean,
  ) {
    if (kind === "direct") {
      if (!peer) return { peerDeliveredSeq: null, peerReadSeq: null };
      const showRead = receiptsWith(peer.id);
      return {
        peerDeliveredSeq: Number(peer.last_delivered_seq ?? 0),
        peerReadSeq: showRead ? Number(peer.last_read_seq ?? 0) : null,
      };
    }
    // Alone in the group: nobody else can receive it.
    if (!group || Number(group.members) < 2) {
      return { peerDeliveredSeq: null, peerReadSeq: null };
    }
    return {
      peerDeliveredSeq: Number(group.delivered),
      peerReadSeq: Number(group.read),
    };
  }

  /** The rooms a person sees in their list (and gets live events for). */
  async function visibleRoomIds(
    db: Executor,
    userId: string,
    restrictions: readonly RestrictionRow[],
  ): Promise<string[]> {
    // Removed from all of chat: nothing to show.
    if (restrictions.some((r) => r.type === "ban" && r.room_id === null)) {
      const manager = await access.isManager(db, userId);
      if (!manager) return [];
    }
    const [courseIds, memberRoomIds, platformModerator] = await Promise.all([
      access.listedCourseIds(db, userId),
      repository.listMemberRoomIds(db, userId),
      access.isPlatformModerator(db, userId),
    ]);
    const courseRooms = await repository.listCourseRoomIds(
      db,
      courseIds,
      platformModerator,
    );
    const banned = new Set(
      restrictions
        .filter((r) => r.type === "ban" && r.room_id !== null)
        .map((r) => r.room_id!),
    );
    const ids = new Set<string>();
    for (const room of courseRooms) {
      if (!banned.has(room.id) || platformModerator) ids.add(room.id);
    }
    for (const id of memberRoomIds) if (!banned.has(id)) ids.add(id);
    return [...ids];
  }

  /**
   * The other person's "online" / "last seen", or null when either of you
   * hides it (reciprocal, as in WhatsApp).
   */
  async function presenceBetween(
    db: Executor,
    viewerId: string,
    peerId: string,
  ): Promise<{ online: boolean; lastSeenAt: string | null } | null> {
    const profiles = await repository.getProfiles(db, [viewerId, peerId]);
    const mine = profiles.find((p) => p.user_id === viewerId);
    const theirs = profiles.find((p) => p.user_id === peerId);
    if (mine && !mine.show_presence) return null;
    if (theirs && !theirs.show_presence) return null;
    if (!theirs) return { online: false, lastSeenAt: null };
    return {
      online:
        theirs.online_until !== null &&
        theirs.online_until.getTime() > Date.now(),
      lastSeenAt: theirs.last_seen_at?.toISOString() ?? null,
    };
  }

  async function detail(
    db: Executor,
    userId: string,
    roomAccess: RoomAccess,
  ): Promise<ChatRoomDetail> {
    const { room } = roomAccess;
    const [rows, pinned, memberCount, names] = await Promise.all([
      repository.listRoomsForUser(db, userId, [room.id]),
      repository.listPinned(db, userId, room.id),
      room.kind === "direct"
        ? Promise.resolve(2)
        : repository.countActiveMembers(db, room.id),
      room.kind === "direct"
        ? Promise.resolve([])
        : repository.memberNames(db, room.id, 12),
    ]);
    const [summary] = await summaries(
      db,
      userId,
      rows,
      roomAccess.restrictions,
    );
    if (!summary) throw ChatErrors.roomNotFound();
    if (
      room.kind === "course" &&
      summary.me.canPost &&
      !roomAccess.canModerate &&
      room.course_id &&
      !(await access.canParticipateInCourse(db, userId, room.course_id))
    ) {
      summary.me.canPost = false;
      summary.me.cannotPostReason = "not_joined";
    }
    if (
      room.kind === "direct" &&
      summary.me.canPost &&
      summary.peer &&
      (await access.isChatStaff(db, summary.peer.id)) &&
      !(await access.isChatStaff(db, userId)) &&
      (await repository.countSenderMessages(db, room.id, summary.peer.id)) === 0
    ) {
      summary.me.canPost = false;
      summary.me.cannotPostReason = "staff_first";
    }
    if (room.kind === "direct" && summary.me.canPost && summary.peer) {
      // A private chat stays writable only while the policy allows it.
      const settings = await repository.getSettings(db);
      const allowed = await access.directAllowed(
        db,
        settings.direct_policy,
        userId,
        summary.peer.id,
      );
      if (!allowed) {
        summary.me.canPost = false;
        summary.me.cannotPostReason = "direct_not_allowed";
      }
    }
    return {
      ...summary,
      me: { ...summary.me, isHelper: roomAccess.isHelper },
      memberNames: names
        .filter((n) => n.id !== userId)
        .map((n) => n.display_name),
      peerPresence:
        room.kind === "direct" && summary.peer
          ? await presenceBetween(db, userId, summary.peer.id)
          : null,
      description: room.description,
      directMessagesAllowed: room.direct_messages_allowed,
      attachmentsAllowed: room.attachments_allowed,
      memberCount,
      pinnedMessages: pinned.map(presentMessage),
    };
  }

  return {
    assertCanRead,
    activeRestriction,
    cannotPostReason,
    summaries,
    visibleRoomIds,
    detail,
  };
}

export type RoomViews = ReturnType<typeof createRoomViews>;
