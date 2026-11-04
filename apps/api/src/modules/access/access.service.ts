import crypto from "node:crypto";
import type {
  AccessGrant,
  AccessGrantSource,
  AccessGrantStatus,
} from "@veolms/contracts";
import type { Database } from "@veolms/database";
import type { Kysely } from "kysely";
import { AppError } from "../../lib/errors.ts";
import * as accessRepo from "./access.repository.ts";
import {
  grantSectionIds,
  learnerCourseGate,
  type CourseAccessScope,
} from "./course-openness.ts";
import { syncLinkedCourseAccess } from "./linked-course-access.ts";
// access.repository.ts is the module's canonical source for this type — see
// the comment there for the full history of it having been separately (and,
// in auth's case, incorrectly) redefined in 4 places.
import type { Executor } from "./access.repository.ts";

export type { Executor };

export interface AccessService {
  grantAccess(
    database: Executor,
    params: {
      userId: string;
      courseId: string;
      orderId?: string | null;
      source: AccessGrantSource;
      validFrom?: Date;
      validUntil?: Date | null;
    },
  ): Promise<AccessGrant>;

  grantManualAccess(
    database: Executor,
    params: {
      userId: string;
      courseId: string;
      validUntil?: Date | null;
    },
  ): Promise<AccessGrant>;

  revokeAccessGrantById(database: Executor, grantId: string): Promise<void>;

  /**
   * Takes a learner's access to a course away, whichever way they got it.
   * The order that paid for it, if any, is left as it is: this is not a
   * refund.
   */
  revokeCourseAccess(
    database: Executor,
    userId: string,
    courseId: string,
  ): Promise<void>;

  /** Gives back access that was revoked, as it was before. */
  restoreCourseAccess(
    database: Executor,
    userId: string,
    courseId: string,
  ): Promise<void>;

  listUserGrants(database: Executor, userId: string): Promise<AccessGrant[]>;

  hasActiveAccess(
    database: Executor,
    userId: string,
    courseId: string,
  ): Promise<boolean>;

  /**
   * What the learner holds of a course right now: every section, or only
   * some when a link gave them part of it. Null when they hold no live
   * grant. Holding part of a course is holding it (`hasActiveAccess`):
   * it is in their My Courses and they take part in its discussions; only
   * lessons outside their sections stay locked.
   */
  getAccessScope(
    database: Executor,
    userId: string,
    courseId: string,
  ): Promise<CourseAccessScope | null>;

  /** `getAccessScope` for every course the learner holds now. */
  listAccessScopes(
    database: Executor,
    userId: string,
  ): Promise<Map<string, CourseAccessScope>>;

  /**
   * Whether someone who does not manage a course may be shown it, given its
   * status: anyone for a published course, only a learner who holds access
   * for an archived one, nobody for a draft. The grant is read only when
   * the answer depends on it. See `learnerCourseGate`.
   */
  isCourseOpenToLearner(
    database: Executor,
    userId: string | null | undefined,
    course: { id: string; status: string },
  ): Promise<boolean>;

  listActiveUserIdsForCourse(
    database: Executor,
    courseId: string,
  ): Promise<string[]>;

  revokeAccessForOrder(database: Executor, orderId: string): Promise<void>;

  revokeAccessForOrderCourse(
    database: Executor,
    orderId: string,
    courseId: string,
  ): Promise<void>;

  /** Courses whose live grant currently belongs to an order. */
  listActiveCourseIdsForOrder(
    database: Executor,
    orderId: string,
  ): Promise<string[]>;

  /** Moves a course grant to another order without interrupting access. */
  reassignGrantToOrder(
    database: Executor,
    input: {
      fromOrderId: string;
      courseId: string;
      toOrderId: string;
      source: "purchase" | "bundle_purchase";
    },
  ): Promise<void>;
}

/**
 * Runs `work` in a transaction: the caller's, when it is already in one,
 * otherwise a new one. A grant and the enrolment that mirrors it are two
 * writes; made separately, a failure between them left a learner with
 * access and no enrolment, or an enrolment that outlived a revoked grant.
 */
async function inTransaction<T>(
  database: Executor,
  work: (transaction: Executor) => Promise<T>,
): Promise<T> {
  if (database.isTransaction) return work(database);
  return (database as Kysely<Database>).transaction().execute(work);
}

