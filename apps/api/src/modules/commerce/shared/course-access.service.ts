import crypto from "node:crypto";
import type { AccessService } from "../../access/access.service.ts";
import { createAccessService } from "../../access/access.service.ts";
import type { Executor } from "./repository.types.ts";
import * as orderRepo from "../orders/order.repository.ts";
import * as bundleRepo from "../bundles/bundle.repository.ts";
import * as enrollmentRepo from "../enrollments/enrollment.repository.ts";

export interface OrderRefLike {
  id: string;
  user_id: string;
}

export interface OrderItemRefLike {
  item_type: "course" | "bundle";
  course_id: string | null;
  bundle_id: string | null;
}

/**
 * Single shared owner of the "course access" write path, which always spans
 * two parallel tables — `access_grants` (via AccessService) and
 * `enrollments` — that were previously hand-synced across 4 separate call
 * sites (payment-reconciliation.service.ts, refund.service.ts,
 * refund-reconciliation.worker.ts, fulfillment/payment.worker.ts). Both
 * writes, and the course/bundle-item resolution loop that feeds them, now
 * live here exactly once, so a future edit to one table can't silently skip
 * the other.
 */
export interface CourseAccessService {
  /**
   * Grants access + creates an active enrollment for every course an order's
   * items resolve to (expanding bundle items to their member courses).
   * Returns the flat list of granted course IDs, e.g. for the
   * purchase.completed outbox event payload.
   */
  grantAccessForOrder(
    database: Executor,
    order: OrderRefLike,
    orderItems: OrderItemRefLike[],
    validFrom?: Date,
  ): Promise<string[]>;

  /**
   * Revokes access_grants for the whole order and flips every course the
   * order resolves to (direct items + bundle-member courses) to an enrollment
   * status of "revoked". Resolves the order's items itself so callers don't
   * each re-implement the course/bundle resolution loop.
   */
  revokeAccessForOrder(database: Executor, order: OrderRefLike): Promise<void>;
}

export function createCourseAccessService({
  accessService = createAccessService(),
}: {
  accessService?: AccessService;
} = {}): CourseAccessService {
  async function grantAccessForOrder(
    database: Executor,
    order: OrderRefLike,
    orderItems: OrderItemRefLike[],
    validFrom?: Date,
  ): Promise<string[]> {
    const now = validFrom ?? new Date();
    const enrolledCourseIds: string[] = [];

    for (const item of orderItems) {
      if (item.item_type === "course" && item.course_id) {
        await accessService.grantAccess(database, {
          userId: order.user_id,
          courseId: item.course_id,
          orderId: order.id,
          source: "purchase",
          validFrom: now,
        });
        await enrollmentRepo.insertEnrollment(database, {
          id: crypto.randomUUID(),
          user_id: order.user_id,
          course_id: item.course_id,
          order_id: order.id,
          status: "active",
          source: "direct_purchase",
          access_starts_at: now,
          access_expires_at: null,
          created_at: now,
          updated_at: now,
        });
        enrolledCourseIds.push(item.course_id);
      } else if (item.item_type === "bundle" && item.bundle_id) {
        const bundleCourses = await bundleRepo.listBundleCourses(database, item.bundle_id);
        for (const bc of bundleCourses) {
          await accessService.grantAccess(database, {
            userId: order.user_id,
            courseId: bc.course_id,
            orderId: order.id,
            source: "bundle_purchase",
            validFrom: now,
          });
          await enrollmentRepo.insertEnrollment(database, {
            id: crypto.randomUUID(),
            user_id: order.user_id,
            course_id: bc.course_id,
            order_id: order.id,
            status: "active",
            source: "bundle_purchase",
            access_starts_at: now,
            access_expires_at: null,
            created_at: now,
            updated_at: now,
          });
          enrolledCourseIds.push(bc.course_id);
        }
      }
    }

    return enrolledCourseIds;
  }

  async function revokeAccessForOrder(database: Executor, order: OrderRefLike): Promise<void> {
    await accessService.revokeAccessForOrder(database, order.id);

    const orderItems = await orderRepo.listOrderItems(database, order.id);
    for (const item of orderItems) {
      const courseIds: string[] = [];
      if (item.item_type === "course" && item.course_id) {
        courseIds.push(item.course_id);
      } else if (item.item_type === "bundle" && item.bundle_id) {
        const bundleCourses = await bundleRepo.listBundleCourses(database, item.bundle_id);
        courseIds.push(...bundleCourses.map((bc) => bc.course_id));
      }
      for (const courseId of courseIds) {
        await enrollmentRepo.updateEnrollmentStatus(database, order.user_id, courseId, "revoked");
      }
    }
  }

  return { grantAccessForOrder, revokeAccessForOrder };
}
