import type { ChatSenderRole } from "@veolms/contracts";

import { encodeChatEvent } from "../realtime/chat-bus.ts";
import { directKey } from "../shared/chat.access.ts";
import { listPlatformPermissionHolders } from "../../authorization/index.ts";
import { ChatErrors } from "../shared/chat.errors.ts";
import { presentPerson } from "../shared/chat.presenters.ts";
import { createRoomViews } from "../shared/chat.room-views.ts";
import type { ChatRuntime } from "../shared/chat.runtime.ts";

const DAY_MS = 24 * 60 * 60 * 1000;
const CANDIDATES_PER_COURSE = 20;
const CANDIDATE_COURSES = 10;
/** People a New chat search checks (each against the private-chat rules). */
const SEARCH_LIMIT = 25;

/**
 * Private chats (CHAT_ROOM_PLAN.md §4.3, decision 1: "course peers").
 * Learner → learner chats start as a request the other person accepts,
 * declines or blocks; anything involving staff opens straight away.
 */
export function createDirectService(runtime: ChatRuntime) {
  const { database, repository, access } = runtime;
  const views = createRoomViews(runtime);

  async function publish(event: Parameters<typeof encodeChatEvent>[0]) {
    try {
      await repository.publish(database, encodeChatEvent(event));
    } catch {
      // Best effort.
    }
  }

  async function staffRole(userId: string): Promise<ChatSenderRole> {
    if (await access.isManager(database, userId)) return "admin";
    if (await access.isPlatformModerator(database, userId)) return "staff";
    return "learner";
  }

  return {
    /** Opens (or returns) the private chat with `peerId`. */
    async start(userId: string, peerId: string) {
      if (peerId === userId) throw ChatErrors.self();
      const [peer] = await repository.getPeople(database, [peerId]);
      if (!peer || peer.is_deleted) throw ChatErrors.userNotFound();

      const key = directKey(userId, peerId);
      const existing = await repository.findDirectRoom(database, key);
      if (existing) {
        const member = await repository.findMember(
          database,
          existing.id,
          userId,
        );
        if (member && (member.state !== "active" || member.deleted_at)) {
          await repository.updateMember(database, existing.id, userId, {
            state: "active",
            deleted_at: null,
          });
        }
        const ctx = await views.assertCanRead(database, userId, existing.id);
        return {
          room: await views.detail(database, userId, ctx),
          created: false,
        };
      }

      if (
        (await repository.blocksBetween(database, userId, peerId)).length > 0
      ) {
        throw ChatErrors.blocked();
      }
      // Learners don't open chats with their instructors or admins: staff
      // write first (the chat then exists and the learner can reply).
      if (
        !(await access.isChatStaff(database, userId)) &&
        (await access.isChatStaff(database, peerId))
      ) {
        throw ChatErrors.staffFirst();
      }
      const restrictions = await repository.listActiveRestrictions(
        database,
        userId,
      );
      const userStaff = (await staffRole(userId)) !== "learner";
      const peerStaff = (await staffRole(peerId)) !== "learner";
      if (
        !userStaff &&
        restrictions.some(
          (r) =>
            (r.type === "no_direct" || r.type === "ban") && r.room_id === null,
        )
      ) {
        throw ChatErrors.directNotAllowed();
      }
      const settings = await repository.getSettings(database);
      if (
        !(await access.directAllowed(
          database,
          settings.direct_policy,
          userId,
          peerId,
        ))
      ) {
        throw ChatErrors.directNotAllowed();
      }

      // Learner ↔ learner: a request, limited per day.
      const isRequest = !userStaff && !peerStaff;
      if (isRequest) {
        const sent = await repository.countDirectRequestsSince(
          database,
          userId,
          new Date(Date.now() - DAY_MS),
        );
        if (sent >= settings.max_direct_requests_per_day)
          throw ChatErrors.directLimit();
      }

      const { room, created } = await repository.insertRoom(database, {
        id: crypto.randomUUID(),
        kind: "direct",
        direct_key: key,
        direct_status: isRequest ? "requested" : "accepted",
        requested_by: isRequest ? userId : null,
        created_by: userId,
      });
      const roomRow = room ?? (await repository.findDirectRoom(database, key));
      if (!roomRow) throw ChatErrors.roomNotFound();
      await repository.ensureMembers(database, [
        { roomId: roomRow.id, userId },
        {
          roomId: roomRow.id,
          userId: peerId,
          state: isRequest ? "pending" : "active",
        },
      ]);
      if (created) {
        await publish({
          type: "added",
          roomId: roomRow.id,
          userIds: [userId, peerId],
        });
      }
      const ctx = await views.assertCanRead(database, userId, roomRow.id);
      return { room: await views.detail(database, userId, ctx), created };
    },

    async accept(userId: string, roomId: string) {
      const ctx = await views.assertCanRead(database, userId, roomId);
      const { room } = ctx;
      if (room.kind !== "direct") throw ChatErrors.wrongRoomKind();
      if (room.direct_status === "requested" && room.requested_by !== userId) {
        const updated = await repository.updateRoom(database, roomId, {
          direct_status: "accepted",
        });
        await repository.updateMember(database, roomId, userId, {
          state: "active",
        });
        if (updated) {
          await publish({
            type: "room",
            roomId,
            eventSeq: Number(updated.last_event_seq),
          });
        }
      }
      const fresh = await views.assertCanRead(database, userId, roomId);
      return { room: await views.detail(database, userId, fresh) };
    },

    /** Declining keeps the chat (read-only for the sender) without telling them. */
    async decline(userId: string, roomId: string) {
      const ctx = await views.assertCanRead(database, userId, roomId);
      const { room } = ctx;
      if (room.kind !== "direct") throw ChatErrors.wrongRoomKind();
      if (room.direct_status === "requested" && room.requested_by !== userId) {
        const updated = await repository.updateRoom(database, roomId, {
          direct_status: "declined",
        });
        await repository.updateMember(database, roomId, userId, {
          state: "left",
        });
        if (updated) {
          await publish({
            type: "room",
            roomId,
            eventSeq: Number(updated.last_event_seq),
          });
        }
        await publish({ type: "removed", roomId, userIds: [userId] });
      }
      return { ok: true as const };
    },

    /** "New chat": staff of your courses, and classmates where allowed. */
    async candidates(userId: string, search: string | undefined) {
      const settings = await repository.getSettings(database);
      const courseIds = await access.listedCourseIds(database, userId);
      // Platform staff: the courses whose groups are on.
      const list =
        courseIds === "all"
          ? (await repository.listCourseRoomIds(database, "all", false))
              .map((room) => room.course_id)
              .filter((id): id is string => Boolean(id))
          : courseIds;
      const courses = await repository.listCourseCreators(database, list);

      const staffIds = [
        ...new Set(
          courses
            .map((c) => c.creator_id)
            .filter((id): id is string => Boolean(id) && id !== userId),
        ),
      ];
      const staffPeople = (
        await repository.getPeople(database, staffIds)
      ).filter(
        (p) =>
          !p.is_deleted &&
          (!search ||
            p.display_name.toLowerCase().includes(search.toLowerCase())),
      );

      const userStaff = (await staffRole(userId)) !== "learner";
      const classmateCourses = courses.slice(0, CANDIDATE_COURSES);
      const directAllowedByCourse = new Map<string, boolean>();
      for (const course of classmateCourses) {
        const room = await repository.findCourseRoom(database, course.id);
        directAllowedByCourse.set(
          course.id,
          settings.direct_policy === "course_peers" &&
            Boolean(room?.direct_messages_allowed) &&
            room?.status === "active",
        );
      }
      const classmates =
        settings.direct_policy === "off" && !userStaff
          ? []
          : await repository.listCourseClassmates(
              database,
              userId,
              classmateCourses
                .filter((c) => userStaff || directAllowedByCourse.get(c.id))
                .map((c) => c.id),
              search,
              CANDIDATES_PER_COURSE,
            );

      // A search looks through everyone, then keeps whom you may message:
      // platform staff reach anyone; others, the private-chat rules.
      const term = search?.trim() ?? "";
      let results: Array<
        ReturnType<typeof presentPerson> & { role: ChatSenderRole }
      > = [];
      if (term.length >= 2) {
        // Learners search among whom they may message; staff, everyone.
        const among = userStaff
          ? undefined
          : {
              userIds: [
                ...new Set([
                  ...staffIds,
                  ...(await listPlatformPermissionHolders(
                    database,
                    "chat.moderate",
                    200,
                  )),
                ]),
              ],
              courseIds:
                settings.direct_policy === "course_peers"
                  ? classmateCourses
                      .filter((c) => directAllowedByCourse.get(c.id))
                      .map((c) => c.id)
                  : [],
            };
        const found = await repository.searchPeople(
          database,
          term,
          userId,
          userStaff,
          SEARCH_LIMIT,
          among,
        );
        const allowed: typeof found = [];
        for (const person of found) {
          if (
            await access.directAllowed(
              database,
              settings.direct_policy,
              userId,
              person.id,
            )
          ) {
            allowed.push(person);
          }
        }
        // Learners can't open a chat with staff (staff write first).
        const reachable = userStaff
          ? allowed
          : (
              await Promise.all(
                allowed.map(async (person) =>
                  (await access.isChatStaff(database, person.id))
                    ? null
                    : person,
                ),
              )
            ).filter(
              (person): person is (typeof allowed)[number] => person !== null,
            );
        results = await Promise.all(
          reachable.map(async (person) => ({
            ...presentPerson(person),
            role: await staffRole(person.id),
          })),
        );
      }

      return {
        results,
        // Staff appear for learners only once they have written (the chat
        // is then in the list); New chat offers them to staff only.
        staff: (userStaff ? staffPeople : []).map((p) => ({
          ...presentPerson(p),
          role: "instructor" as const,
        })),
        courses: classmateCourses.map((course) => ({
          courseId: course.id,
          title: course.title,
          directAllowed:
            userStaff || Boolean(directAllowedByCourse.get(course.id)),
          people: classmates
            .filter((c) => c.course_id === course.id)
            .map((c) => ({
              id: c.id,
              name: c.display_name,
              avatarUrl: c.avatar_data_url,
              role: "learner" as const,
            })),
        })),
      };
    },

    async listBlocked(userId: string) {
      const rows = await repository.listBlocked(database, userId);
      return {
        blocked: rows.map((row) => ({
          id: row.id,
          name: row.display_name,
          avatarUrl: row.avatar_data_url,
          blockedAt: row.created_at.toISOString(),
        })),
      };
    },

    async block(userId: string, targetId: string) {
      if (targetId === userId) throw ChatErrors.self();
      const [target] = await repository.getPeople(database, [targetId]);
      if (!target) throw ChatErrors.userNotFound();
      await repository.block(database, userId, targetId);
      // An open request from them is declined at the same time.
      const room = await repository.findDirectRoom(
        database,
        directKey(userId, targetId),
      );
      if (
        room?.direct_status === "requested" &&
        room.requested_by === targetId
      ) {
        await repository.updateRoom(database, room.id, {
          direct_status: "declined",
        });
      }
      if (room) {
        const updated = await repository.updateRoom(database, room.id, {});
        if (updated) {
          await publish({
            type: "room",
            roomId: room.id,
            eventSeq: Number(updated.last_event_seq),
          });
        }
      }
      return { ok: true as const };
    },

    async unblock(userId: string, targetId: string) {
      await repository.unblock(database, userId, targetId);
      const room = await repository.findDirectRoom(
        database,
        directKey(userId, targetId),
      );
      if (room) {
        const updated = await repository.updateRoom(database, room.id, {});
        if (updated) {
          await publish({
            type: "room",
            roomId: room.id,
            eventSeq: Number(updated.last_event_seq),
          });
        }
      }
      return { ok: true as const };
    },
  };
}

export type DirectService = ReturnType<typeof createDirectService>;
