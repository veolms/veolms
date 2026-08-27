import crypto from "node:crypto";
import type { AccessGrant, AccessGrantSource, AccessGrantStatus } from "@veolms/contracts";
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

  hasActiveAccess(
    database: Executor,
    userId: string,
    courseId: string,
  ): Promise<boolean>;

  revokeAccessForOrder(
    database: Executor,
    orderId: string,
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

  async function hasActiveAccess(
    database: Executor,
    userId: string,
    courseId: string,
  ): Promise<boolean> {
    const grant = await accessRepo.findAccessGrant(database, userId, courseId);
    if (!grant) return false;
    if (grant.status !== "active") return false;
    if (grant.valid_until && new Date() > new Date(grant.valid_until)) return false;
    return true;
  }

  async function revokeAccessForOrder(
    database: Executor,
    orderId: string,
  ): Promise<void> {
    await accessRepo.revokeAccessGrantsByOrderId(database, orderId);
  }

  return {
    grantAccess,
    hasActiveAccess,
    revokeAccessForOrder,
  };
}
