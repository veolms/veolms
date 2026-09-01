import type { DatabaseExecutor } from "@veolms/database";
import { createAccessService } from "../../../access/index.ts";
import { ADMIN_ROLE } from "../../../auth/index.ts";
import { httpError } from "../../../../lib/errors.ts";
import { DiscussionErrors } from "./discussion.errors.ts";

export interface DiscussionActor {
  userId: string;
  roles: readonly string[];
}

export interface ThreadAccessTarget {
  userId: string;
  courseId: string;
  visibility: string;
  status?: string;
  isLocked?: boolean;
}

export interface DiscussionAccess {
  canAccessCourse(
    db: DatabaseExecutor,
    actor: DiscussionActor,
    courseId: string,
  ): Promise<boolean>;
  assertCanAccessCourse(
    db: DatabaseExecutor,
    actor: DiscussionActor,
    courseId: string,
  ): Promise<void>;
  assertCanAccessThreadCourse(
    db: DatabaseExecutor,
    actor: DiscussionActor,
    courseId: string,
  ): Promise<void>;
  assertCanAccessThread(
    db: DatabaseExecutor,
    actor: DiscussionActor,
    thread: ThreadAccessTarget,
  ): Promise<void>;
  assertThreadIsActive(thread: ThreadAccessTarget): void;
  assertReplyIsActive(reply: { status?: string }): void;
  assertThreadNotLocked(thread: ThreadAccessTarget): void;
  assertNotSuspended(
    db: DatabaseExecutor,
    userId: string,
    courseId: string,
    kind: string,
  ): Promise<void>;
  listAccessibleCourseIds(
    db: DatabaseExecutor,
    actor: DiscussionActor,
  ): Promise<readonly string[] | "all">;
  listCourseParticipantIds(
    db: DatabaseExecutor,
    courseId: string,
  ): Promise<string[]>;
  canModerateCourse(
    db: DatabaseExecutor,
    actor: DiscussionActor,
    courseId: string,
  ): Promise<boolean>;
  assertCanModerateCourse(
    db: DatabaseExecutor,
    actor: DiscussionActor,
    courseId: string,
  ): Promise<void>;
  assertCanModeratePlatform(actor: DiscussionActor): void;
}

