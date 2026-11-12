import { createCache } from "@veolms/api-core";
import type { ChatSenderRole } from "@veolms/contracts";
import type { DatabaseExecutor as Executor } from "@veolms/database";

import { createAccessService, isOpenFreeCourse } from "../../access/index.ts";
import {
  canActOnCourse,
  hasAcademyPermission,
} from "../../authorization/index.ts";
import type {
  ChatRepository,
  ChatRoomRow,
  CourseGateRow,
  RestrictionRow,
} from "./chat.repository.ts";

/**
 * Who may read, post and moderate where (CHAT_ROOM_PLAN.md §4).
 *
 * Course groups follow course access, exactly as discussions do: the
 * creator, anyone holding a live grant, and everyone signed in for a
 * published open free course. Nothing is copied into chat to keep in step.
 *
 * Levels decide who may act on whom: admin 4 > instructor / staff 3 >
 * helper 2 > learner 1. Nobody acts on their own level or above.
 */

export const ROLE_LEVEL: Record<ChatSenderRole, number> = {
  admin: 4,
  instructor: 3,
  staff: 3,
  helper: 2,
  learner: 1,
};

/** Course state and per-user access change rarely; 30 s keeps sends cheap. */
const courseGateCache = createCache<CourseGateRow | null>({
  name: "chat.course-gate",
  ttlMs: 30_000,
  maxBytes: 2 * 1024 * 1024,
});
const chatStaffCache = createCache<boolean>({
  name: "chat.staff",
  ttlMs: 60_000,
  maxBytes: 1024 * 1024,
});
const courseAccessCache = createCache<boolean>({
  name: "chat.course-access",
  ttlMs: 30_000,
  maxBytes: 4 * 1024 * 1024,
});
const accessibleCoursesCache = createCache<string[] | "all">({
  name: "chat.accessible-courses",
  ttlMs: 30_000,
  maxBytes: 8 * 1024 * 1024,
});

