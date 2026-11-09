import {
  CHAT_MAX_PINNED_CHATS,
  CHAT_TEAM_ROOM_MAX_MEMBERS,
  type ChatSenderRole,
} from "@veolms/contracts";

import { isOpenFreeCourse } from "../../access/index.ts";
import { encodeChatEvent } from "../realtime/chat-bus.ts";
import { ChatErrors } from "../shared/chat.errors.ts";
import { createRoomViews } from "../shared/chat.room-views.ts";
import type { ChatRuntime } from "../shared/chat.runtime.ts";

export function createRoomsService(runtime: ChatRuntime) {
  const { database, repository, access } = runtime;
  const views = createRoomViews(runtime);

  async function publish(event: Parameters<typeof encodeChatEvent>[0]) {
    try {
      await repository.publish(database, encodeChatEvent(event));
    } catch {
      // Best effort: clients refresh the chat on reconnect.
    }
  }

  async function roomDetail(userId: string, roomId: string) {
    const ctx = await views.assertCanRead(database, userId, roomId);
    return { room: await views.detail(database, userId, ctx) };
  }

  async function assertManager(userId: string) {
    if (!(await access.isManager(database, userId)))
      throw ChatErrors.notManager();
  }

  return {
    /** The chat list: groups, private chats and requests, newest first. */
    async list(userId: string, options: { archived?: boolean }) {
      const restrictions = await repository.listActiveRestrictions(
        database,
        userId,
      );
      const ids = await views.visibleRoomIds(database, userId, restrictions);
      // A chat you deleted stays out of your list until a newer message.
      let rows = (
        await repository.listRoomsForUser(database, userId, ids)
      ).filter(
        (r) =>
          r.member_deleted_at === null ||
          Number(r.last_seq) > Number(r.cleared_seq ?? 0),
      );

      // First time someone sees a course group: their read position starts now.
      const missing = rows.filter(
        (r) => r.kind === "course" && r.member_state === null,
      );
      if (missing.length > 0) {
        await repository.ensureMembers(
          database,
          missing.map((r) => ({ roomId: r.id, userId })),
        );
        rows = rows.map((r) =>
          r.kind === "course" && r.member_state === null
            ? {
                ...r,
                member_state: "active",
                last_read_seq: r.last_seq,
                last_delivered_seq: r.last_seq,
              }
            : r,
        );
      }

      const summaries = await views.summaries(
        database,
        userId,
        rows,
        restrictions,
      );
      const visible = summaries.filter((s) =>
        options.archived === undefined
          ? true
          : s.me.archived === options.archived,
      );
      visible.sort((a, b) => {
        if (a.me.pinned !== b.me.pinned) return a.me.pinned ? -1 : 1;
        const at = a.lastMessageAt ?? "";
        const bt = b.lastMessageAt ?? "";
        return at < bt ? 1 : at > bt ? -1 : 0;
      });
      return {
        rooms: visible,
        requestsCount: summaries.filter(
          (s) =>
            s.kind === "direct" &&
            s.directStatus === "requested" &&
            s.requestedByMe === false,
        ).length,
        unreadTotal: summaries
          .filter((s) => !s.me.archived && s.me.notifyLevel !== "none")
          .reduce((sum, s) => sum + s.unreadCount, 0),
      };
    },

    detail: roomDetail,

    /**
     * Turns on chat for a course: creates its group (once). Open free
     * courses start as announcement groups (decision 3).
     */
    async enableCourseChat(userId: string, courseId: string) {
      const course = await access.courseGate(database, courseId);
      if (!course || course.deleted_at) throw ChatErrors.courseNotFound();
      if (!(await access.canModerateCourse(database, userId, courseId))) {
        throw ChatErrors.notModerator();
      }
      const existing = await repository.findCourseRoom(database, courseId);
      if (existing) {
        if (existing.status === "archived") {
          const updated = await repository.updateRoom(database, existing.id, {
            status: "active",
          });
          if (updated) {
            await publish({
              type: "room",
              roomId: existing.id,
              eventSeq: Number(updated.last_event_seq),
            });
            await publish({ type: "opened", roomId: existing.id });
          }
        }
        return roomDetail(userId, existing.id);
      }
      const { room } = await repository.insertRoom(database, {
        id: crypto.randomUUID(),
        kind: "course",
        course_id: courseId,
        posting_policy: isOpenFreeCourse(course) ? "staff_only" : "everyone",
        created_by: userId,
      });
      const created =
        room ?? (await repository.findCourseRoom(database, courseId));
      if (!created) throw ChatErrors.roomNotFound();
      await repository.log(database, {
        actorId: userId,
        action: "room.enable",
        roomId: created.id,
        details: { courseId },
      });
      // Everyone who may read it and has Chats open gets it now, not at
      // their next reconnect.
      await publish({ type: "opened", roomId: created.id });
      return roomDetail(userId, created.id);
    },

    /** Group settings (WhatsApp's "Group settings"): admins only. */
    async updateSettings(
      userId: string,
      roomId: string,
      patch: {
        title?: string;
        description?: string | null;
        postingPolicy?: "everyone" | "staff_only";
        slowModeSeconds?: number;
        directMessagesAllowed?: boolean;
        attachmentsAllowed?: boolean;
        iconUploadId?: string | null;
        status?: "active" | "locked" | "archived";
      },
    ) {
      const ctx = await views.assertCanRead(database, userId, roomId);
      if (ctx.room.kind === "direct") throw ChatErrors.wrongRoomKind();
      // Group admins only (admins, the course's instructor and creator):
      // name, icon, description and the rules.
      if (!ctx.canModerate) throw ChatErrors.notModerator();
      if (patch.iconUploadId) {
        const upload = await repository.findUpload(
          database,
          patch.iconUploadId,
        );
        if (
          !upload ||
          upload.room_id !== roomId ||
          upload.kind !== "image" ||
          upload.status === "pending"
        ) {
          throw ChatErrors.iconInvalid();
        }
        await repository.attachIconUpload(database, upload.id);
      }
      if (
        patch.iconUploadId !== undefined &&
        ctx.room.icon_upload_id &&
        ctx.room.icon_upload_id !== patch.iconUploadId
      ) {
        await repository.releaseIconUpload(database, ctx.room.icon_upload_id);
      }
      if (ctx.room.kind === "course" && patch.title !== undefined) {
        // A course group is named after its course.
        delete patch.title;
      }
      const updated = await repository.updateRoom(database, roomId, {
        ...(patch.title !== undefined ? { title: patch.title } : {}),
        ...(patch.description !== undefined
          ? { description: patch.description }
          : {}),
        ...(patch.postingPolicy !== undefined
          ? { posting_policy: patch.postingPolicy }
          : {}),
        ...(patch.slowModeSeconds !== undefined
          ? { slow_mode_seconds: patch.slowModeSeconds }
          : {}),
        ...(patch.directMessagesAllowed !== undefined
          ? { direct_messages_allowed: patch.directMessagesAllowed }
          : {}),
        ...(patch.attachmentsAllowed !== undefined
          ? { attachments_allowed: patch.attachmentsAllowed }
          : {}),
        ...(patch.iconUploadId !== undefined
          ? { icon_upload_id: patch.iconUploadId }
          : {}),
        ...(patch.status !== undefined ? { status: patch.status } : {}),
      });
      if (!updated) throw ChatErrors.roomNotFound();
      await repository.log(database, {
        actorId: userId,
        action: "room.settings",
        roomId,
        details: patch as Record<string, unknown>,
      });
      await publish({
        type: "room",
        roomId,
        eventSeq: Number(updated.last_event_seq),
      });
      return roomDetail(userId, roomId);
    },

    /** Your own state: mute notifications, archive, pin the chat. */
    async updateMyState(
      userId: string,
      roomId: string,
      patch: {
        notifyLevel?: "all" | "mentions" | "none";
        archived?: boolean;
        pinned?: boolean;
      },
    ) {
      await views.assertCanRead(database, userId, roomId);
      if (patch.pinned === true) {
        const member = await repository.findMember(database, roomId, userId);
        if (
          !member?.pinned_at &&
          (await repository.countPinnedChats(database, userId)) >=
            CHAT_MAX_PINNED_CHATS
        ) {
          throw ChatErrors.pinLimit(CHAT_MAX_PINNED_CHATS);
        }
      }
      await repository.updateMember(database, roomId, userId, {
        ...(patch.notifyLevel !== undefined
          ? { notify_level: patch.notifyLevel }
          : {}),
        ...(patch.archived !== undefined
          ? { archived_at: patch.archived ? new Date() : null }
          : {}),
        ...(patch.pinned !== undefined
          ? { pinned_at: patch.pinned ? new Date() : null }
          : {}),
      });
      return roomDetail(userId, roomId);
    },

    async createTeamRoom(
      userId: string,
      input: {
        title: string;
        description?: string | undefined;
        memberIds: string[];
      },
    ) {
      await assertManager(userId);
      const memberIds = [
        ...new Set(input.memberIds.filter((id) => id !== userId)),
      ];
      if (memberIds.length + 1 > CHAT_TEAM_ROOM_MAX_MEMBERS) {
        throw ChatErrors.wrongRoomKind();
      }
      const people = await repository.getPeople(database, memberIds);
      const found = people.filter((p) => !p.is_deleted).map((p) => p.id);
      const id = crypto.randomUUID();
      await repository.insertRoom(database, {
        id,
        kind: "team",
        title: input.title,
        description: input.description ?? null,
        created_by: userId,
      });
      await repository.ensureMembers(database, [
        { roomId: id, userId, roomRole: "owner" },
        ...found.map((memberId) => ({ roomId: id, userId: memberId })),
      ]);
      await repository.log(database, {
        actorId: userId,
        action: "room.create_team",
        roomId: id,
        details: { members: found.length + 1 },
      });
      await publish({ type: "added", roomId: id, userIds: [userId, ...found] });
      return roomDetail(userId, id);
    },

    async addTeamMembers(userId: string, roomId: string, userIds: string[]) {
      const ctx = await views.assertCanRead(database, userId, roomId);
      if (ctx.room.kind !== "team") throw ChatErrors.wrongRoomKind();
      if (!ctx.canModerate) throw ChatErrors.notModerator();
      const people = await repository.getPeople(database, userIds);
      const ids = people.filter((p) => !p.is_deleted).map((p) => p.id);
      const current = await repository.listMembersOf(database, roomId);
      if (
        current.filter((m) => m.state === "active").length + ids.length >
        CHAT_TEAM_ROOM_MAX_MEMBERS
      ) {
        throw ChatErrors.wrongRoomKind();
      }
      await repository.ensureMembers(
        database,
        ids.map((id) => ({ roomId, userId: id })),
      );
      // People who had left come back.
      for (const member of current) {
        if (ids.includes(member.user_id) && member.state !== "active") {
          await repository.updateMember(database, roomId, member.user_id, {
            state: "active",
          });
        }
      }
      await repository.log(database, {
        actorId: userId,
        action: "room.add_members",
        roomId,
        details: { userIds: ids },
      });
      await publish({ type: "added", roomId, userIds: ids });
      return roomDetail(userId, roomId);
    },

    async removeTeamMember(userId: string, roomId: string, memberId: string) {
      const ctx = await views.assertCanRead(database, userId, roomId);
      if (ctx.room.kind !== "team") throw ChatErrors.wrongRoomKind();
      if (memberId !== userId && !ctx.canModerate)
        throw ChatErrors.notModerator();
      await repository.updateMember(database, roomId, memberId, {
        state: "left",
      });
      if (memberId !== userId) {
        await repository.log(database, {
          actorId: userId,
          action: "room.remove_member",
          roomId,
          targetUserId: memberId,
        });
      }
      await publish({ type: "removed", roomId, userIds: [memberId] });
      return { ok: true as const };
    },

    /** "Exit group": team groups only; course groups follow enrolment. */
    /**
     * "Clear chat" (any chat) or "Delete chat" (a private chat): for you
     * only, as in WhatsApp. The other person keeps their copy.
     */
    async clear(
      userId: string,
      roomId: string,
      options: { deleteChat?: boolean | undefined },
    ) {
      const ctx = await views.assertCanRead(database, userId, roomId);
      const deleteChat = options.deleteChat === true;
      if (deleteChat && ctx.room.kind !== "direct") {
        throw ChatErrors.wrongRoomKind();
      }
      const done = await repository.clearForMember(
        database,
        roomId,
        userId,
        Number(ctx.room.last_seq),
        deleteChat,
      );
      if (!done) throw ChatErrors.noAccess();
      return { ok: true as const };
    },

    async leave(userId: string, roomId: string) {
      const ctx = await views.assertCanRead(database, userId, roomId);
      if (ctx.room.kind !== "team") throw ChatErrors.cannotLeave();
      await repository.updateMember(database, roomId, userId, {
        state: "left",
      });
      await publish({ type: "removed", roomId, userIds: [userId] });
      return { ok: true as const };
    },

    async listMembers(
      userId: string,
      roomId: string,
      query: {
        search?: string | undefined;
        cursor?: string | undefined;
        limit?: number | undefined;
      },
    ) {
      const ctx = await views.assertCanRead(database, userId, roomId);
      const limit = query.limit ?? 50;
      const after = decodeCursor(query.cursor);
      const rows = await repository.listMembersPage(database, roomId, {
        search: query.search,
        after,
        limit,
      });
      const page = rows.slice(0, limit);
      const course =
        ctx.room.kind === "course" && ctx.room.course_id
          ? await access.courseGate(database, ctx.room.course_id)
          : null;
      const members = [];
      for (const row of page) {
        let role: ChatSenderRole = "learner";
        if (await access.isManager(database, row.id)) role = "admin";
        else if (course?.creator_id === row.id) role = "instructor";
        else if (
          ctx.room.kind === "course" && ctx.room.course_id
            ? await access.canModerateCourse(
                database,
                row.id,
                ctx.room.course_id,
              )
            : await access.isPlatformModerator(database, row.id)
        ) {
          role = "staff";
        } else if (row.room_role === "moderator") role = "helper";
        members.push({
          id: row.id,
          name: row.display_name,
          avatarUrl: row.avatar_data_url,
          role,
          isAdmin:
            role === "admin" ||
            role === "instructor" ||
            role === "staff" ||
            row.room_role === "owner",
          isHelper: row.room_role === "moderator",
        });
      }
      const last = page.at(-1);
      return {
        members,
        nextCursor:
          rows.length > limit && last
            ? Buffer.from(
                JSON.stringify({ name: last.display_name, id: last.id }),
              ).toString("base64url")
            : null,
        total: query.search
          ? null
          : await repository.countActiveMembers(database, roomId),
      };
    },

    /** Make or remove a helper (a learner who may delete and mute ≤ 24 h). */
    async setHelper(
      userId: string,
      roomId: string,
      memberId: string,
      helper: boolean,
    ) {
      const ctx = await views.assertCanRead(database, userId, roomId);
      if (ctx.room.kind !== "course") throw ChatErrors.wrongRoomKind();
      if (!ctx.canModerate) throw ChatErrors.notModerator();
      if (memberId === userId) throw ChatErrors.self();
      if (
        !ctx.room.course_id ||
        !(await access.canReadCourse(database, memberId, ctx.room.course_id))
      ) {
        throw ChatErrors.userNotFound();
      }
      const member = await repository.findMember(database, roomId, memberId);
      if (helper && member?.room_role !== "moderator") {
        const settings = await repository.getSettings(database);
        if (
          (await repository.countHelpers(database, roomId)) >=
          settings.max_helpers_per_room
        ) {
          throw ChatErrors.helperLimit(settings.max_helpers_per_room);
        }
      }
      if (!member)
        await repository.ensureMembers(database, [
          { roomId, userId: memberId },
        ]);
      await repository.updateMember(database, roomId, memberId, {
        room_role: helper ? "moderator" : "member",
      });
      await repository.log(database, {
        actorId: userId,
        action: helper ? "helper.add" : "helper.remove",
        roomId,
        targetUserId: memberId,
      });
      const updated = await repository.updateRoom(database, roomId, {});
      if (updated) {
        await publish({
          type: "room",
          roomId,
          eventSeq: Number(updated.last_event_seq),
        });
      }
      return { ok: true as const };
    },

    /** The chats and their heads a new live stream starts with. */
    async streamRooms(userId: string) {
      const restrictions = await repository.listActiveRestrictions(
        database,
        userId,
      );
      const ids = await views.visibleRoomIds(database, userId, restrictions);
      const heads = await repository.getHeads(database, ids);
      return heads.map((head) => ({
        id: head.id,
        lastSeq: Number(head.last_seq),
        lastEventSeq: Number(head.last_event_seq),
      }));
    },
  };
}

function decodeCursor(cursor: string | undefined) {
  if (!cursor) return undefined;
  try {
    const value = JSON.parse(
      Buffer.from(cursor, "base64url").toString("utf8"),
    ) as {
      name?: unknown;
      id?: unknown;
    };
    if (typeof value.name === "string" && typeof value.id === "string") {
      return { name: value.name, id: value.id };
    }
  } catch {
    // An unreadable cursor starts from the top.
  }
  return undefined;
}

export type RoomsService = ReturnType<typeof createRoomsService>;