export function createDiscussionAccess(): DiscussionAccess {
  const access = createAccessService();

  function isAdmin(actor: DiscussionActor): boolean {
    return actor.roles.includes(ADMIN_ROLE);
  }

  async function isCourseCreator(
    db: DatabaseExecutor,
    userId: string,
    courseId: string,
  ): Promise<boolean> {
    const course = await db
      .selectFrom("courses")
      .select("creator_id")
      .where("id", "=", courseId)
      .executeTakeFirst();
    return course?.creator_id === userId;
  }

  async function canAccessCourse(
    db: DatabaseExecutor,
    actor: DiscussionActor,
    courseId: string,
  ): Promise<boolean> {
    if (isAdmin(actor)) return true;
    if (await isCourseCreator(db, actor.userId, courseId)) return true;
    return access.hasActiveAccess(db, actor.userId, courseId);
  }

  async function canModerateCourse(
    db: DatabaseExecutor,
    actor: DiscussionActor,
    courseId: string,
  ): Promise<boolean> {
    if (isAdmin(actor)) return true;
    return isCourseCreator(db, actor.userId, courseId);
  }

  function scopesForKind(kind: string): Array<"commenting" | "qa" | "all"> {
    const normalized = kind === "qna" ? "question" : kind;
    if (normalized === "question") return ["qa", "all"];
    return ["commenting", "all"];
  }

  return {
    canAccessCourse,

    async assertCanAccessCourse(db, actor, courseId) {
      const allowed = await canAccessCourse(db, actor, courseId);
      if (!allowed) {
        throw DiscussionErrors.courseAccessDenied();
      }
    },

    async assertCanAccessThreadCourse(db, actor, courseId) {
      const allowed = await canAccessCourse(db, actor, courseId);
      if (!allowed) {
        throw DiscussionErrors.notFound("Discussion thread");
      }
    },

    async assertCanAccessThread(db, actor, thread) {
      const allowed = await canAccessCourse(db, actor, thread.courseId);
      if (!allowed) {
        throw DiscussionErrors.notFound("Discussion thread");
      }

      const isOwner = thread.userId === actor.userId;
      if (thread.visibility === "private" && !isOwner) {
        throw DiscussionErrors.notFound("Discussion thread");
      }

      if (thread.status === "hidden" || thread.status === "deleted") {
        const staff = await canModerateCourse(db, actor, thread.courseId);
        if (!staff) {
          throw DiscussionErrors.notFound("Discussion thread");
        }
      }
    },

    assertThreadIsActive(thread) {
      if (thread.status && thread.status !== "active") {
        throw DiscussionErrors.notFound("Discussion thread");
      }
    },

    assertReplyIsActive(reply) {
      if (reply.status && reply.status !== "active") {
        throw DiscussionErrors.notFound("Reply");
      }
    },

    assertThreadNotLocked(thread) {
      if (thread.isLocked) {
        throw DiscussionErrors.threadLocked();
      }
    },

    async assertNotSuspended(db, userId, courseId, kind) {
      const activeSuspension = await db
        .selectFrom("learning_suspensions")
        .selectAll()
        .where("user_id", "=", userId)
        .where("is_active", "=", true)
        .where("scope", "in", scopesForKind(kind))
        .where((eb) =>
          eb.or([eb("course_id", "is", null), eb("course_id", "=", courseId)]),
        )
        .where((eb) =>
          eb.or([
            eb("expires_at", "is", null),
            eb("expires_at", ">", new Date()),
          ]),
        )
        .executeTakeFirst();

      if (activeSuspension) {
        throw DiscussionErrors.suspended(
          activeSuspension.reason,
          activeSuspension.scope,
        );
      }
    },

    async listAccessibleCourseIds(db, actor) {
      if (isAdmin(actor)) return "all";

      const grants = await access.listUserGrants(db, actor.userId);
      const now = new Date();
      const ids = new Set<string>();
      for (const grant of grants) {
        if (grant.status !== "active") continue;
        if (grant.validUntil && now > new Date(grant.validUntil)) continue;
        ids.add(grant.courseId);
      }

      const created = await db
        .selectFrom("courses")
        .select("id")
        .where("creator_id", "=", actor.userId)
        .execute();
      for (const course of created) ids.add(course.id);

      return [...ids];
    },

    async listCourseParticipantIds(db, courseId) {
      const memberIds = await access.listActiveUserIdsForCourse(db, courseId);
      const ids = new Set(memberIds);
      const course = await db
        .selectFrom("courses")
        .select("creator_id")
        .where("id", "=", courseId)
        .executeTakeFirst();
      if (course?.creator_id) ids.add(course.creator_id);
      return [...ids];
    },

    async canModerateCourse(db, actor, courseId) {
      return canModerateCourse(db, actor, courseId);
    },

    async assertCanModerateCourse(db, actor, courseId) {
      const course = await db
        .selectFrom("courses")
        .select("id")
        .where("id", "=", courseId)
        .executeTakeFirst();
      if (!course) {
        throw httpError(404, "COURSE_NOT_FOUND", "Course not found");
      }
      const allowed = await canModerateCourse(db, actor, courseId);
      if (!allowed) {
        throw httpError(
          403,
          "FORBIDDEN",
          "You do not have permission to moderate this course.",
        );
      }
    },

    assertCanModeratePlatform(actor) {
      if (!isAdmin(actor)) {
        throw httpError(
          403,
          "FORBIDDEN",
          "Administrator access is required for platform moderation.",
        );
      }
    },
  };
}

export function discussionActor(user: {
  id: string;
  roles: readonly string[];
}): DiscussionActor {
  return { userId: user.id, roles: user.roles };
}
