import crypto from "node:crypto";
import * as quizPricingRepo from "../../quizzes/shared/quiz-pricing.repository.ts";
import type { AccessService } from "../../access/access.service.ts";
import { createAccessService } from "../../access/access.service.ts";
import { syncLinkedCourseAccess } from "../../access/linked-course-access.ts";
import type { Executor } from "./repository.types.ts";
import * as courseConfigRepo from "../../courses/configuration/configuration.repository.ts";
import * as bundleRepo from "../bundles/bundle.repository.ts";
import * as enrollmentRepo from "../enrollments/enrollment.repository.ts";
import * as orderRepo from "../orders/order.repository.ts";
import * as orderItemCoursesRepo from "../orders/order-item-courses.repository.ts";

const DAY_MS = 24 * 60 * 60 * 1000;

export interface OrderRefLike {
  id: string;
  user_id: string;
}

export interface OrderItemRefLike {
  /**
   * The order item's own id. With it, a refunded bundle item releases the
   * courses that were noted for it when the order was fulfilled.
   */
  id?: string;
  item_type: "course" | "bundle" | "quiz";
  course_id: string | null;
  bundle_id: string | null;
  quiz_pricing_id?: string | null;
}

/** An order item being fulfilled: the row itself, so what it grants can be noted against it. */
export interface FulfilledOrderItemLike extends OrderItemRefLike {
  id: string;
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
   *
   * Also notes, in `order_item_courses`, which courses each item granted:
   * a course item its course, a bundle item every course it holds right
   * now. That is the only record of what a bundle order was sold with (the
   * grant and the enrollment are one row per buyer and course, taken over
   * by each later purchase), and it is what lets two paid orders be
   * compared course by course. Written with the same executor as the grant,
   * so inside the caller's transaction; running this again for the same
   * order adds nothing and changes nothing already noted.
   */
  grantAccessForOrder(
    database: Executor,
    order: OrderRefLike,
    orderItems: FulfilledOrderItemLike[],
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
   *
   * A bundle item releases the courses it granted when the order was
   * fulfilled (`order_item_courses`), whatever the bundle holds today: a
   * course added to the bundle since was never given by this order and is
   * left alone, and one removed since is still released. Only a bundle item
   * with nothing noted (an order paid before that record was kept, or a
   * caller that does not pass the item's id) falls back to the bundle's
   * courses as they are now.
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
    orderItems: FulfilledOrderItemLike[],
    validFrom?: Date,
  ): Promise<string[]> {
    const now = validFrom ?? new Date();
    const enrolledCourseIds: string[] = [];
    const granted: orderItemCoursesRepo.OrderItemCourseRecord[] = [];
    const noteGranted = (item: FulfilledOrderItemLike, courseId: string) => {
      granted.push({
        order_item_id: item.id,
        order_id: order.id,
        user_id: order.user_id,
        course_id: courseId,
        granted_at: now,
      });
    };

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
        noteGranted(item, item.course_id);
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
          noteGranted(item, bc.course_id);
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

    await orderItemCoursesRepo.recordOrderItemCourses(database, granted);
    // Linked courses come with the courses bought; the order names only
    // what was bought.
    await syncLinkedCourseAccess(database, [order.user_id]);

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
    await syncLinkedCourseAccess(database, [order.user_id]);
  }

  async function revokeAccessForOrderItem(
    database: Executor,
    order: OrderRefLike,
    item: OrderItemRefLike,
  ): Promise<void> {
    if (item.item_type === "course" && item.course_id) {
      await releaseCourseFromOrder(database, order, item.course_id);
    } else if (item.item_type === "bundle" && item.bundle_id) {
      const grantedCourseIds = item.id
        ? await orderItemCoursesRepo.listCourseIdsGrantedByOrderItem(
            database,
            item.id,
          )
        : [];
      const courseIds =
        grantedCourseIds.length > 0
          ? grantedCourseIds
          : (await bundleRepo.listBundleCourses(database, item.bundle_id)).map(
              (bc) => bc.course_id,
            );
      for (const courseId of courseIds) {
        await releaseCourseFromOrder(database, order, courseId);
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
    await syncLinkedCourseAccess(database, [order.user_id]);
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
    await syncLinkedCourseAccess(database, [order.user_id]);
  }

  return {
    grantAccessForOrder,
    revokeAccessForOrder,
    revokeAccessForOrderItem,
    withdrawCourseFromOrder,
  };
}
