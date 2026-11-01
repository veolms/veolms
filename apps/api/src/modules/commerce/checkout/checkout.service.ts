import crypto from "node:crypto";
import {
  CHECKOUT_WINDOW_SECONDS,
  type CheckoutPreviewRequest,
  type CheckoutPreviewResponse,
  type CreateCheckoutOrderRequest,
  type CreateCheckoutOrderResponse,
  type PaymentGateway,
  type PricingCalculation,
  type ReleaseCheckoutOrderResponse,
} from "@veolms/contracts";
import type { Database, DatabaseExecutor as Executor } from "@veolms/database";
import type { Kysely } from "kysely";
import { AppError } from "../../../lib/errors.ts";
import { config } from "../../../config.ts";
import * as courseRepo from "../../courses/course/course.repository.ts";
import { CommerceErrors } from "../shared/commerce.errors.ts";
import { isUniqueViolation } from "../shared/db-errors.ts";
import {
  CHECKOUT_WINDOW_GRACE_SECONDS,
  checkoutSecondsLeft,
  coverageCovers,
  coverageOf,
  coverageOverlaps,
  decideOpenOrders,
  isOrderOpen,
  manualPaymentBlockingSince,
  sameItems,
} from "../shared/open-orders.ts";
import * as quizPricingRepo from "../../quizzes/shared/quiz-pricing.repository.ts";
import * as bundleRepo from "../bundles/bundle.repository.ts";
import * as couponRepo from "../coupons/coupon.repository.ts";
import * as enrollmentRepo from "../enrollments/enrollment.repository.ts";
import * as orderRepo from "../orders/order.repository.ts";
import * as paymentRepo from "../payments/payment.repository.ts";
import * as manualPaymentRepo from "../payments/manual-payment.repository.ts";
import {
  createPricingService,
  type PricingService,
} from "../pricing/pricing.service.ts";
import {
  createPaymentService,
  type PaymentService,
} from "../payments/payment.service.ts";
import {
  findGatewayCapture,
  gatewayOrderHasNoLivePayment,
} from "../payments/captured-gateway-payment.ts";
import { createExtraPaymentRefundService } from "../payments/extra-payment-refund.service.ts";
import { courseSaleState } from "../pricing/purchasable.ts";
import { toMinorUnits } from "../shared/currency.ts";
import {
  createPaymentReconciliationService,
  type PaymentReconciliationService,
} from "../payments/payment-reconciliation.service.ts";

/** Coupon refusals that confirm a code exists; see previewCheckout. */
const ANONYMOUS_HIDDEN_COUPON_ERRORS: ReadonlySet<string> = new Set([
  "COUPON_INACTIVE",
  "COUPON_NOT_STARTED",
  "COUPON_EXPIRED",
  "COUPON_USAGE_LIMIT_REACHED",
  "COUPON_MIN_ORDER_NOT_MET",
  "COUPON_NOT_APPLICABLE",
]);

export interface CheckoutService {
  previewCheckout(
    userId: string | undefined,
    request: CheckoutPreviewRequest,
  ): Promise<CheckoutPreviewResponse>;
  createOrder(
    user: {
      id: string;
      name: string;
      email?: string | null;
      phone?: string | null;
    },
    request: CreateCheckoutOrderRequest,
  ): Promise<CreateCheckoutOrderResponse>;
  releaseCheckoutOrder(
    userId: string,
    orderId: string,
  ): Promise<ReleaseCheckoutOrderResponse>;
}

export interface CheckoutServiceOptions {
  database: Kysely<Database>;
  paymentGateway: PaymentGateway;
  pricingService?: PricingService;
  paymentService?: PaymentService;
  reconciliationService?: PaymentReconciliationService;
  /** See `AUTO_REFUND_EXTRA_PAYMENTS`. */
  autoRefundExtraPayments?: boolean;
  /** See `MANUAL_PAYMENT_BLOCK_DAYS`. */
  manualPaymentBlockDays?: number;
}

