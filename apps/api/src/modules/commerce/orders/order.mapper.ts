import { orderPaymentMethodSchema } from "@veolms/contracts";
import type {
  Order,
  OrderItemSnapshot,
  OrderAdminDetails,
  OrderPaymentMethod,
} from "@veolms/contracts";
import type { Database, OrderItemType, OrderStatus } from "@veolms/database";
import type { Selectable } from "kysely";
import { toRefundContract } from "../refunds/refund.mapper.ts";

/**
 * Minimal shape needed to map a persisted order row to the `Order` API
 * contract. Deliberately structural (not tied to Kysely's
 * `Selectable<OrderTable>`) so it also accepts the plain object
 * checkout.service.ts builds inline for its free-checkout / idempotent-replay
 * paths, which never round-trip through a DB read after insert.
 */
export interface OrderRowLike {
  id: string;
  order_number: string;
  user_id: string;
  status: OrderStatus;
  currency: string;
  subtotal_amount: number;
  discount_amount: number;
  tax_amount: number;
  total_amount: number;
  coupon_id: string | null;
  idempotency_key: string | null;
  expires_at: Date;
  paid_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface OrderItemRowLike {
  id: string;
  order_id: string;
  item_type: OrderItemType;
  course_id: string | null;
  bundle_id: string | null;
  title_snapshot: string;
  unit_price: number;
  discount_amount: number;
  tax_amount: number;
  final_amount: number;
  created_at: Date;
}

export function toOrderItemContract(row: OrderItemRowLike): OrderItemSnapshot {
  return {
    id: row.id,
    orderId: row.order_id,
    // OrderItemType is the same literal union ("course" | "bundle") on both
    // the DB (@veolms/database) and contract (@veolms/contracts) side, so
    // this is a plain assignment — no cast. If the two unions ever drift,
    // this line stops typechecking instead of silently passing through
    // `as any`.
    itemType: row.item_type,
    courseId: row.course_id,
    bundleId: row.bundle_id,
    titleSnapshot: row.title_snapshot,
    unitPrice: row.unit_price,
    discountAmount: row.discount_amount,
    taxAmount: row.tax_amount,
    finalAmount: row.final_amount,
    createdAt: row.created_at,
  };
}

/**
 * Maps a persisted order row (+ its items) to the `Order` API contract.
 *
 * `overrides` exists for the free-checkout path in checkout.service.ts: it
 * finalizes the payment (which updates `orders.status`/`paid_at` in the DB)
 * but keeps working off the in-memory row captured before that update, so it
 * needs to reflect the now-current status/paidAt without a redundant re-read.
 */
/**
 * Projects the untyped `payments.payment_method` jsonb onto the fields the
 * contract exposes. Anything else stored in the column is dropped, and a value
 * that isn't a recognisable payment method becomes `null` rather than
 * leaking through or failing the response.
 */
export function toOrderPaymentMethod(raw: unknown): OrderPaymentMethod | null {
  const parsed = orderPaymentMethodSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

type AdminUserRow = Pick<
  Selectable<Database["users"]>,
  "display_name" | "username" | "email"
>;

/**
 * Builds the academy-only `admin` block shown on an order. Shared by the
 * single-order and list paths so both present a row identically.
 */
export function toOrderAdminDetails(input: {
  order: Pick<OrderRowLike, "user_id">;
  user?: AdminUserRow;
  coupon?: Selectable<Database["coupons"]>;
  payment?: Selectable<Database["payments"]>;
  refunds: Selectable<Database["refunds"]>[];
}): OrderAdminDetails {
  const { order, user, coupon, payment, refunds } = input;
  return {
    student: {
      id: order.user_id,
      name: user?.display_name || user?.username || "Student",
      displayName: user?.display_name,
      email: user?.email ?? null,
      username: user?.username || "student",
    },
    coupon: coupon
      ? {
          id: coupon.id,
          code: coupon.code,
          discountType: coupon.discount_type as "percentage" | "fixed",
          discountValue: coupon.discount_value,
        }
      : null,
    payment: payment
      ? {
          id: payment.id,
          gatewayProvider: payment.gateway_provider,
          gatewayOrderId: payment.gateway_order_id,
          gatewayPaymentId: payment.gateway_payment_id ?? null,
          amount: payment.amount,
          currency: payment.currency,
          status: payment.status,
          paymentMethod: toOrderPaymentMethod(payment.payment_method),
        }
      : null,
    refunds: refunds.map(toRefundContract),
  };
}

export function toOrderContract(
  row: OrderRowLike,
  items: OrderItemRowLike[],
  overrides?: {
    status?: OrderStatus;
    paidAt?: Date | null;
    admin?: OrderAdminDetails;
  },
): Order {
  const result: Order = {
    id: row.id,
    orderNumber: row.order_number,
    userId: row.user_id,
    // OrderStatus is the same literal union on both sides — see comment on
    // itemType above; a drift here fails to typecheck instead of silently
    // passing through `as any`.
    status: overrides?.status ?? row.status,
    currency: row.currency,
    subtotalAmount: row.subtotal_amount,
    discountAmount: row.discount_amount,
    taxAmount: row.tax_amount,
    totalAmount: row.total_amount,
    couponId: row.coupon_id,
    idempotencyKey: row.idempotency_key,
    items: items.map(toOrderItemContract),
    expiresAt: row.expires_at,
    paidAt: overrides && "paidAt" in overrides ? overrides.paidAt : row.paid_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };

  if (overrides?.admin) {
    result.admin = overrides.admin;
  }

  return result;
}
