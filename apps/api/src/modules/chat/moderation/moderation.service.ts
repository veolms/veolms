import {
  CHAT_HELPER_MAX_MUTE_MINUTES,
  type ChatReason,
  type ChatRestrictionType,
} from "@veolms/contracts";
import type { ChatDirectPolicy } from "@veolms/database";

import { createOutboxService } from "../../../events/outbox.service.ts";
import { listPlatformPermissionHolders } from "../../authorization/index.ts";
import { encodeChatEvent } from "../realtime/chat-bus.ts";
import { ROLE_LEVEL } from "../shared/chat.access.ts";
import { ChatErrors } from "../shared/chat.errors.ts";
import { presentMessage } from "../shared/chat.presenters.ts";
import type { RestrictionRow } from "../shared/chat.repository.ts";
import { createRoomViews } from "../shared/chat.room-views.ts";
import type { ChatRuntime } from "../shared/chat.runtime.ts";

const REPORT_CONTEXT = 5;
const REVIEW_CONTEXT = 10;

/**
 * Restrictions (mute, remove/ban, no private chats), reports, the
 * moderation log and platform chat settings (CHAT_ROOM_PLAN.md §4.2, §7).
 */
export function createModerationService(runtime: ChatRuntime) {
  const { database, repository, access } = runtime;
  const views = createRoomViews(runtime);
  const outbox = createOutboxService();

  async function publish(event: Parameters<typeof encodeChatEvent>[0]) {
    try {
      await repository.publish(database, encodeChatEvent(event));
    } catch {
      // Best effort.
    }
  }

  /** Staff anywhere: chat managers, platform moderators, course creators. */
  async function isStaffUser(userId: string): Promise<boolean> {
    if (await access.isManager(database, userId)) return true;
    if (await access.isPlatformModerator(database, userId)) return true;
    return (await repository.listCreatedCourseIds(database, userId)).length > 0;
  }

  /** Rooms whose reports and log the person may see. */
  async function moderatedRoomIds(userId: string): Promise<string[] | "all"> {
    if (await access.isManager(database, userId)) return "all";
    if (await access.isPlatformModerator(database, userId)) {
      return repository.listRoomIdsWithKinds(database, ["course", "team"]);
    }
    const created = await repository.listCreatedCourseIds(database, userId);
    const own = await repository.listRoomIdsWithKinds(
      database,
      ["course"],
      created,
    );
    const helper = await repository.listHelperRoomIds(database, userId);
    return [...new Set([...own, ...helper])];
  }

  function presentRestriction(
    row: RestrictionRow & {
      user_name: string;
      user_avatar: string | null;
      created_by_name: string | null;
      created_by_avatar: string | null;
      room_title: string | null;
      course_title: string | null;
    },
  ) {
    return {
      id: row.id,
      user: {
        id: row.user_id,
        name: row.user_name,
        avatarUrl: row.user_avatar,
      },
      roomId: row.room_id,
      roomTitle: row.course_title ?? row.room_title,
      type: row.type,
      until: row.until?.toISOString() ?? null,
      reason: row.reason,
      note: row.note,
      createdBy: row.created_by
        ? {
            id: row.created_by,
            name: row.created_by_name ?? "Deleted user",
            avatarUrl: row.created_by_avatar,
          }
        : null,
      createdAt: row.created_at.toISOString(),
      revokedAt: row.revoked_at?.toISOString() ?? null,
    };
  }

  async function findPresentedRestriction(id: string) {
    const rows = await repository.listRestrictionById(database, id);
    const row = rows[0];
    if (!row) throw ChatErrors.restrictionNotFound();
    return presentRestriction(row as Parameters<typeof presentRestriction>[0]);
  }

  /** Tells the target's open tabs to reload the chats this touches. */
  async function refreshTarget(
    targetId: string,
    roomId: string | null,
    type: ChatRestrictionType,
  ) {
    const roomIds = roomId
      ? [roomId]
      : await views.visibleRoomIds(database, targetId, []);
    for (const id of roomIds) {
      await publish({
        type: type === "ban" ? "removed" : "added",
        roomId: id,
        userIds: [targetId],
      });
    }
  }

  return {
    async createRestriction(
      actorId: string,
      input: {
        userId: string;
        roomId?: string | null | undefined;
        type: ChatRestrictionType;
        durationMinutes?: number | null | undefined;
        reason: ChatReason;
        note?: string | undefined;
      },
    ) {
      if (input.userId === actorId) throw ChatErrors.self();
      const [target] = await repository.getPeople(database, [input.userId]);
      if (!target) throw ChatErrors.userNotFound();
      const roomId = input.roomId ?? null;
      const duration = input.durationMinutes ?? null;

      if (roomId) {
        if (input.type === "no_direct") throw ChatErrors.wrongRoomKind();
        const ctx = await views.assertCanRead(database, actorId, roomId);
        if (ctx.room.kind === "direct") throw ChatErrors.wrongRoomKind();
        const helperOnly = ctx.isHelper && !ctx.canModerate;
        if (!ctx.canModerate && !helperOnly) throw ChatErrors.notModerator();
        if (helperOnly) {
          // Helpers: mute learners for at most 24 hours.
          if (
            input.type !== "mute" ||
            duration === null ||
            duration > CHAT_HELPER_MAX_MUTE_MINUTES
          ) {
            throw ChatErrors.notModerator();
          }
        }
        const targetRole = await access.roleIn(
          database,
          input.userId,
          ctx.room,
          await repository.findMember(database, roomId, input.userId),
        );
        if (ROLE_LEVEL[targetRole] >= ROLE_LEVEL[ctx.role]) {
          throw ChatErrors.targetOutranks();
        }
      } else {
        if (
          !(await access.canRestrictPlatform(database, actorId, input.userId))
        ) {
          throw ChatErrors.notModerator();
        }
        const actorIsManager = await access.isManager(database, actorId);
        if ((await isStaffUser(input.userId)) && !actorIsManager) {
          throw ChatErrors.targetOutranks();
        }
        if (await access.isManager(database, input.userId)) {
          throw ChatErrors.targetOutranks();
        }
      }

      const id = crypto.randomUUID();
      await repository.insertRestriction(database, {
        id,
        user_id: input.userId,
        room_id: roomId,
        type: input.type,
        until:
          duration === null ? null : new Date(Date.now() + duration * 60_000),
        reason: input.reason,
        note: input.note ?? null,
        created_by: actorId,
      });
      await repository.log(database, {
        actorId,
        action: `restriction.${input.type}`,
        roomId,
        targetUserId: input.userId,
        details: {
          restrictionId: id,
          durationMinutes: duration,
          reason: input.reason,
        },
      });
      await refreshTarget(input.userId, roomId, input.type);

      // Across all chats by someone other than a chat manager: the managers
      // are told (decision 5).
      if (!roomId && !(await access.isManager(database, actorId))) {
        const managers = (
          await listPlatformPermissionHolders(database, "chat.manage", 50)
        ).filter((managerId) => managerId !== actorId);
        const [actor] = await repository.getPeople(database, [actorId]);
        if (managers.length > 0) {
          await database.transaction().execute(async (trx) => {
            for (const recipientUserId of managers) {
              await outbox.publish(trx, {
                type: "chat.platform_restriction",
                version: 1,
                dedupeKey: `chat.platform_restriction:${id}:${recipientUserId}`,
                occurredAt: new Date(),
                payload: {
                  recipientUserId,
                  actorName: (actor?.display_name ?? "A staff member").slice(
                    0,
                    255,
                  ),
                  targetName: target.display_name.slice(0, 255),
                  restriction: input.type,
                  reason: input.reason,
                  deepLink: "/admin/chat/restrictions",
                },
              });
            }
          });
        }
      }
      return { restriction: await findPresentedRestriction(id) };
    },

    async revokeRestriction(actorId: string, restrictionId: string) {
      const restriction = await repository.findRestriction(
        database,
        restrictionId,
      );
      if (!restriction) throw ChatErrors.restrictionNotFound();
      const manager = await access.isManager(database, actorId);
      let allowed = manager || restriction.created_by === actorId;
      if (!allowed && restriction.room_id) {
        const ctx = await views.assertCanRead(
          database,
          actorId,
          restriction.room_id,
        );
        if (ctx.canModerate) {
          const targetRole = await access.roleIn(
            database,
            restriction.user_id,
            ctx.room,
            await repository.findMember(
              database,
              restriction.room_id,
              restriction.user_id,
            ),
          );
          allowed = ROLE_LEVEL[targetRole] < ROLE_LEVEL[ctx.role];
        }
      }
      if (!allowed) throw ChatErrors.notModerator();
      const revoked = await repository.revokeRestriction(
        database,
        restrictionId,
        actorId,
      );
      if (revoked) {
        await repository.log(database, {
          actorId,
          action: `restriction.lift_${restriction.type}`,
          roomId: restriction.room_id,
          targetUserId: restriction.user_id,
          details: { restrictionId },
        });
        // Lifting a ban gives the chats back; lifting a mute refreshes them.
        await refreshTarget(restriction.user_id, restriction.room_id, "mute");
      }
      return { restriction: await findPresentedRestriction(restrictionId) };
    },

    async listRestrictions(
      actorId: string,
      filter: {
        roomId?: string | undefined;
        platform?: boolean | undefined;
        active?: boolean | undefined;
      },
    ) {
      if (filter.roomId) {
        const ctx = await views.assertCanRead(database, actorId, filter.roomId);
        if (!ctx.canModerate && !ctx.isHelper) throw ChatErrors.notModerator();
      } else if (!(await access.isManager(database, actorId))) {
        throw ChatErrors.notManager();
      }
      const rows = await repository.listRestrictions(database, {
        roomId: filter.roomId,
        platform: filter.platform,
        activeOnly: filter.active ?? true,
        limit: 200,
      });
      return {
        restrictions: rows.map((row) =>
          presentRestriction(row as Parameters<typeof presentRestriction>[0]),
        ),
      };
    },

    /** Report a message. Optionally blocks its sender for the reporter. */
    async report(
      userId: string,
      roomId: string,
      seq: number,
      input: {
        reason: ChatReason;
        details?: string | undefined;
        block?: boolean | undefined;
      },
    ) {
      await views.assertCanRead(database, userId, roomId);
      const message = await repository.findMessage(database, roomId, seq);
      if (!message) throw ChatErrors.messageNotFound();
      if (message.sender_id === userId) throw ChatErrors.self();
      const before = await repository.listMessages(database, userId, roomId, {
        mode: "before",
        seq,
        limit: REPORT_CONTEXT,
      });
      await repository.insertReport(database, {
        id: crypto.randomUUID(),
        room_id: roomId,
        seq,
        reported_user_id: message.sender_id,
        reporter_id: userId,
        reason: input.reason,
        details: input.details ?? null,
        snapshot: {
          senderName: message.sender_name,
          body: message.body,
          sentAt: message.created_at.toISOString(),
          context: before.rows
            .filter((row) => row.deleted_at === null)
            .map((row) => ({
              seq: String(row.seq),
              senderName: row.sender_name,
              body: row.body,
            })),
        },
      });
      if (input.block && message.sender_id) {
        await repository.block(database, userId, message.sender_id);
      }
      return { ok: true as const };
    },

    async listReports(
      actorId: string,
      query: {
        status?: "open" | "actioned" | "dismissed" | undefined;
        roomId?: string | undefined;
        cursor?: string | undefined;
        limit?: number | undefined;
      },
    ) {
      const allowed = await moderatedRoomIds(actorId);
      let roomIds: string[] | "all" = allowed;
      if (query.roomId) {
        if (allowed !== "all" && !allowed.includes(query.roomId)) {
          throw ChatErrors.notModerator();
        }
        roomIds = [query.roomId];
      }
      if (roomIds !== "all" && roomIds.length === 0 && allowed !== "all") {
        return { reports: [], nextCursor: null };
      }
      const limit = query.limit ?? 50;
      const rows = await repository.listReports(database, {
        status: query.status,
        roomIds,
        before: decodeTimeCursor(query.cursor),
        limit,
      });
      const page = rows.slice(0, limit);
      const last = page.at(-1);
      return {
        reports: page.map((row) => ({
          id: row.id,
          roomId: row.room_id,
          roomKind: row.room_kind,
          roomTitle:
            row.course_title ??
            row.room_title ??
            (row.room_kind === "direct" ? "Private chat" : "Chat"),
          seq: Number(row.seq),
          reason: row.reason,
          details: row.details,
          reportedUser: row.reported_user_id
            ? {
                id: row.reported_user_id,
                name: row.reported_name ?? "Deleted user",
                avatarUrl: row.reported_avatar,
              }
            : null,
          reporter: row.reporter_id
            ? {
                id: row.reporter_id,
                name: row.reporter_name ?? "Deleted user",
                avatarUrl: row.reporter_avatar,
              }
            : null,
          reportCount: Number(row.report_count),
          snapshot: {
            ...row.snapshot,
            context: (row.snapshot.context ?? []).map((entry) => ({
              ...entry,
              seq: String(entry.seq),
            })),
          },
          status: row.status,
          createdAt: row.created_at.toISOString(),
          handledAt: row.handled_at?.toISOString() ?? null,
        })),
        nextCursor:
          rows.length > limit && last
            ? encodeTimeCursor(last.created_at, last.id)
            : null,
      };
    },

    async handleReport(
      actorId: string,
      reportId: string,
      status: "actioned" | "dismissed",
    ) {
      const report = await repository.findReport(database, reportId);
      if (!report) throw ChatErrors.reportNotFound();
      const allowed = await moderatedRoomIds(actorId);
      if (allowed !== "all" && !allowed.includes(report.room_id)) {
        throw ChatErrors.notModerator();
      }
      await repository.setReportStatus(
        database,
        { roomId: report.room_id, seq: Number(report.seq) },
        status,
        actorId,
      );
      await repository.log(database, {
        actorId,
        action: `report.${status}`,
        roomId: report.room_id,
        targetUserId: report.reported_user_id,
        seq: Number(report.seq),
        details: { reportId },
      });
      return { ok: true as const };
    },

    /**
     * The messages around a reported one, for chat managers reviewing a
     * private chat (decision 2: only reported messages, and every view is
     * logged).
     */
    async reportContext(actorId: string, reportId: string) {
      if (!(await access.isManager(database, actorId)))
        throw ChatErrors.notManager();
      const report = await repository.findReport(database, reportId);
      if (!report) throw ChatErrors.reportNotFound();
      const seq = Number(report.seq);
      const [before, after] = await Promise.all([
        repository.listMessages(database, actorId, report.room_id, {
          mode: "before",
          seq: seq + 1,
          limit: REVIEW_CONTEXT + 1,
        }),
        repository.listMessages(database, actorId, report.room_id, {
          mode: "after",
          seq,
          limit: REVIEW_CONTEXT,
        }),
      ]);
      await repository.log(database, {
        actorId,
        action: "report.view_context",
        roomId: report.room_id,
        targetUserId: report.reported_user_id,
        seq,
        details: { reportId },
      });
      const room = await repository.findRoom(database, report.room_id);
      return {
        messages: [...before.rows, ...after.rows].map(presentMessage),
        hasMoreBefore: before.hasMore,
        hasMoreAfter: after.hasMore,
        lastSeq: Number(room?.last_seq ?? 0),
        lastEventSeq: Number(room?.last_event_seq ?? 0),
        oldestSeq: null,
      };
    },

    async listLog(
      actorId: string,
      query: {
        roomId?: string | undefined;
        cursor?: string | undefined;
        limit?: number | undefined;
      },
    ) {
      const allowed = await moderatedRoomIds(actorId);
      if (allowed !== "all") {
        if (!query.roomId || !allowed.includes(query.roomId)) {
          throw ChatErrors.notModerator();
        }
      }
      const limit = query.limit ?? 50;
      const rows = await repository.listLog(database, {
        roomId: query.roomId,
        before: decodeTimeCursor(query.cursor),
        limit,
      });
      const page = rows.slice(0, limit);
      const last = page.at(-1);
      return {
        entries: page.map((row) => ({
          id: row.id,
          action: row.action,
          actor: row.actor_id
            ? {
                id: row.actor_id,
                name: row.actor_name ?? "Deleted user",
                avatarUrl: row.actor_avatar,
              }
            : null,
          roomId: row.room_id,
          targetUser: row.target_user_id
            ? {
                id: row.target_user_id,
                name: row.target_name ?? "Deleted user",
                avatarUrl: row.target_avatar,
              }
            : null,
          seq: row.seq === null ? null : Number(row.seq),
          details: row.details,
          createdAt: row.created_at.toISOString(),
        })),
        nextCursor:
          rows.length > limit && last
            ? encodeTimeCursor(last.created_at, last.id)
            : null,
      };
    },

    async getSettings(actorId: string) {
      if (!(await access.isManager(database, actorId)))
        throw ChatErrors.notManager();
      return {
        settings: presentSettings(await repository.getSettings(database)),
      };
    },

    async updateSettings(
      actorId: string,
      patch: {
        directPolicy?: ChatDirectPolicy | undefined;
        courseRetentionMonths?: number | undefined;
        maxDirectRequestsPerDay?: number | undefined;
        maxHelpersPerRoom?: number | undefined;
      },
    ) {
      if (!(await access.isManager(database, actorId)))
        throw ChatErrors.notManager();
      const row = await repository.updateSettings(
        database,
        {
          ...(patch.directPolicy !== undefined
            ? { direct_policy: patch.directPolicy }
            : {}),
          ...(patch.courseRetentionMonths !== undefined
            ? { course_retention_months: patch.courseRetentionMonths }
            : {}),
          ...(patch.maxDirectRequestsPerDay !== undefined
            ? { max_direct_requests_per_day: patch.maxDirectRequestsPerDay }
            : {}),
          ...(patch.maxHelpersPerRoom !== undefined
            ? { max_helpers_per_room: patch.maxHelpersPerRoom }
            : {}),
        },
        actorId,
      );
      await repository.log(database, {
        actorId,
        action: "settings.update",
        details: patch as Record<string, unknown>,
      });
      return { settings: presentSettings(row) };
    },
  };
}

function presentSettings(row: {
  direct_policy: ChatDirectPolicy;
  course_retention_months: number;
  max_direct_requests_per_day: number;
  max_helpers_per_room: number;
}) {
  return {
    directPolicy: row.direct_policy,
    courseRetentionMonths: row.course_retention_months,
    maxDirectRequestsPerDay: row.max_direct_requests_per_day,
    maxHelpersPerRoom: row.max_helpers_per_room,
  };
}

function encodeTimeCursor(createdAt: Date, id: string) {
  return Buffer.from(
    JSON.stringify({ t: createdAt.toISOString(), id }),
  ).toString("base64url");
}

function decodeTimeCursor(cursor: string | undefined) {
  if (!cursor) return undefined;
  try {
    const value = JSON.parse(
      Buffer.from(cursor, "base64url").toString("utf8"),
    ) as {
      t?: unknown;
      id?: unknown;
    };
    if (typeof value.t === "string" && typeof value.id === "string") {
      const createdAt = new Date(value.t);
      if (!Number.isNaN(createdAt.getTime()))
        return { createdAt, id: value.id };
    }
  } catch {
    // Start from the newest.
  }
  return undefined;
}

export type ModerationService = ReturnType<typeof createModerationService>;