export function createChatAccess(repository: ChatRepository) {
  const access = createAccessService();

  function isPlatformModerator(db: Executor, userId: string) {
    return hasAcademyPermission(db, userId, "chat.moderate");
  }

  /**
   * Staff for private chats: platform chat staff, or anyone who teaches a
   * course (its creator). Learners wait for them to write first.
   */
  async function isChatStaff(db: Executor, userId: string) {
    return chatStaffCache.fetch(
      userId,
      async () =>
        (await isPlatformModerator(db, userId)) ||
        (await repository.createsAnyCourse(db, userId)),
    );
  }

  function isManager(db: Executor, userId: string) {
    return hasAcademyPermission(db, userId, "chat.manage");
  }

  async function courseGate(db: Executor, courseId: string) {
    return courseGateCache.fetch(courseId, async () => {
      return (await repository.findCourseGate(db, courseId)) ?? null;
    });
  }

  async function canReadCourse(
    db: Executor,
    userId: string,
    courseId: string,
  ): Promise<boolean> {
    return courseAccessCache.fetch(`${userId}:${courseId}`, async () => {
      if (await isPlatformModerator(db, userId)) return true;
      const course = await courseGate(db, courseId);
      if (!course) return false;
      if (course.creator_id === userId) return true;
      if (course.deleted_at !== null) return false;
      if (course.status === "published" && isOpenFreeCourse(course)) {
        return true;
      }
      return access.hasActiveAccess(db, userId, courseId);
    });
  }

  /**
   * Posting needs more than reading, as in discussions: an open free course
   * is readable by anyone signed in, but only people who joined it (or its
   * staff) may post.
   */
  async function canParticipateInCourse(
    db: Executor,
    userId: string,
    courseId: string,
  ): Promise<boolean> {
    return courseAccessCache.fetch(`post:${userId}:${courseId}`, async () => {
      if (await isPlatformModerator(db, userId)) return true;
      const course = await courseGate(db, courseId);
      if (!course || course.deleted_at !== null)
        return course?.creator_id === userId;
      if (course.creator_id === userId) return true;
      return access.hasActiveAccess(db, userId, courseId);
    });
  }

  async function canModerateCourse(
    db: Executor,
    userId: string,
    courseId: string,
  ): Promise<boolean> {
    const course = await courseGate(db, courseId);
    if (!course) return false;
    return canActOnCourse(db, {
      userId,
      permission: "chat.moderate",
      course: { id: course.id, creator_id: course.creator_id },
    });
  }

  /**
   * Courses whose groups a person sees in their chat list: every course for
   * platform moderators; otherwise the courses they hold and created. (Open
   * free courses they never joined are readable but not listed.)
   */
  async function listedCourseIds(
    db: Executor,
    userId: string,
  ): Promise<string[] | "all"> {
    return accessibleCoursesCache.fetch(userId, async () => {
      if (await isPlatformModerator(db, userId)) return "all";
      const [scopes, created] = await Promise.all([
        access.listAccessScopes(db, userId),
        repository.listCreatedCourseIds(db, userId),
      ]);
      return [...new Set([...scopes.keys(), ...created])];
    });
  }

  /** The badge someone carries in a room (stored on each message). */
  async function roleIn(
    db: Executor,
    userId: string,
    room: ChatRoomRow,
    member?: { room_role: string } | null,
  ): Promise<ChatSenderRole> {
    if (await isManager(db, userId)) return "admin";
    if (room.kind === "course" && room.course_id) {
      const course = await courseGate(db, room.course_id);
      if (course?.creator_id === userId) return "instructor";
      if (await canModerateCourse(db, userId, room.course_id)) return "staff";
      if (member?.room_role === "moderator") return "helper";
      return "learner";
    }
    if (await isPlatformModerator(db, userId)) return "staff";
    if (room.kind === "team" && member?.room_role === "owner") return "staff";
    return room.kind === "team" ? "staff" : "learner";
  }

  /** Active restrictions that touch this room (its own or platform-wide). */
  function restrictionsFor(
    restrictions: readonly RestrictionRow[],
    roomId: string | null,
  ) {
    const now = Date.now();
    return restrictions.filter(
      (r) =>
        r.revoked_at === null &&
        (r.until === null || r.until.getTime() > now) &&
        (r.room_id === null || r.room_id === roomId),
    );
  }

  /**
   * Whether two people may start (or keep writing in) a private chat under
   * the platform policy. Blocks and restrictions are checked separately.
   */
  async function directAllowed(
    db: Executor,
    policy: "off" | "staff_only" | "course_peers",
    a: string,
    b: string,
  ): Promise<boolean> {
    const [aStaff, bStaff] = await Promise.all([
      isPlatformModerator(db, a),
      isPlatformModerator(db, b),
    ]);
    if (aStaff && bStaff) return true;
    if (policy === "off") return false;

    // Staff of a course the other person takes (its creator, or platform
    // staff) may always talk with them.
    if (aStaff || bStaff) return true;
    const [aCourses, bCourses] = await Promise.all([
      listedCourseIds(db, a),
      listedCourseIds(db, b),
    ]);
    const aList = aCourses === "all" ? [] : aCourses;
    const bList = bCourses === "all" ? [] : bCourses;
    const creators = await repository.listCourseCreators(db, [
      ...new Set([...aList, ...bList]),
    ]);
    const bSet = new Set(bList);
    const aSet = new Set(aList);
    for (const course of creators) {
      if (course.creator_id === a && bSet.has(course.id)) return true;
      if (course.creator_id === b && aSet.has(course.id)) return true;
    }
    if (policy === "staff_only") return false;

    // Learners: a shared course whose group allows private chats.
    const shared = aList.filter((id) => bSet.has(id));
    if (shared.length === 0) return false;
    return repository.anyCourseAllowsDirect(db, shared);
  }

  /**
   * Whose read receipts are off. Only chat staff (admins, moderators,
   * instructors) may turn them off; for everyone else a stored "off" (from
   * before the switch became staff-only) does not count.
   */
  async function receiptsOff(
    db: Executor,
    profiles: readonly { user_id: string; read_receipts: boolean }[],
  ): Promise<Set<string>> {
    const off = new Set<string>();
    for (const profile of profiles) {
      if (!profile.read_receipts && (await isChatStaff(db, profile.user_id))) {
        off.add(profile.user_id);
      }
    }
    return off;
  }

  return {
    receiptsOff,
    isPlatformModerator,
    isChatStaff,
    isManager,
    courseGate,
    canReadCourse,
    canParticipateInCourse,
    canModerateCourse,
    listedCourseIds,
    roleIn,
    restrictionsFor,
    directAllowed,
    /**
     * Whether `actorId` may restrict `targetId` across all chats: chat
     * managers always; holders of chat.restrict_platform for every course;
     * an instructor only over a learner in one of their own courses.
     */
    async canRestrictPlatform(
      db: Executor,
      actorId: string,
      targetId: string,
    ): Promise<boolean> {
      if (await isManager(db, actorId)) return true;
      if (await hasAcademyPermission(db, actorId, "chat.restrict_platform")) {
        return true;
      }
      const targetCourses = await listedCourseIds(db, targetId);
      if (targetCourses === "all") return false;
      const courses = await repository.listCourseCreators(db, targetCourses);
      for (const course of courses) {
        if (course.creator_id !== actorId) continue;
        if (
          await canActOnCourse(db, {
            userId: actorId,
            permission: "chat.restrict_platform",
            course: { id: course.id, creator_id: course.creator_id },
          })
        ) {
          return true;
        }
      }
      return false;
    },
    /** Clears one person's cached course list (after enrolment changes). */
    forgetUser(userId: string) {
      accessibleCoursesCache.delete(userId);
    },
  };
}

export type ChatAccess = ReturnType<typeof createChatAccess>;

/** "<smaller id>:<larger id>": one private chat per pair. */
export function directKey(a: string, b: string): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}
