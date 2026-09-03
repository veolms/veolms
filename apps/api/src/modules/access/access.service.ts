import crypto from "node:crypto";
import type {
  AccessGrant,
  AccessGrantSource,
  AccessGrantStatus,
} from "@veolms/contracts";
import * as accessRepo from "./access.repository.ts";
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

  listUserGrants(database: Executor, userId: string): Promise<AccessGrant[]>;

  hasActiveAccess(
    database: Executor,
    userId: string,
    courseId: string,
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
    database: Executor,
    params: {
      userId: string;
      courseId: string;
      validUntil?: Date | null;
    },
  ): Promise<AccessGrant> {
    const now = new Date();
    const grant = await grantAccess(database, {
      userId: params.userId,
      courseId: params.courseId,
      source: "admin_grant",
      validFrom: now,
      validUntil: params.validUntil,
    });

    // Also sync enrollment record with admin_grant source
    await database
      .insertInto("enrollments")
      .values({
        id: crypto.randomUUID(),
        user_id: params.userId,
        course_id: params.courseId,
        order_id: null,
        status: "active",
        source: "admin_grant",
        access_starts_at: now,
        access_expires_at: params.validUntil ?? null,
        created_at: now,
        updated_at: now,
      })
      .onConflict((oc) =>
        oc.columns(["user_id", "course_id"]).doUpdateSet({
          order_id: null,
          status: "active",
          source: "admin_grant",
          access_starts_at: now,
          access_expires_at: params.validUntil ?? null,
          updated_at: now,
        }),
      )
      .executeTakeFirst();

    return grant;
  }

  async function revokeAccessGrantById(
    database: Executor,
    grantId: string,
  ): Promise<void> {
    const grant = await database
      .selectFrom("access_grants")
      .selectAll()
      .where("id", "=", grantId)
      .executeTakeFirst();

    if (!grant) return;

    await accessRepo.updateAccessGrantStatus(database, grantId, "revoked");

    await database
      .updateTable("enrollments")
      .set({
        status: "revoked",
        updated_at: new Date(),
      })
      .where("user_id", "=", grant.user_id)
      .where("course_id", "=", grant.course_id)
      .execute();
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

  async function hasActiveAccess(
    database: Executor,
    userId: string,
    courseId: string,
  ): Promise<boolean> {
    const grant = await accessRepo.findAccessGrant(database, userId, courseId);
    if (!grant) return false;
    if (grant.status !== "active") return false;
    if (grant.valid_until && new Date() > new Date(grant.valid_until))
      return false;
    return true;
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

  return {
    grantAccess,
    grantManualAccess,
    revokeAccessGrantById,
    listUserGrants,
    hasActiveAccess,
    listActiveUserIdsForCourse,
    revokeAccessForOrder,
    revokeAccessForOrderCourse,
  };
}
