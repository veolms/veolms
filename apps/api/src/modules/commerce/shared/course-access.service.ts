import crypto from "node:crypto";
import * as quizPricingRepo from "../../quizzes/shared/quiz-pricing.repository.ts";
import type { AccessService } from "../../access/access.service.ts";
import { createAccessService } from "../../access/access.service.ts";
import type { Executor } from "./repository.types.ts";
import * as courseConfigRepo from "../../courses/configuration/configuration.repository.ts";
import * as bundleRepo from "../bundles/bundle.repository.ts";
import * as enrollmentRepo from "../enrollments/enrollment.repository.ts";
import * as orderRepo from "../orders/order.repository.ts";

const DAY_MS = 24 * 60 * 60 * 1000;

export interface OrderRefLike {
  id: string;
  user_id: string;
}

export interface OrderItemRefLike {
  item_type: "course" | "bundle" | "quiz";
  course_id: string | null;
  bundle_id: string | null;
  quiz_pricing_id?: string | null;
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
   * items resolve to (expanding bundle items to their member courses and fulfilling quizzes).
   * Returns the flat list of granted course IDs (callers use the count for
   * FinalizePaymentResult.enrollmentCount).
   */
  grantAccessForOrder(
    database: Executor,
    order: OrderRefLike,
    orderItems: OrderItemRefLike[],
    validFrom?: Date,
  ): Promise<string[]>;

  /**
   * Revokes access_grants for the whole order and flips every course the
   * order resolves to (direct items + bundle-member courses + quizzes) to an enrollment
   * status of "revoked".
   */
  revokeAccessForOrder(database: Executor, order: OrderRefLike): Promise<void>;

  /**
   * Revokes access_grants and enrollments specifically for a single refunded order item
   * (expanding bundle item courses if the refunded item was a bundle).
   */
  revokeAccessForOrderItem(
    database: Executor,
    order: OrderRefLike,
    item: OrderItemRefLike,
  ): Promise<void>;

  /**
   * Ends the access an order gives to one course without looking for
   * another order to take it over: the learner is leaving the course, not
   * being refunded.
   */
  withdrawCourseFromOrder(
    database: Executor,
    order: OrderRefLike,
    courseId: string,
  ): Promise<void>;
}