export function createAccessService(): AccessService {
  async function grantAccess(
    database: Executor,
    params: {
      userId: string;
      courseId: string;
      orderId?: string | null;
      source: AccessGrantSource;
      validFrom?: Date;
      validUntil?: Date | null;
    },
  ): Promise<AccessGrant> {
    const now = new Date();
    const grant = await accessRepo.insertAccessGrant(database, {
      id: crypto.randomUUID(),
      user_id: params.userId,
      course_id: params.courseId,
      order_id: params.orderId ?? null,
      status: "active",
      source: params.source,
      valid_from: params.validFrom ?? now,
      valid_until: params.validUntil ?? null,
      created_at: now,
      updated_at: now,
    });

    return {
      id: grant.id,
      userId: grant.user_id,
      courseId: grant.course_id,
      purchaseId: grant.order_id,
      status: grant.status as AccessGrantStatus,
      source: grant.source as AccessGrantSource,
      validFrom: grant.valid_from,
      validUntil: grant.valid_until,
      createdAt: grant.created_at,
      updatedAt: grant.updated_at,
    };
  }

  async function grantManualAccess(
    outerDatabase: Executor,
    params: {
      userId: string;
      courseId: string;
      validUntil?: Date | null;
    },
  ): Promise<AccessGrant> {
    // An unreadable date reached the database as an invalid timestamp and
    // came back as a server error.
    if (params.validUntil && Number.isNaN(params.validUntil.getTime())) {
      throw new AppError(
        400,
        "INVALID_VALID_UNTIL",
        "validUntil is not a valid date.",
      );
    }

    if (params.validUntil && params.validUntil.getTime() <= Date.now()) {
      throw new AppError(
        400,
        "INVALID_VALID_UNTIL",
        "The access end date must be in the future.",
      );
    }

    return inTransaction(outerDatabase, async (database) => {
      // An unknown id reached the foreign keys and came back as a server
      // error. Only an active account, and only a published course: a draft
      // stays closed to every learner, and access to an archived one is kept
      // for those who already had it, not handed out.
      const { user, course } = await accessRepo.findManualGrantTargets(
        database,
        params.userId,
        params.courseId,
      );
      if (!user || user.is_deleted) {
        throw new AppError(404, "USER_NOT_FOUND", "Learner not found.");
      }
      if (!course || course.deleted_at) {
        throw new AppError(404, "COURSE_NOT_FOUND", "Course not found.");
      }
      if (course.status !== "published") {
        throw new AppError(
          400,
          "COURSE_NOT_GRANTABLE",
          "Only published courses can be given to a student.",
        );
      }

      const now = new Date();
      const grant = await grantAccess(database, {
        userId: params.userId,
        courseId: params.courseId,
        source: "admin_grant",
        validFrom: now,
        validUntil: params.validUntil,
      });

      // The enrolment mirrors the grant as it now stands, not the request.
      // The grant keeps what the learner already held (a longer or lifetime
      // period, and the order that paid for it); writing the requested
      // values here instead gave a lifetime buyer an enrolment that expired
      // with a short manual grant, and detached it from its order. The
      // course then left My Courses and could be bought a second time,
      // while a refund of the first order revoked nothing.
      const enrollment = {
        order_id: grant.purchaseId ?? null,
        status: "active" as const,
        source:
          grant.source === "purchase"
            ? ("direct_purchase" as const)
            : grant.source,
        access_starts_at: new Date(grant.validFrom),
        access_expires_at: grant.validUntil ? new Date(grant.validUntil) : null,
        updated_at: now,
      };
      await accessRepo.upsertEnrollmentForGrant(database, {
        id: crypto.randomUUID(),
        userId: params.userId,
        courseId: params.courseId,
        enrollment,
        // A grant that stayed with its order leaves the enrolment's own
        // source as it was: "purchase" on the grant covers both a course
        // bought alone and one bought in a bundle, and the enrolment is
        // where that difference is kept.
        updateSource: grant.source !== "purchase",
        createdAt: now,
      });
      await syncLinkedCourseAccess(database, [params.userId]);

      return grant;
    });
  }

  async function revokeAccessGrantById(
    outerDatabase: Executor,
    grantId: string,
  ): Promise<void> {
    await inTransaction(outerDatabase, async (database) => {
      const grant = await accessRepo.findAccessGrantById(database, grantId);

      // Answered "revoked successfully" for an id that matched nothing.
      if (!grant) {
        throw new AppError(
          404,
          "ACCESS_GRANT_NOT_FOUND",
          "Access grant not found.",
        );
      }

      await accessRepo.updateAccessGrantStatus(database, grantId, "revoked");

      await accessRepo.revokeEnrollment(
        database,
        grant.user_id,
        grant.course_id,
      );
      await syncLinkedCourseAccess(database, [grant.user_id]);
    });
  }

  async function revokeCourseAccess(
    outerDatabase: Executor,
    userId: string,
    courseId: string,
  ): Promise<void> {
    await inTransaction(outerDatabase, async (database) => {
      const [grant, enrollment] = await Promise.all([
        accessRepo.findAccessGrant(database, userId, courseId),
        accessRepo.findEnrollmentForCourse(database, userId, courseId),
      ]);

      // Nothing live to take away: an unknown pair, or access that was
      // already revoked or has lapsed. Revoking a lapsed row would relabel
      // it, and "Restore" would then bring back access that had run out.
      if (grant?.status !== "active" && enrollment?.status !== "active") {
        throw new AppError(
          404,
          "COURSE_ACCESS_NOT_FOUND",
          "This learner has no active access to this course.",
        );
      }

      if (grant) {
        await accessRepo.updateAccessGrantStatus(database, grant.id, "revoked");
      }
      await accessRepo.revokeEnrollment(database, userId, courseId);
      await syncLinkedCourseAccess(database, [userId]);
    });
  }

  async function restoreCourseAccess(
    outerDatabase: Executor,
    userId: string,
    courseId: string,
  ): Promise<void> {
    await inTransaction(outerDatabase, async (database) => {
      const [grant, enrollment] = await Promise.all([
        accessRepo.findAccessGrant(database, userId, courseId),
        accessRepo.findEnrollmentForCourse(database, userId, courseId),
      ]);

      if (!grant && !enrollment) {
        throw new AppError(
          404,
          "COURSE_ACCESS_NOT_FOUND",
          "This learner was never enrolled in this course.",
        );
      }
      if (grant?.status !== "revoked" && enrollment?.status !== "revoked") {
        throw new AppError(
          409,
          "COURSE_ACCESS_NOT_REVOKED",
          "This learner's access to this course is not revoked.",
        );
      }

      await accessRepo.restoreRevokedCourseAccess(database, userId, courseId);
      await syncLinkedCourseAccess(database, [userId]);
    });
  }

  async function listUserGrants(
    database: Executor,
    userId: string,
  ): Promise<AccessGrant[]> {
    const rows = await accessRepo.listUserAccessGrants(database, userId);
    return rows.map((g) => ({
      id: g.id,
      userId: g.user_id,
      courseId: g.course_id,
      purchaseId: g.order_id,
      status: g.status as AccessGrantStatus,
      source: g.source as AccessGrantSource,
      validFrom: g.valid_from,
      validUntil: g.valid_until,
      createdAt: g.created_at,
      updatedAt: g.updated_at,
    }));
  }

  function isLive(grant: {
    status: string;
    valid_until: Date | null;
  }): boolean {
    if (grant.status !== "active") return false;
    return !grant.valid_until || new Date() <= new Date(grant.valid_until);
  }

  async function hasActiveAccess(
    database: Executor,
    userId: string,
    courseId: string,
  ): Promise<boolean> {
    const grant = await accessRepo.findAccessGrant(database, userId, courseId);
    return Boolean(grant && isLive(grant));
  }

  async function getAccessScope(
    database: Executor,
    userId: string,
    courseId: string,
  ): Promise<CourseAccessScope | null> {
    const grant = await accessRepo.findAccessGrant(database, userId, courseId);
    if (!grant || !isLive(grant)) return null;
    return { sectionIds: grantSectionIds(grant) };
  }

  async function listAccessScopes(
    database: Executor,
    userId: string,
  ): Promise<Map<string, CourseAccessScope>> {
    const rows = await accessRepo.listUserAccessGrants(database, userId);
    return new Map(
      rows
        .filter(isLive)
        .map((grant) => [
          grant.course_id,
          { sectionIds: grantSectionIds(grant) },
        ]),
    );
  }

  async function isCourseOpenToLearner(
    database: Executor,
    userId: string | null | undefined,
    course: { id: string; status: string },
  ): Promise<boolean> {
    const gate = learnerCourseGate(course.status);
    if (gate === "open") return true;
    if (gate === "closed" || !userId) return false;
    return hasActiveAccess(database, userId, course.id);
  }

  async function listActiveUserIdsForCourse(
    database: Executor,
    courseId: string,
  ): Promise<string[]> {
    const rows = await accessRepo.listActiveUserIdsForCourse(
      database,
      courseId,
    );
    return rows;
  }

  async function revokeAccessForOrder(
    database: Executor,
    orderId: string,
  ): Promise<void> {
    await accessRepo.revokeAccessGrantsByOrderId(database, orderId);
  }

  async function revokeAccessForOrderCourse(
    database: Executor,
    orderId: string,
    courseId: string,
  ): Promise<void> {
    await accessRepo.revokeAccessGrantsForOrderCourse(
      database,
      orderId,
      courseId,
    );
  }

  async function listActiveCourseIdsForOrder(
    database: Executor,
    orderId: string,
  ): Promise<string[]> {
    return await accessRepo.listActiveGrantCourseIdsByOrderId(
      database,
      orderId,
    );
  }

  async function reassignGrantToOrder(
    database: Executor,
    input: {
      fromOrderId: string;
      courseId: string;
      toOrderId: string;
      source: "purchase" | "bundle_purchase";
    },
  ): Promise<void> {
    await accessRepo.reassignAccessGrantOrder(database, input);
  }

  return {
    grantAccess,
    grantManualAccess,
    revokeAccessGrantById,
    revokeCourseAccess,
    restoreCourseAccess,
    listUserGrants,
    hasActiveAccess,
    getAccessScope,
    listAccessScopes,
    isCourseOpenToLearner,
    listActiveUserIdsForCourse,
    revokeAccessForOrder,
    revokeAccessForOrderCourse,
    listActiveCourseIdsForOrder,
    reassignGrantToOrder,
  };
}
