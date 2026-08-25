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
import * as orderRepo from "../orders/order.repository.ts";
import * as paymentRepo from "../payments/payment.repository.ts";
import { createPricingService, type PricingService } from "../pricing/pricing.service.ts";
import { createPaymentService, type PaymentService } from "../payments/payment.service.ts";

export interface CheckoutService {
  previewCheckout(
    userId: string | undefined,
    request: CheckoutPreviewRequest,
  ): Promise<CheckoutPreviewResponse>;
  createOrder(
    user: { id: string; name: string; email?: string | null; phone?: string | null },
    request: CreateCheckoutOrderRequest,
  ): Promise<CreateCheckoutOrderResponse>;
}

export interface CheckoutServiceOptions {
  database: Kysely<Database>;
  paymentGateway: PaymentGateway;
  pricingService?: PricingService;
  paymentService?: PaymentService;
}

export function createCheckoutService({
  database,
  paymentGateway,
  pricingService = createPricingService({ database }),
  paymentService = createPaymentService({ database, paymentGateway }),
}: CheckoutServiceOptions): CheckoutService {
  /**
   * Generates a preview of checkout calculation with live item pricing and optional coupon.
   */
  async function previewCheckout(
    userId: string | undefined,
    request: CheckoutPreviewRequest,
  ): Promise<CheckoutPreviewResponse> {
    const { pricing, couponValidation } = await pricingService.calculatePricing({
      userId,
      items: request.items,
      couponCode: request.couponCode,
    });

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

  /**
   * Full order creation pipeline with recalculation, snapshots, idempotency, and gateway order creation.
   */
  async function createOrder(
    user: { id: string; name: string; email?: string | null; phone?: string | null },
    request: CreateCheckoutOrderRequest,
  ): Promise<CreateCheckoutOrderResponse> {
    const { items, couponCode, idempotencyKey } = request;

    // 1. Idempotency Check: return existing order if same idempotency key was submitted
    if (idempotencyKey) {
      const existingOrder = await orderRepo.findOrderByIdempotencyKey(database, idempotencyKey);
      if (existingOrder && existingOrder.user_id === user.id) {
        const payment = await paymentRepo.findPaymentByOrderId(database, existingOrder.id);
        const orderItems = await orderRepo.listOrderItems(database, existingOrder.id);

        if (payment) {
          return {
            order: {
              id: existingOrder.id,
              orderNumber: existingOrder.order_number,
              userId: existingOrder.user_id,
              status: existingOrder.status as any,
              currency: existingOrder.currency,
              subtotalAmount: existingOrder.subtotal_amount,
              discountAmount: existingOrder.discount_amount,
              taxAmount: existingOrder.tax_amount,
              totalAmount: existingOrder.total_amount,
              couponId: existingOrder.coupon_id,
              idempotencyKey: existingOrder.idempotency_key,
              items: orderItems.map((oi) => ({
                id: oi.id,
                orderId: oi.order_id,
                itemType: oi.item_type as any,
                courseId: oi.course_id,
                bundleId: oi.bundle_id,
                titleSnapshot: oi.title_snapshot,
                unitPrice: oi.unit_price,
                discountAmount: oi.discount_amount,
                taxAmount: oi.tax_amount,
                finalAmount: oi.final_amount,
                createdAt: oi.created_at,
              })),
              expiresAt: existingOrder.expires_at,
              paidAt: existingOrder.paid_at,
              createdAt: existingOrder.created_at,
              updatedAt: existingOrder.updated_at,
            },
            gateway: {
              provider: payment.gateway_provider as any,
              gatewayOrderId: payment.gateway_order_id,
              amount: payment.amount,
              currency: payment.currency,
            },
          };
        }
      }
    }

    // 2. Authoritatively recalculate pricing from database
    const { pricing } = await pricingService.calculatePricing({
      userId: user.id,
      items,
      couponCode,
    });

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 60 * 60 * 1000); // 1 hour order expiry
    const orderId = crypto.randomUUID();
    const orderNumber = generateOrderNumber();

    // 3. Database Transaction Boundary for Order + Order Items Snapshots
    const createdOrder = await database.transaction().execute(async (trx) => {
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
        title_snapshot: it.title,
        unit_price: it.unitPrice,
        discount_amount: it.discountAmount,
        tax_amount: it.taxAmount,
        final_amount: it.finalAmount,
        created_at: now,
      }));

      await orderRepo.insertOrderItems(trx, orderItemRows);

      return {
        ...orderRow,
        items: orderItemRows,
      };
    });

    // 4. External Gateway Call (executed OUTSIDE the database transaction)
    const { gatewayOrder } = await paymentService.initializePayment({
      orderId: createdOrder.id,
      customer: user,
    });

    return {
      order: {
        id: createdOrder.id,
        orderNumber: createdOrder.order_number,
        userId: createdOrder.user_id,
        status: createdOrder.status as any,
        currency: createdOrder.currency,
        subtotalAmount: createdOrder.subtotal_amount,
        discountAmount: createdOrder.discount_amount,
        taxAmount: createdOrder.tax_amount,
        totalAmount: createdOrder.total_amount,
        couponId: createdOrder.coupon_id,
        idempotencyKey: createdOrder.idempotency_key,
        items: createdOrder.items.map((oi) => ({
          id: oi.id,
          orderId: oi.order_id,
          itemType: oi.item_type as any,
          courseId: oi.course_id,
          bundleId: oi.bundle_id,
          titleSnapshot: oi.title_snapshot,
          unitPrice: oi.unit_price,
          discountAmount: oi.discount_amount,
          taxAmount: oi.tax_amount,
          finalAmount: oi.final_amount,
          createdAt: oi.created_at,
        })),
        expiresAt: createdOrder.expires_at,
        paidAt: createdOrder.paid_at,
        createdAt: createdOrder.created_at,
        updatedAt: createdOrder.updated_at,
      },
      gateway: {
        provider: gatewayOrder.provider as any,
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