export function createCourseAccessService({
  accessService = createAccessService(),
}: {
  accessService?: AccessService;
} = {}): CourseAccessService {
  /**
   * When a purchase of this course stops granting access: the course's
   * access rule decides. "Fixed duration" means N days from the purchase;
   * anything else is lifetime (null). The rule used to be stored, shown and
   * validated at publish time but never applied, so a "90 days" course
   * granted lifetime access.
   */
  async function resolveAccessExpiry(
    database: Executor,
    courseId: string,
    from: Date,
  ): Promise<Date | null> {
    const rule = await courseConfigRepo.findAccessRuleByCourseId(
      database,
      courseId,
    );
    if (
      rule?.duration_type === "fixed_duration" &&
      rule.duration_days &&
      rule.duration_days > 0
    ) {
      return new Date(from.getTime() + rule.duration_days * DAY_MS);
    }
    return null;
  }

  /**
   * Stops an order from providing a course. If the buyer still holds the
   * course through another paid order, the grant and enrollment are handed
   * to that order and access continues; otherwise they are revoked.
   */
  async function releaseCourseFromOrder(
    database: Executor,
    order: OrderRefLike,
    courseId: string,
  ): Promise<void> {
    const successor = await orderRepo.findOtherPaidOrderCoveringCourse(
      database,
      { userId: order.user_id, courseId, excludeOrderId: order.id },
    );

    if (successor) {
      const viaBundle = successor.item_type === "bundle";
      await accessService.reassignGrantToOrder(database, {
        fromOrderId: order.id,
        courseId,
        toOrderId: successor.order_id,
        source: viaBundle ? "bundle_purchase" : "purchase",
      });
      await enrollmentRepo.reassignEnrollmentOrder(database, {
        fromOrderId: order.id,
        courseId,
        toOrderId: successor.order_id,
        source: viaBundle ? "bundle_purchase" : "direct_purchase",
      });
      return;
    }

    await accessService.revokeAccessForOrderCourse(
      database,
      order.id,
      courseId,
    );
    await enrollmentRepo.revokeEnrollmentsForOrderCourse(
      database,
      order.id,
      courseId,
    );
  }

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
        const expiresAt = await resolveAccessExpiry(
          database,
          item.course_id,
          now,
        );
        await accessService.grantAccess(database, {
          userId: order.user_id,
          courseId: item.course_id,
          orderId: order.id,
          source: "purchase",
          validFrom: now,
          validUntil: expiresAt,
        });
        await enrollmentRepo.insertEnrollment(database, {
          id: crypto.randomUUID(),
          user_id: order.user_id,
          course_id: item.course_id,
          order_id: order.id,
          status: "active",
          source: "direct_purchase",
          access_starts_at: now,
          access_expires_at: expiresAt,
          created_at: now,
          updated_at: now,
        });
        enrolledCourseIds.push(item.course_id);
      } else if (item.item_type === "bundle" && item.bundle_id) {
        const bundleCourses = await bundleRepo.listBundleCourses(
          database,
          item.bundle_id,
        );
        for (const bc of bundleCourses) {
          const expiresAt = await resolveAccessExpiry(
            database,
            bc.course_id,
            now,
          );
          await accessService.grantAccess(database, {
            userId: order.user_id,
            courseId: bc.course_id,
            orderId: order.id,
            source: "bundle_purchase",
            validFrom: now,
            validUntil: expiresAt,
          });
          await enrollmentRepo.insertEnrollment(database, {
            id: crypto.randomUUID(),
            user_id: order.user_id,
            course_id: bc.course_id,
            order_id: order.id,
            status: "active",
            source: "bundle_purchase",
            access_starts_at: now,
            access_expires_at: expiresAt,
            created_at: now,
            updated_at: now,
          });
          enrolledCourseIds.push(bc.course_id);
        }
      } else if (item.item_type === "quiz" && item.quiz_pricing_id) {
        const offering = await quizPricingRepo.findPricingById(
          database,
          item.quiz_pricing_id,
        );
        if (offering) {
          await quizPricingRepo.upsertGrant(database, {
            id: crypto.randomUUID(),
            user_id: order.user_id,
            course_id: offering.course_id,
            order_id: order.id,
            status: "active",
            source: "purchase",
            valid_from: now,
            valid_until: null,
            created_at: now,
            updated_at: now,
          });
          // Deliberately not added to enrolledCourseIds: a quiz purchase is
          // not a course enrollment.
        }
      }
    }

    return enrolledCourseIds;
  }

  async function revokeAccessForOrder(
    database: Executor,
    order: OrderRefLike,
  ): Promise<void> {
    // Course by course, so a course the buyer also holds through another
    // paid order is handed to that order instead of being taken away.
    const courseIds = new Set([
      ...(await accessService.listActiveCourseIdsForOrder(database, order.id)),
      ...(await enrollmentRepo.listActiveEnrollmentCourseIdsByOrderId(
        database,
        order.id,
      )),
    ]);
    for (const courseId of courseIds) {
      await releaseCourseFromOrder(database, order, courseId);
    }

    // Anything still tied to the order (rows that were not active).
    await accessService.revokeAccessForOrder(database, order.id);
    await enrollmentRepo.revokeEnrollmentsByOrderId(database, order.id);
    await quizPricingRepo.revokeGrantsByOrderId(database, order.id);
  }

  async function revokeAccessForOrderItem(
    database: Executor,
    order: OrderRefLike,
    item: OrderItemRefLike,
  ): Promise<void> {
    if (item.item_type === "course" && item.course_id) {
      await releaseCourseFromOrder(database, order, item.course_id);
    } else if (item.item_type === "bundle" && item.bundle_id) {
      const bundleCourses = await bundleRepo.listBundleCourses(
        database,
        item.bundle_id,
      );
      for (const bc of bundleCourses) {
        await releaseCourseFromOrder(database, order, bc.course_id);
      }
    } else if (item.item_type === "quiz" && item.quiz_pricing_id) {
      const offering = await quizPricingRepo.findPricingById(
        database,
        item.quiz_pricing_id,
      );
      if (offering) {
        await quizPricingRepo.revokeGrantForOrderCourse(database, {
          orderId: order.id,
          courseId: offering.course_id,
        });
      }
    }
  }

  async function withdrawCourseFromOrder(
    database: Executor,
    order: OrderRefLike,
    courseId: string,
  ): Promise<void> {
    await accessService.revokeAccessForOrderCourse(
      database,
      order.id,
      courseId,
    );
    await enrollmentRepo.revokeEnrollmentsForOrderCourse(
      database,
      order.id,
      courseId,
    );
  }

  return {
    grantAccessForOrder,
    revokeAccessForOrder,
    revokeAccessForOrderItem,
    withdrawCourseFromOrder,
  };
}
