import type { FastifyBaseLogger } from "fastify";
import { withoutCoursesOfDuplicateBundles } from "../orders/needs-refund.mapper.ts";
import * as needsRefundRepo from "../orders/needs-refund.repository.ts";
import type { Executor } from "../shared/repository.types.ts";

/**
 * A duplicate purchase: one buyer, two paid orders, the same course in
 * both (on its own or inside a bundle), or the same bundle in both.
 *
 * It happens because a gateway order cannot be withdrawn. When a new
 * checkout replaces a buyer's older unpaid order for the same items, the
 * older order is closed here but its gateway order stays payable; so does
 * the gateway order of any order that simply expired. A payment that still
 * arrives for one is honoured (see order.repository.ts's
 * markOrderPaidIfPending), and if the buyer has also paid the other order,
 * both end up paid for one enrolment.
 *
 * Nothing is refunded automatically and no access changes: staff decide,
 * and refund the later order from the Orders screen. Nothing is stored to
 * mark a duplicate either. It is read back from the orders themselves
 * (needs-refund.repository.ts's listDuplicatePurchases, which also says
 * exactly what counts as one), so it is listed for as long as both orders
 * stay paid and drops off the list when one of them is refunded.
 *
 * This file is the alert raised at the moment a capture creates one.
 */
export const DUPLICATE_PURCHASE_LOG_MESSAGE =
  "Order paid for a course or bundle the buyer already holds another paid order for; nothing was refunded and access is unchanged. Refund the later order from the Orders screen";

interface DuplicateOrdersNotice {
  /** The later-paid order: the one to refund. */
  refundOrderId: string;
  refundOrderNumber: string;
  earlierOrderId: string;
  earlierOrderNumber: string;
}

/** One course that both orders granted. */
export interface DuplicateCourseNotice extends DuplicateOrdersNotice {
  courseId: string;
  courseTitle: string;
  /** The bundle the later order holds the course in, when it does. */
  bundleTitle: string | null;
  /** The bundle the earlier order holds the course in, when it does. */
  earlierBundleTitle: string | null;
}

/** One bundle that both orders hold: said once, not once per course. */
export interface DuplicateBundleNotice extends DuplicateOrdersNotice {
  bundleId: string;
  bundleTitle: string;
}

export type DuplicatePurchaseNotice =
  DuplicateCourseNotice | DuplicateBundleNotice;

/** The duplicate purchases, if any, that `orderId` is one half of. */
export async function findDuplicatePurchasesForOrder(
  database: Executor,
  order: { id: string; userId: string },
): Promise<DuplicatePurchaseNotice[]> {
  const { courses, bundles } = await needsRefundRepo.listDuplicatePurchases(
    database,
    { userId: order.userId },
  );
  const isAboutOrder = (row: { order_id: string; earlier_order_id: string }) =>
    row.order_id === order.id || row.earlier_order_id === order.id;
  const orders = (row: {
    order_id: string;
    order_number: string;
    earlier_order_id: string;
    earlier_order_number: string;
  }): DuplicateOrdersNotice => ({
    refundOrderId: row.order_id,
    refundOrderNumber: row.order_number,
    earlierOrderId: row.earlier_order_id,
    earlierOrderNumber: row.earlier_order_number,
  });
  return [
    ...bundles.filter(isAboutOrder).map((row) => ({
      bundleId: row.bundle_id,
      bundleTitle: row.title_snapshot,
      ...orders(row),
    })),
    // As on the staff list: the same bundle in both orders is told once.
    ...withoutCoursesOfDuplicateBundles(courses, bundles)
      .filter(isAboutOrder)
      .map((row) => ({
        courseId: row.course_id,
        courseTitle: row.title_snapshot,
        bundleTitle: row.bundle_title,
        earlierBundleTitle: row.earlier_bundle_title,
        ...orders(row),
      })),
  ];
}

/**
 * Called after a capture has made an order paid. Logs, as an error on
 * purpose (someone has to return this money), when that left the buyer with
 * two paid orders for one course or one bundle.
 *
 * Run after the payment's transaction has committed and never allowed to
 * fail it: the payment is final by now, and the Orders screen lists the
 * duplicate whether or not this line is written.
 */
export async function reportDuplicatePurchases({
  database,
  log,
  order,
  payment,
}: {
  database: Executor;
  log: FastifyBaseLogger | undefined;
  order: { id: string; userId: string };
  payment: {
    id: string;
    gatewayPaymentId: string;
    amount: number;
    currency: string;
  };
}): Promise<DuplicatePurchaseNotice[]> {
  if (!log) return [];
  try {
    const duplicates = await findDuplicatePurchasesForOrder(database, order);
    if (duplicates.length > 0) {
      log.error(
        {
          paymentId: payment.id,
          orderId: order.id,
          gatewayPaymentId: payment.gatewayPaymentId,
          amount: payment.amount,
          currency: payment.currency,
          duplicates,
        },
        DUPLICATE_PURCHASE_LOG_MESSAGE,
      );
    }
    return duplicates;
  } catch (err: unknown) {
    log.warn(
      { err, orderId: order.id, paymentId: payment.id },
      "Could not check a newly paid order for a duplicate purchase",
    );
    return [];
  }
}
