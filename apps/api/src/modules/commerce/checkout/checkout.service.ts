import crypto from "node:crypto";
import type {
  CartItemInput,
  CheckoutPreviewRequest,
  CheckoutPreviewResponse,
  CreateCheckoutOrderRequest,
  CreateCheckoutOrderResponse,
  Order,
  PaymentGateway,
} from "@veolms/contracts";
import type { Database } from "@veolms/database";
import type { Kysely } from "kysely";
import { CommerceErrors } from "../shared/commerce.errors.ts";
import { isUniqueViolation } from "../shared/db-errors.ts";
import * as couponRepo from "../coupons/coupon.repository.ts";
import * as orderRepo from "../orders/order.repository.ts";
import * as paymentRepo from "../payments/payment.repository.ts";
import {
  createPricingService,
  type PricingService,
} from "../pricing/pricing.service.ts";
import {
  createPaymentService,
  type PaymentService,
} from "../payments/payment.service.ts";
import {
  createPaymentReconciliationService,
  type PaymentReconciliationService,
} from "../payments/payment-reconciliation.service.ts";
import { toOrderContract } from "../orders/order.mapper.ts";
import { toPaymentProvider } from "../payments/payment.mapper.ts";

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
}

export interface CheckoutServiceOptions {
  database: Kysely<Database>;
  paymentGateway: PaymentGateway;
  pricingService?: PricingService;
  paymentService?: PaymentService;
  reconciliationService?: PaymentReconciliationService;
}

export function createCheckoutService({
  database,
  paymentGateway,
  pricingService = createPricingService({ database }),
  paymentService = createPaymentService({ database, paymentGateway }),
  reconciliationService = createPaymentReconciliationService({ database }),
}: CheckoutServiceOptions): CheckoutService {
  /**
   * Generates a preview of checkout calculation with live item pricing and optional coupon.
   */
  async function previewCheckout(
    userId: string | undefined,
    request: CheckoutPreviewRequest,
  ): Promise<CheckoutPreviewResponse> {
    const { pricing, couponValidation } = await pricingService.calculatePricing(
      {
        userId,
        items: request.items,
        couponCode: request.couponCode,
      },
    );

    return {
      pricing,
      couponValidation,
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

  /**
   * Returns the checkout response for an order that already exists, bringing
   * its payment to the point the client can continue from. Used when a
   * request repeats an earlier one: same idempotency key, or the same items
   * under a coupon the earlier order is still holding.
   */
  async function resumeExistingOrder(
    existingOrder: OrderRow,
    user: CheckoutUser,
  ): Promise<CreateCheckoutOrderResponse> {
    const payment = await paymentRepo.findPaymentByOrderId(
      database,
      existingOrder.id,
    );
    const orderItems = await orderRepo.listOrderItems(
      database,
      existingOrder.id,
    );

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
        return {
          order: toOrderContract(existingOrder, orderItems, {
            status: "paid",
            paidAt: new Date(),
          }),
          gateway: null,
        };
      }

      return {
        order: toOrderContract(existingOrder, orderItems),
        gateway: isFreeOrder
          ? null
          : {
              provider: toPaymentProvider(payment.gateway_provider),
              gatewayOrderId: payment.gateway_order_id,
              keyId: payment.gateway_key_id ?? undefined,
              amount: payment.amount,
              currency: payment.currency,
            },
      };
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
      order: toOrderContract(existingOrder, orderItems),
      gateway: {
        provider: gatewayOrder.provider,
        gatewayOrderId: gatewayOrder.gatewayOrderId,
        keyId: gatewayOrder.keyId,
        amount: gatewayOrder.amount,
        currency: gatewayOrder.currency,
      },
    };
  }

  /** Order-independent identity of a line item, for comparing item sets. */
  const itemKey = (itemType: string, itemId: string | null | undefined) =>
    `${itemType}:${itemId ?? ""}`;

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

        return await resumeExistingOrder(existingOrder, user);
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
    if (pricing.couponId) {
      const pendingOrders = await orderRepo.listPendingOrdersUsingCoupon(
        database,
        { couponId: pricing.couponId, userId: user.id, now },
      );
      const wanted = pricing.items
        .map((it) => itemKey(it.itemType, it.itemId))
        .sort()
        .join("|");
      for (const pendingOrder of pendingOrders) {
        const pendingItems = await orderRepo.listOrderItems(
          database,
          pendingOrder.id,
        );
        const held = pendingItems
          .map((it) =>
            itemKey(
              it.item_type,
              it.course_id ?? it.bundle_id ?? it.quiz_pricing_id,
            ),
          )
          .sort()
          .join("|");
        if (held === wanted) {
          return await resumeExistingOrder(pendingOrder, user);
        }
      }
    }

    const expiresAt = new Date(now.getTime() + 60 * 60 * 1000); // 1 hour order expiry
    const orderId = crypto.randomUUID();
    const orderNumber = generateOrderNumber();
    const isFreeCheckout = pricing.totalAmount === 0;

    // 3. Database Transaction Boundary for Order + Order Items Snapshots
    let createdOrder: Awaited<ReturnType<typeof insertOrderWithItems>>;
    try {
      createdOrder = await insertOrderWithItems();
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
              orderRepo.listPendingOrdersUsingCoupon(trx, {
                couponId: coupon.id,
                now,
              }),
            ]);
            if (redeemed + held.length >= coupon.global_usage_limit) {
              throw CommerceErrors.COUPON_USAGE_LIMIT_REACHED(coupon.code);
            }
          }

          if (coupon.per_user_limit) {
            const [redeemedByUser, heldByUser] = await Promise.all([
              couponRepo.countCouponRedemptionsByUser(trx, coupon.id, user.id),
              orderRepo.listPendingOrdersUsingCoupon(trx, {
                couponId: coupon.id,
                userId: user.id,
                now,
              }),
            ]);
            if (redeemedByUser + heldByUser.length >= coupon.per_user_limit) {
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
          subtotal_amount: pricing.subtotalAmount,
          discount_amount: pricing.discountAmount,
          tax_amount: pricing.taxAmount,
          total_amount: pricing.totalAmount,
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
          unit_price: it.unitPrice,
          discount_amount: it.discountAmount,
          tax_amount: it.taxAmount,
          final_amount: it.finalAmount,
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

        return {
          ...orderRow,
          items: orderItemRows,
          initialPaymentId,
        };
      });
    }

    // 4. Handle Free Orders vs Paid Gateway Orders
    if (isFreeCheckout && createdOrder.initialPaymentId) {
      // Free order: instantly finalize and fulfill without external gateway call
      await reconciliationService.finalizeSuccessfulPayment({
        paymentId: createdOrder.initialPaymentId,
        gatewayPaymentId: `free_pay_${orderId}`,
        paymentMethod: { method: "free" },
      });

      return {
        order: toOrderContract(createdOrder, createdOrder.items, {
          status: "paid",
          paidAt: now,
        }),
        gateway: null,
      };
    }

    // 5. External Gateway Call for Paid Orders (executed OUTSIDE the database transaction)
    const { gatewayOrder } = await paymentService.initializePayment({
      orderId: createdOrder.id,
      customer: user,
    });

    return {
      order: toOrderContract(createdOrder, createdOrder.items),
      gateway: {
        provider: gatewayOrder.provider,
        gatewayOrderId: gatewayOrder.gatewayOrderId,
        keyId: gatewayOrder.keyId,
        amount: gatewayOrder.amount,
        currency: gatewayOrder.currency,
      },
    };
  }

  return {
    previewCheckout,
    createOrder,
  };
}
