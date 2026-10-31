import { orderPaymentMethodSchema } from "@veolms/contracts";
import type {
  AdminOrder,
  LearnerOrder,
  OrderItemSummary,
  OrderPaymentMethod,
  OrderPaymentSummary,
} from "@veolms/contracts";
import type { OrderStatus } from "@veolms/database";

/**
 * The order columns every order response is built from. Structural rather
 * than tied to a Kysely row type, so each caller can select just these.
 *
 * Order rows, and the payments and refunds shown alongside them, are all
 * stored in minor units (49900 paise = ₹499), and an order response exposes
 * that one unit.
 */
interface OrderRowLike {
  id: string;
  order_number: string;
  invoice_number: string | null;
  // OrderStatus is the same literal union on both the DB (@veolms/database)
  // and contract (@veolms/contracts) side, so it is assigned without a cast.
  // If the two ever drift this stops typechecking instead of silently
  // passing a value the contract doesn't allow.
  status: OrderStatus;
  currency: string;
  subtotal_amount: number;
  tax_amount: number;
  total_amount: number;
  created_at: Date;
}

interface AdminOrderRowLike extends OrderRowLike {
  discount_amount: number;
  after_commission_amount: number | null;
  paid_at: Date | null;
}

interface OrderItemRowLike {
  title_snapshot: string;
  course_id: string | null;
  opens_course_id?: string | null;
}

/** The payment that represents an order — see `listPaymentsForOrders`. */
interface OrderPaymentRowLike {
  gateway_provider: string;
  gateway_payment_id: string | null;
  payment_method: unknown;
}

function toOrderItemSummary(row: OrderItemRowLike): OrderItemSummary {
  return {
    titleSnapshot: row.title_snapshot,
    courseId: row.course_id,
    ...(row.opens_course_id ? { opensCourseId: row.opens_course_id } : {}),
  };
}

/**
 * Projects the untyped `payments.payment_method` jsonb onto the fields the
 * application knows. Anything else stored in the column is dropped, and a
 * value that isn't a recognisable payment method becomes `null` rather than
 * leaking through or failing the response.
 */
export function toOrderPaymentMethod(raw: unknown): OrderPaymentMethod | null {
  const parsed = orderPaymentMethodSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export function toOrderPaymentSummary(
  payment?: Pick<OrderPaymentRowLike, "gateway_provider" | "payment_method">,
): OrderPaymentSummary | null {
  if (!payment) return null;
  const method = toOrderPaymentMethod(payment.payment_method);
  if (!method) return null;

  return {
    provider: payment.gateway_provider,
    method: method.method,
    detail: method.wallet ?? method.bank ?? method.cardNetwork ?? null,
  };
}

/** An order as its buyer sees it (purchase history). */
export function toLearnerOrder(
  row: OrderRowLike,
  items: OrderItemRowLike[],
  payment?: OrderPaymentRowLike,
): LearnerOrder {
  return {
    id: row.id,
    orderNumber: row.order_number,
    invoiceNumber: row.invoice_number,
    status: row.status,
    currency: row.currency,
    subtotalAmount: row.subtotal_amount,
    taxAmount: row.tax_amount,
    totalAmount: row.total_amount,
    paymentSummary: toOrderPaymentSummary(payment),
    items: items.map(toOrderItemSummary),
    createdAt: row.created_at,
  };
}

/**
 * An order as the academy's orders screen sees it. Shared by the single-order
 * and list paths so both present a row identically.
 */
export function toAdminOrder(
  row: AdminOrderRowLike,
  items: OrderItemRowLike[],
  related: {
    user?: { display_name: string; username: string; email: string | null };
    avatarUrl: string | null;
    couponCode?: string;
    payment?: OrderPaymentRowLike;
  },
): AdminOrder {
  const { user, avatarUrl, couponCode, payment } = related;
  const paymentMethod = payment
    ? toOrderPaymentMethod(payment.payment_method)
    : null;

  return {
    id: row.id,
    orderNumber: row.order_number,
    invoiceNumber: row.invoice_number,
    status: row.status,
    currency: row.currency,
    subtotalAmount: row.subtotal_amount,
    discountAmount: row.discount_amount,
    taxAmount: row.tax_amount,
    totalAmount: row.total_amount,
    // Already stored in minor units.
    afterCommissionAmount: row.after_commission_amount ?? null,
    items: items.map(toOrderItemSummary),
    paidAt: row.paid_at,
    createdAt: row.created_at,
    admin: {
      student: {
        name: user?.display_name || user?.username || "Student",
        displayName: user?.display_name ?? "",
        email: user?.email ?? null,
        username: user?.username || "student",
        avatarUrl,
      },
      coupon: couponCode ? { code: couponCode } : null,
      payment: payment
        ? {
            gatewayProvider: payment.gateway_provider,
            gatewayPaymentId: payment.gateway_payment_id,
            paymentMethod: paymentMethod
              ? { method: paymentMethod.method, vpa: paymentMethod.vpa ?? null }
              : null,
          }
        : null,
    },
  };
}