export function createCheckoutService({
  database,
  paymentGateway,
  autoRefundExtraPayments = config.AUTO_REFUND_EXTRA_PAYMENTS,
  manualPaymentBlockDays = config.MANUAL_PAYMENT_BLOCK_DAYS,
  pricingService = createPricingService({ database }),
  paymentService = createPaymentService({
    database,
    paymentGateway,
    autoRefundExtraPayments,
    manualPaymentBlockDays,
  }),
  reconciliationService = createPaymentReconciliationService({
    database,
    autoRefundExtraPayments,
  }),
}: CheckoutServiceOptions): CheckoutService {
  const extraPaymentRefunds = createExtraPaymentRefundService({
    database,
    paymentGateway,
  });
  /**
   * Generates a preview of checkout calculation with live item pricing and optional coupon.
   */
  async function previewCheckout(
    userId: string | undefined,
    request: CheckoutPreviewRequest,
  ): Promise<CheckoutPreviewResponse> {
    const { pricing, couponValidation } = await pricingService
      .calculatePricing({
        userId,
        items: request.items,
        couponCode: request.couponCode,
      })
      .catch((error: unknown) => {
        // A visitor who is not signed in learns only that a code did not
        // work. The exact reason (expired, used up, not yet started, a
        // minimum order) confirms that the code exists, and is given once
        // the buyer is signed in.
        if (
          !userId &&
          request.couponCode &&
          error instanceof AppError &&
          ANONYMOUS_HIDDEN_COUPON_ERRORS.has(error.code)
        ) {
          throw CommerceErrors.INVALID_COUPON(
            request.couponCode.trim().toUpperCase(),
          );
        }
        throw error;
      });

    // The wire shape is what the checkout UI shows; the per-item breakdown
    // and the coupon's id are for order creation and stay here.
    return {
      pricing: {
        discountAmount: pricing.discountAmount,
        totalAmount: pricing.totalAmount,
        currency: pricing.currency,
      },
      couponValidation: couponValidation && {
        valid: couponValidation.valid,
        discountType: couponValidation.discountType,
        discountValue: couponValidation.discountValue,
        message: couponValidation.message,
      },
    };
  }

  /**
   * Generates human-friendly order numbers like ORD-YYYYMMDD-XXXX
   */
  function generateOrderNumber(): string {
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const randomHex = crypto.randomBytes(3).toString("hex").toUpperCase();
    return `ORD-${dateStr}-${randomHex}`;
  }

  type CheckoutUser = {
    id: string;
    name: string;
    email?: string | null;
    phone?: string | null;
  };
  type OrderRow = NonNullable<
    Awaited<ReturnType<typeof orderRepo.findOrderByIdempotencyKey>>
  >;
  type PaymentRow = NonNullable<
    Awaited<ReturnType<typeof paymentRepo.findPaymentByOrderId>>
  >;

  /**
   * Refuses to continue an unpaid order for something the buyer has come to
   * own since it was created (another order of theirs was paid, or access
   * was granted). New orders are refused for this by pricing; a resumed one
   * skipped that check and handed out a gateway order for a second payment.
   *
   * Refuses it too for a course that has been archived since: archiving
   * stops new purchases, and continuing an unpaid order is one.
   */
  async function assertStillPurchasable(
    order: OrderRow,
    executor: Executor = database,
  ): Promise<void> {
    const [items, ownedCourseIds] = await Promise.all([
      orderRepo.listOrderItems(executor, order.id),
      enrollmentRepo.listUserEnrolledCourseIds(executor, order.user_id),
    ]);
    const owned = new Set(ownedCourseIds);

    const bundleIds = items
      .filter((item) => item.item_type === "bundle" && item.bundle_id)
      .map((item) => item.bundle_id!);
    const [bundleCourses, courseRows] = await Promise.all([
      bundleRepo.listBundleCoursesForBundleIds(executor, bundleIds),
      courseRepo.findCoursesByIds(
        executor,
        items.flatMap((item) =>
          item.item_type === "course" && item.course_id ? [item.course_id] : [],
        ),
      ),
    ]);
    const courseStatusById = new Map(
      courseRows.map((course) => [course.id, course.status]),
    );
    const now = new Date();

    for (const item of items) {
      if (item.item_type === "course" && item.course_id) {
        if (owned.has(item.course_id)) {
          throw CommerceErrors.COURSE_ALREADY_OWNED(item.title_snapshot);
        }
        if (
          courseSaleState(courseStatusById.get(item.course_id)) === "archived"
        ) {
          throw CommerceErrors.COURSE_NOT_AVAILABLE();
        }
      } else if (item.item_type === "bundle" && item.bundle_id) {
        const courses = bundleCourses.filter(
          (row) => row.bundle_id === item.bundle_id,
        );
        if (
          courses.some(
            (row) => courseSaleState(row.course_status) === "archived",
          )
        ) {
          throw CommerceErrors.BUNDLE_COURSE_NOT_AVAILABLE(item.title_snapshot);
        }
        const ownedCourses = courses.filter((row) => owned.has(row.course_id));
        if (courses.length > 0 && ownedCourses.length === courses.length) {
          throw CommerceErrors.BUNDLE_ALL_COURSES_OWNED(item.title_snapshot);
        }
        if (ownedCourses.length > 0) {
          throw CommerceErrors.BUNDLE_CONTAINS_OWNED_COURSE(
            item.title_snapshot,
            ownedCourses.map((row) => row.course_title),
          );
        }
      } else if (item.item_type === "quiz" && item.quiz_pricing_id) {
        // The same lookup pricing refuses a new order with.
        const offering = await quizPricingRepo.findPricingById(
          executor,
          item.quiz_pricing_id,
        );
        if (
          offering &&
          (await quizPricingRepo.findActiveGrant(executor, {
            userId: order.user_id,
            courseId: offering.course_id,
            now,
          }))
        ) {
          throw CommerceErrors.QUIZ_ALREADY_OWNED(item.title_snapshot);
        }
        // A quiz pass is sold with its course: pricing refuses a new order
        // for one once the course is no longer published, and continuing
        // an unpaid order is refused the same way as for the course itself.
        if (offering) {
          const [quizCourse] = await courseRepo.findCoursesByIds(executor, [
            offering.course_id,
          ]);
          if (courseSaleState(quizCourse?.status) === "archived") {
            throw CommerceErrors.COURSE_NOT_AVAILABLE();
          }
        }
      }
    }
  }

  /**
   * Notes that the gateway order of an order about to be continued is being
   * handed out again. Run under the buyer's checkout lock, in the
   * transaction that decided to continue it, so the next checkout to take
   * the lock finds the order in checkout. Recorded after the lock was
   * released, that checkout could close this order and create another while
   * this one's gateway order was on its way to the buyer.
   *
   * Returns the payment whose gateway order is handed out; nothing when the
   * order has no gateway order to hand out (not unpaid, free, or not given
   * one yet).
   */
  async function handOutForResume(
    trx: Executor,
    order: OrderRow,
  ): Promise<PaymentRow | undefined> {
    if (order.status !== "pending" || order.total_amount <= 0) return undefined;
    const payment = await paymentRepo.findPaymentByOrderId(trx, order.id);
    if (
      !payment ||
      payment.gateway_provider === "free" ||
      payment.amount === 0
    ) {
      return undefined;
    }

    await assertStillPurchasable(order, trx);
    // A transfer the buyer reported for this order is with staff; paying
    // through the gateway as well would pay for it twice.
    // One staff have left unanswered for MANUAL_PAYMENT_BLOCK_DAYS no
    // longer stands in the way.
    if (
      await manualPaymentRepo.findPendingManualPaymentRequestByOrderId(
        trx,
        order.id,
        manualPaymentBlockingSince(new Date(), manualPaymentBlockDays),
      )
    ) {
      throw CommerceErrors.MANUAL_PAYMENT_PENDING(
        await orderTitle(order.id, trx),
      );
    }
    await paymentService.recordCheckoutHandOut(payment.id, trx);
    return payment;
  }

  /**
   * An unpaid order is about to be continued, which means handing its
   * gateway order to the buyer's checkout again. The money for it may
   * already have been taken: the checkout window can close without calling
   * back after a capture, and the webhook can be late or lost. The gateway
   * refuses to open a checkout for an order it has been paid for (the buyer
   * sees "Something went wrong" and cannot get any further), so the gateway
   * is asked first, and a captured payment is settled here, exactly once,
   * through the same path as the webhook and the recovery worker.
   *
   * Returns true when the order was found paid for and has been delivered.
   * A gateway that cannot be reached is no reason to refuse the checkout:
   * the order is then continued as before, and recovery settles it later.
   */
  async function settleIfAlreadyCaptured(
    existingOrder: OrderRow,
    payment: NonNullable<
      Awaited<ReturnType<typeof paymentRepo.findPaymentByOrderId>>
    >,
  ): Promise<boolean> {
    if (existingOrder.status !== "pending") return false;
    if (payment.status === "captured") return false;
    if (payment.gateway_provider !== paymentGateway.providerName) return false;
    if (payment.amount === 0 || !payment.gateway_order_id) return false;

    let capture: Awaited<ReturnType<typeof findGatewayCapture>>;
    try {
      capture = await findGatewayCapture(paymentGateway, payment);
    } catch {
      return false;
    }
    if (capture.state !== "captured") return false;

    const result = await reconciliationService.finalizeSuccessfulPayment({
      paymentId: payment.id,
      gatewayPaymentId: capture.gatewayPaymentId,
      paymentMethod: capture.paymentMethod,
    });
    // The capture found here is settled by the rule every capture is: money
    // for an order that is already paid, or for something the buyer already
    // has, is not a purchase. Nothing was granted for it and it goes back.
    if (result.autoRefundReserved) {
      await extraPaymentRefunds.refundExtraPayment(payment.id);
    }
    if (result.outcome === "recorded_as_extra") {
      // The order was closed unpaid. The buyer is told why it cannot be
      // continued, as for any order for something they already have.
      await assertStillPurchasable(existingOrder);
      throw CommerceErrors.ORDER_EXPIRED();
    }
    return true;
  }

  /**
   * Returns the checkout response for an order that already exists, bringing
   * its payment to the point the client can continue from. Used when a
   * request repeats an earlier one: same idempotency key, or the same items
   * under a coupon the earlier order is still holding.
   *
   * `handedOut` is the payment handOutForResume recorded a hand-out for,
   * when the order was read as `existingOrder` under the buyer's lock.
   */
  async function resumeExistingOrder(
    existingOrder: OrderRow,
    user: CheckoutUser,
    handedOut?: PaymentRow,
  ): Promise<CreateCheckoutOrderResponse> {
    const payment =
      handedOut ??
      (await paymentRepo.findPaymentByOrderId(database, existingOrder.id));
    const order = { id: existingOrder.id, status: existingOrder.status };

    // Before its gateway order goes out again: the buyer may already have
    // paid for this order without our hearing of it. If so it is delivered
    // now and no checkout is opened.
    if (payment && (await settleIfAlreadyCaptured(existingOrder, payment))) {
      return {
        order: { id: existingOrder.id, status: "paid" },
        gateway: null,
      };
    }

    if (
      !handedOut &&
      existingOrder.status !== "paid" &&
      existingOrder.total_amount > 0
    ) {
      await assertStillPurchasable(existingOrder);
    }

    if (payment) {
      const isFreeOrder =
        payment.gateway_provider === "free" || payment.amount === 0;

      if (isFreeOrder && payment.status !== "captured") {
        await reconciliationService.finalizeSuccessfulPayment({
          paymentId: payment.id,
          gatewayPaymentId:
            payment.gateway_payment_id ?? `free_pay_${existingOrder.id}`,
          paymentMethod: { method: "free" },
        });
        // Finalizing marked the order paid; the row read above predates it.
        return {
          order: { id: existingOrder.id, status: "paid" },
          gateway: null,
        };
      }

      // An unpaid order's gateway order is returned only once its hand-out
      // was recorded under the buyer's lock. A payment row that was not
      // there then (another request wrote it since) goes through
      // initializePayment below, which hands it out under that lock.
      if (isFreeOrder || handedOut || existingOrder.status !== "pending") {
        return {
          order,
          gateway: isFreeOrder
            ? null
            : {
                gatewayOrderId: payment.gateway_order_id,
                keyId: payment.gateway_key_id ?? undefined,
                amount: payment.amount,
                currency: payment.currency,
              },
        };
      }
    }

    // Order exists (from a prior attempt) but no payment row does — a paid
    // (non-free) checkout creates its payment row via
    // paymentService.initializePayment() *outside* the order-creation
    // transaction (step 5 below), so a gateway timeout or crash between the
    // two leaves exactly this state: order committed, payment never
    // initialized. A free checkout can't reach this branch — its payment row
    // is created atomically with the order in the same transaction (step 3),
    // so it always exists by the time the order does.
    //
    // Resume for the SAME order instead of creating another one, which for
    // the idempotency-key caller would collide with the UNIQUE constraint on
    // orders.idempotency_key.
    const { gatewayOrder } = await paymentService.initializePayment({
      orderId: existingOrder.id,
      customer: user,
    });

    return {
      order,
      gateway: {
        gatewayOrderId: gatewayOrder.gatewayOrderId,
        keyId: gatewayOrder.keyId,
        amount: gatewayOrder.amount,
        currency: gatewayOrder.currency,
      },
    };
  }

  /** What an order is for, as the buyer knows it. */
  async function orderTitle(orderId: string, executor: Executor = database) {
    const items = await orderRepo.listOrderItems(executor, orderId);
    return items.map((item) => item.title_snapshot).join(", ");
  }

  /**
   * What a new checkout does about the buyer's other unpaid orders: which
   * one it continues, which it closes first. Throws when one of them may
   * still be paid (see decideOpenOrders). Run under the buyer's checkout
   * lock, so the answer still holds when the new order is written.
   */
  async function settleOpenOrders(
    trx: Executor,
    userId: string,
    pricing: PricingCalculation,
    now: Date,
  ): Promise<{
    resumableOrder?: OrderRow;
    supersededOrderIds: string[];
    /**
     * Closed for a free enrolment that covers all they sell, while a
     * transfer for them waits for staff.
     */
    cancelledOrderIds: string[];
  }> {
    const openOrders = await orderRepo.listOrdersAwaitingPayment(trx, {
      userId,
      now,
      handedOutSince: new Date(
        now.getTime() -
          (CHECKOUT_WINDOW_SECONDS + CHECKOUT_WINDOW_GRACE_SECONDS) * 1000,
      ),
      manualPaymentSince: manualPaymentBlockingSince(
        now,
        manualPaymentBlockDays,
      ),
    });
    if (openOrders.length === 0) {
      return { supersededOrderIds: [], cancelledOrderIds: [] };
    }

    const openItems = await orderRepo.listOrderItemsByOrderIds(
      trx,
      openOrders.map((openOrder) => openOrder.id),
    );
    const bundleIds = new Set<string>();
    for (const it of pricing.items) {
      if (it.itemType === "bundle") bundleIds.add(it.itemId);
    }
    for (const it of openItems) {
      if (it.item_type === "bundle" && it.bundle_id) {
        bundleIds.add(it.bundle_id);
      }
    }
    const bundleCourses = await bundleRepo.listBundleCoursesForBundleIds(trx, [
      ...bundleIds,
    ]);
    const wanted = coverageOf(pricing.items, bundleCourses);

    const decision = decideOpenOrders(
      openOrders.map((openOrder) => {
        const held = coverageOf(
          openItems
            .filter((it) => it.order_id === openOrder.id)
            .map((it) => ({
              itemType: it.item_type,
              itemId: it.course_id ?? it.bundle_id ?? it.quiz_pricing_id,
            })),
          bundleCourses,
        );
        const isOpen =
          openOrder.status === "pending" &&
          new Date(openOrder.expires_at) > now;
        return {
          id: openOrder.id,
          isOpen,
          sameItems: sameItems(held, wanted),
          overlaps: coverageOverlaps(held, wanted),
          coveredByRequest: coverageCovers(wanted, held),
          sameTerms:
            openOrder.total_amount ===
              toMinorUnits(pricing.totalAmount, pricing.currency) &&
            openOrder.currency === pricing.currency &&
            openOrder.coupon_id === (pricing.couponId ?? null),
          manualPaymentPending: Boolean(openOrder.manual_payment_pending),
          checkoutSecondsLeft: checkoutSecondsLeft(
            {
              handedOutAt: openOrder.checkout_handed_out_at,
              createdAt: openOrder.created_at,
              totalAmount: openOrder.total_amount,
              isOpen,
            },
            now,
          ),
        };
      }),
      // An order with nothing to pay cannot be a second payment, so the
      // buyer is not made to wait for an earlier checkout to close.
      { freeOrder: pricing.totalAmount === 0 },
    );

    if (decision.kind === "manual_payment_pending") {
      throw CommerceErrors.MANUAL_PAYMENT_PENDING(
        await orderTitle(decision.orderId, trx),
      );
    }
    if (decision.kind === "checkout_in_progress") {
      throw CommerceErrors.CHECKOUT_IN_PROGRESS(
        await orderTitle(decision.orderId, trx),
        decision.secondsLeft,
      );
    }
    return {
      resumableOrder: openOrders.find(
        (openOrder) => openOrder.id === decision.resumeOrderId,
      ),
      supersededOrderIds: decision.supersedeOrderIds,
      cancelledOrderIds: decision.cancelOrderIds ?? [],
    };
  }

  /**
   * Full order creation pipeline with recalculation, snapshots, idempotency, and gateway order creation.
   */
  async function createOrder(
    user: {
      id: string;
      name: string;
      email?: string | null;
      phone?: string | null;
    },
    request: CreateCheckoutOrderRequest,
  ): Promise<CreateCheckoutOrderResponse> {
    const { items, couponCode, idempotencyKey } = request;

    // 1. Idempotency Check: return existing order if same idempotency key was submitted
    if (idempotencyKey) {
      const existingOrder = await orderRepo.findOrderByIdempotencyKey(
        database,
        idempotencyKey,
      );
      if (existingOrder) {
        if (existingOrder.user_id !== user.id) {
          throw CommerceErrors.IDEMPOTENCY_KEY_CONFLICT();
        }

        // A paid order is replayed as it is (the client shows it as bought),
        // and an unpaid one is continued while it is still open. Anything
        // else (expired, cancelled, refunded) cannot be continued: handing
        // back its gateway order invited a payment for an order that had
        // already ended. It gives up the key and this request starts afresh,
        // at today's price.
        if (existingOrder.status === "paid") {
          return await resumeExistingOrder(existingOrder, user);
        }
        if (isOrderOpen(existingOrder, new Date())) {
          // Read again under the buyer's lock: another checkout of theirs
          // may be closing this order to create its own (step 3).
          const claimed = await database.transaction().execute(async (trx) => {
            await orderRepo.lockBuyerCheckout(trx, user.id);
            const current = await orderRepo.findOrderByIdForUpdate(
              trx,
              existingOrder.id,
            );
            if (
              !current ||
              !(current.status === "paid" || isOrderOpen(current, new Date()))
            ) {
              return undefined;
            }
            return {
              order: current,
              handedOut: await handOutForResume(trx, current),
            };
          });
          if (claimed) {
            return await resumeExistingOrder(
              claimed.order,
              user,
              claimed.handedOut,
            );
          }
        }
        await orderRepo.releaseOrderIdempotencyKey(database, existingOrder.id);
      }
    }

    // 2. Authoritatively recalculate pricing from database
    const { pricing } = await pricingService.calculatePricing({
      userId: user.id,
      items,
      couponCode,
    });

    const now = new Date();

    // A coupon use is held by an unpaid order from the moment it is created
    // (see the reservation check in step 3). So that a buyer who closed the
    // payment window and clicks Pay again is not blocked by their own
    // earlier attempt, a repeat of the same items under the same coupon
    // continues that order instead of creating another.
    //
    // Only when it is the same purchase to the last rupee. The same items at
    // a different amount (the buyer changed what they chose to pay) used to
    // continue the earlier order at the earlier amount, so the gateway asked
    // for a sum other than the one on the button. Such an order is closed
    // instead, which frees the coupon for the order created below.
    //
    // There is one payable order per buyer for any course or quiz pass: an
    // unpaid order that shares something with this request (the same items
    // at another amount, or a bundle holding a course asked for here) is
    // closed first. The gateway order of a closed one cannot be withdrawn,
    // so it is only closed once no payment window for it can still be open
    // and no transfer reported for it is waiting for staff; until then this
    // request is refused (see settleOpenOrders). A payment that arrives for
    // a closed order all the same is honoured as for any expired order (see
    // markOrderPaidIfPending) and shows as a paid order staff can refund.
    //
    // Decided inside the transaction of step 3, under the buyer's checkout
    // lock: decided before it, two requests arriving together both found
    // nothing open and each created an order.

    const expiresAt = new Date(now.getTime() + 60 * 60 * 1000); // 1 hour order expiry
    const orderId = crypto.randomUUID();
    const orderNumber = generateOrderNumber();
    const isFreeCheckout = pricing.totalAmount === 0;

    // 3. Database Transaction Boundary for Order + Order Items Snapshots
    let outcome: Awaited<ReturnType<typeof insertOrderWithItems>>;
    try {
      outcome = await insertOrderWithItems();
    } catch (err) {
      // Two concurrent checkouts with the same idempotency key can both
      // miss the pre-check in step 1 (it runs before either insert
      // commits). The loser surfaces here as a unique violation on
      // orders.idempotency_key — previously an unhandled 500. The winner
      // is committed by the time Postgres raises this, so re-entering
      // createOrder replays its order via the step-1 branch.
      if (
        idempotencyKey &&
        isUniqueViolation(err) &&
        String((err as { constraint?: string }).constraint ?? "").includes(
          "idempotency",
        )
      ) {
        return await createOrder(user, request);
      }
      throw err;
    }

    async function insertOrderWithItems() {
      return await database.transaction().execute(async (trx) => {
        await orderRepo.lockBuyerCheckout(trx, user.id);
        const { resumableOrder, supersededOrderIds, cancelledOrderIds } =
          await settleOpenOrders(trx, user.id, pricing, now);
        // Before the coupon's limits are counted, so the earlier order's hold
        // is not counted against this one.
        await orderRepo.expirePendingOrders(trx, supersededOrderIds, now);
        await orderRepo.cancelUnpaidOrders(trx, cancelledOrderIds, now);
        if (resumableOrder) {
          return {
            resumableOrder,
            handedOut: await handOutForResume(trx, resumableOrder),
          };
        }

        // Reserve the coupon use. The limits used to be checked only against
        // redemptions, which are written when an order is PAID — so any
        // number of unpaid orders could be created under a single-use coupon
        // and then all paid at the discount. Under the coupon's row lock
        // (which serialises concurrent checkouts) the limits are checked
        // against redemptions plus the unpaid, unexpired orders already
        // holding the coupon; this order then holds one itself.
        if (pricing.couponId) {
          const coupon = await couponRepo.findCouponByIdForUpdate(
            trx,
            pricing.couponId,
          );
          if (!coupon) {
            throw CommerceErrors.INVALID_COUPON(couponCode ?? "");
          }

          if (coupon.global_usage_limit !== null) {
            const [redeemed, held] = await Promise.all([
              couponRepo.countCouponRedemptionsGlobal(trx, coupon.id),
              orderRepo.countPendingOrdersUsingCoupon(trx, {
                couponId: coupon.id,
                now,
              }),
            ]);
            if (redeemed + held >= coupon.global_usage_limit) {
              throw CommerceErrors.COUPON_USAGE_LIMIT_REACHED(coupon.code);
            }
          }

          if (coupon.per_user_limit) {
            const [redeemedByUser, heldByUser] = await Promise.all([
              couponRepo.countCouponRedemptionsByUser(trx, coupon.id, user.id),
              orderRepo.countPendingOrdersUsingCoupon(trx, {
                couponId: coupon.id,
                userId: user.id,
                now,
              }),
            ]);
            if (redeemedByUser + heldByUser >= coupon.per_user_limit) {
              throw CommerceErrors.COUPON_USER_LIMIT_REACHED(coupon.code);
            }
          }
        }

        const orderRow = await orderRepo.insertOrder(trx, {
          id: orderId,
          order_number: orderNumber,
          user_id: user.id,
          status: "pending",
          currency: pricing.currency,
          // The pricing is whole major units, as catalog prices are set;
          // the order stores the money it transacts in minor units.
          subtotal_amount: toMinorUnits(
            pricing.subtotalAmount,
            pricing.currency,
          ),
          discount_amount: toMinorUnits(
            pricing.discountAmount,
            pricing.currency,
          ),
          tax_amount: toMinorUnits(pricing.taxAmount, pricing.currency),
          total_amount: toMinorUnits(pricing.totalAmount, pricing.currency),
          coupon_id: pricing.couponId ?? null,
          idempotency_key: idempotencyKey ?? null,
          expires_at: expiresAt,
          created_at: now,
          updated_at: now,
        });

        const orderItemRows = pricing.items.map((it) => ({
          id: crypto.randomUUID(),
          order_id: orderId,
          item_type: it.itemType,
          course_id: it.itemType === "course" ? it.itemId : null,
          bundle_id: it.itemType === "bundle" ? it.itemId : null,
          quiz_pricing_id: it.itemType === "quiz" ? it.itemId : null,
          title_snapshot: it.title,
          unit_price: toMinorUnits(it.unitPrice, pricing.currency),
          discount_amount: toMinorUnits(it.discountAmount, pricing.currency),
          tax_amount: toMinorUnits(it.taxAmount, pricing.currency),
          final_amount: toMinorUnits(it.finalAmount, pricing.currency),
          created_at: now,
        }));

        await orderRepo.insertOrderItems(trx, orderItemRows);

        let initialPaymentId: string | undefined;

        if (isFreeCheckout) {
          initialPaymentId = crypto.randomUUID();
          await paymentRepo.insertPayment(trx, {
            id: initialPaymentId,
            order_id: orderId,
            gateway_provider: "free",
            gateway_order_id: `free_ord_${orderId}`,
            gateway_payment_id: null,
            gateway_key_id: null,
            amount: 0,
            currency: pricing.currency,
            status: "initiated",
            created_at: now,
            updated_at: now,
          });
        }

        return { createdOrder: { ...orderRow, initialPaymentId } };
      });
    }

    /**
     * initializePayment found the order closed by the time the gateway had
     * answered, and handed nothing out. When it was closed for another
     * checkout of the buyer's, the answer names that one, as it would have
     * had this request arrived second.
     */
    async function refuseForClosedOrder(error: unknown): Promise<never> {
      if (error instanceof AppError && error.code === "ORDER_EXPIRED") {
        await settleOpenOrders(database, user.id, pricing, new Date());
      }
      throw error;
    }

    if (outcome.resumableOrder) {
      return await resumeExistingOrder(
        outcome.resumableOrder,
        user,
        outcome.handedOut,
      ).catch(refuseForClosedOrder);
    }
    const { createdOrder } = outcome;

    // 4. Handle Free Orders vs Paid Gateway Orders
    if (isFreeCheckout && createdOrder.initialPaymentId) {
      // Free order: instantly finalize and fulfill without external gateway call
      await reconciliationService.finalizeSuccessfulPayment({
        paymentId: createdOrder.initialPaymentId,
        gatewayPaymentId: `free_pay_${orderId}`,
        paymentMethod: { method: "free" },
      });

      // Finalizing marked the order paid; `createdOrder` predates it.
      return {
        order: { id: createdOrder.id, status: "paid" },
        gateway: null,
      };
    }

    // 5. External Gateway Call for Paid Orders (executed OUTSIDE the database transaction)
    const { gatewayOrder } = await paymentService
      .initializePayment({
        orderId: createdOrder.id,
        // Inserted by this request a moment ago, so there is nothing to re-read.
        order: createdOrder,
        customer: user,
      })
      .catch(async (error: unknown) => {
        // The gateway did not give this order anything to pay with, and the
        // buyer is told so. Left as it was, the order sat in their purchase
        // history as "processing" for an hour and kept hold of its coupon.
        // Best effort: the gateway's error is the one that matters here.
        // Under the buyer's lock, as the payment row is written: a repeat
        // of this request may be writing one for this order right now.
        await database
          .transaction()
          .execute(async (trx) => {
            await orderRepo.lockBuyerCheckout(trx, user.id);
            await orderRepo.cancelOrderWithoutPayment(trx, createdOrder.id);
          })
          .catch(() => undefined);
        return await refuseForClosedOrder(error);
      });

    return {
      order: { id: createdOrder.id, status: createdOrder.status },
      gateway: {
        gatewayOrderId: gatewayOrder.gatewayOrderId,
        keyId: gatewayOrder.keyId,
        amount: gatewayOrder.amount,
        currency: gatewayOrder.currency,
      },
    };
  }

  /**
   * The buyer closed the payment window. Their order is cancelled, so that
   * paying again (with another coupon, at another amount) can start at once
   * instead of waiting out the window (see settleOpenOrders, which refuses
   * a new checkout while an earlier window for the same thing may be open).
   *
   * Only when no payment for it can still arrive: the gateway is asked
   * first, and an order with a payment in progress or captured, a transfer
   * reported, or a gateway that cannot be reached is left as it is. The
   * window refusal then still protects the buyer from paying twice, and the
   * recovery cycle settles a captured payment as before.
   *
   * The payment row is left open on purpose: the recovery worker goes on
   * checking it, so a capture that still arrives (it should not: the window
   * is closed) is found and, its order being cancelled, recorded as an
   * extra payment to send back (payments/extra-payment.ts).
   *
   * Done under the buyer's checkout lock, and only if the order was not
   * handed out again since the gateway was asked: another tab of theirs
   * may have opened a window for it in between.
   */
  async function releaseCheckoutOrder(
    userId: string,
    orderId: string,
  ): Promise<ReleaseCheckoutOrderResponse> {
    const order = await orderRepo.findOrderById(database, orderId, {
      type: "user",
      id: userId,
    });
    if (!order) throw CommerceErrors.ORDER_NOT_FOUND(orderId);
    if (order.status !== "pending") {
      return { released: false, status: order.status };
    }

    const handedOutBefore = await paymentRepo.findLastCheckoutHandOutAt(
      database,
      orderId,
    );
    const payment = await paymentRepo.findPaymentByOrderId(database, orderId);
    if (payment && payment.amount > 0 && payment.gateway_provider !== "free") {
      if (payment.status === "captured") {
        return { released: false, status: order.status };
      }
      if (payment.gateway_provider === "manual" || !payment.gateway_order_id) {
        return { released: false, status: order.status };
      }
      let noLivePayment = false;
      try {
        noLivePayment = await gatewayOrderHasNoLivePayment(
          paymentGateway,
          payment.gateway_order_id,
        );
      } catch {
        noLivePayment = false;
      }
      if (!noLivePayment) return { released: false, status: order.status };
    }

    return await database.transaction().execute(async (trx) => {
      await orderRepo.lockBuyerCheckout(trx, userId);
      const current = await orderRepo.findOrderByIdForUpdate(trx, orderId);
      if (!current || current.status !== "pending") {
        return {
          released: false,
          status: current?.status ?? order.status,
        };
      }
      const handedOutNow = await paymentRepo.findLastCheckoutHandOutAt(
        trx,
        orderId,
      );
      const handedOutAgain =
        handedOutNow !== undefined &&
        (handedOutBefore === undefined ||
          handedOutNow.getTime() !== handedOutBefore.getTime());
      if (
        handedOutAgain ||
        (await manualPaymentRepo.findPendingManualPaymentRequestByOrderId(
          trx,
          orderId,
        ))
      ) {
        return { released: false, status: current.status };
      }
      await orderRepo.cancelUnpaidOrders(trx, [orderId], new Date());
      return { released: true, status: "cancelled" as const };
    });
  }

  return {
    previewCheckout,
    createOrder,
    releaseCheckoutOrder,
  };
}
