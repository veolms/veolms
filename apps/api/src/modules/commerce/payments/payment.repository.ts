import { sql } from "kysely";
import type {
  PaymentStatus,
  PaymentAttemptStatus,
  Json,
} from "@veolms/database";
import type { Executor } from "../shared/repository.types.ts";
import { CHECKOUT_HAND_OUT_ATTEMPT_STATUS } from "../shared/open-orders.ts";

export async function findPaymentById(database: Executor, paymentId: string) {
  return await database
    .selectFrom("payments")
    .selectAll()
    .where("id", "=", paymentId)
    .executeTakeFirst();
}

// Which of an order's payment rows `findPaymentByOrderId` returns. The order
// screens rank theirs differently (orders/order.repository.ts's
// listPaymentsForOrders puts `refunded` and `processing` ahead of
// `initiated`); the two are kept apart on purpose, because aligning them
// would change which payment existing orders resolve to here.
const paymentRankForOrder = sql`CASE WHEN status = 'captured' THEN 0 WHEN status = 'authorized' THEN 1 WHEN status = 'pending' THEN 2 WHEN status = 'initiated' THEN 3 ELSE 4 END`;

export async function findPaymentByOrderId(
  database: Executor,
  orderId: string,
) {
  return await database
    .selectFrom("payments")
    .selectAll()
    .where("order_id", "=", orderId)
    .orderBy(paymentRankForOrder, "asc")
    .orderBy("created_at", "desc")
    .executeTakeFirst();
}

/**
 * For each of these orders, the provider of the payment
 * `findPaymentByOrderId` would return. An order with no payment row is left
 * out.
 */
export async function listPaymentProvidersByOrderIds(
  database: Executor,
  orderIds: string[],
) {
  if (orderIds.length === 0) return [];
  return await database
    .selectFrom("payments")
    .distinctOn("order_id")
    .select(["order_id", "gateway_provider"])
    .where("order_id", "in", orderIds)
    .orderBy("order_id")
    .orderBy(paymentRankForOrder, "asc")
    .orderBy("created_at", "desc")
    .execute();
}

/** The gateway ids of the payment `findPaymentByOrderId` would return. */
export async function findPaymentReferenceByOrderId(
  database: Executor,
  orderId: string,
) {
  return await database
    .selectFrom("payments")
    .select(["gateway_payment_id", "gateway_order_id"])
    .where("order_id", "=", orderId)
    .orderBy(paymentRankForOrder, "asc")
    .orderBy("created_at", "desc")
    .executeTakeFirst();
}

export async function findPaymentByGatewayOrderId(
  database: Executor,
  gatewayOrderId: string,
) {
  return await database
    .selectFrom("payments")
    .selectAll()
    .where("gateway_order_id", "=", gatewayOrderId)
    .executeTakeFirst();
}

export async function findPaymentByGatewayPaymentId(
  database: Executor,
  gatewayPaymentId: string,
) {
  return await database
    .selectFrom("payments")
    .selectAll()
    .where("gateway_payment_id", "=", gatewayPaymentId)
    .executeTakeFirst();
}

/**
 * The manual payment recorded under a transfer reference, if there is one.
 * `gatewayPaymentId` is the normalised id (`manual_pay_` plus the reference
 * with no whitespace, in upper case). The stored id is compared the same
 * way, so a payment verified before references were normalised, which holds
 * the reference as it was typed, is found too.
 */
export async function findManualPaymentByReference(
  database: Executor,
  gatewayPaymentId: string,
) {
  return await database
    .selectFrom("payments")
    .select("id")
    .where("gateway_provider", "=", "manual")
    .where(
      sql<boolean>`upper(regexp_replace(gateway_payment_id, '[[:space:]]+', '', 'g')) = upper(${gatewayPaymentId})`,
    )
    .executeTakeFirst();
}

export async function insertPayment(
  database: Executor,
  values: {
    id: string;
    order_id: string;
    gateway_provider: string;
    gateway_order_id: string;
    gateway_payment_id?: string | null;
    gateway_key_id?: string | null;
    amount: number;
    currency: string;
    status: PaymentStatus;
    payment_method?: Json | null;
    error_code?: string | null;
    error_description?: string | null;
    created_at?: Date;
    updated_at?: Date;
  },
) {
  return await database
    .insertInto("payments")
    .values(values)
    .returningAll()
    .executeTakeFirstOrThrow();
}

/**
 * Atomically transitions a payment from a non-captured status to "captured".
 * This is the concurrency gate for payment finalization: only one concurrent
 * caller wins. Returns the updated row if the claim succeeded, or undefined
 * if the payment was already captured (another caller won the race).
 */
export async function claimPaymentForFinalization(
  database: Executor,
  paymentId: string,
  gatewayPaymentId: string,
  paymentMethod: Json | null,
  now: Date,
) {
  return await database
    .updateTable("payments")
    .set({
      gateway_payment_id: gatewayPaymentId,
      status: "captured",
      payment_method: paymentMethod,
      updated_at: now,
    })
    .where("id", "=", paymentId)
    .where("status", "not in", ["captured", "refunded"])
    .returningAll()
    .executeTakeFirst();
}

/**
 * Updates a payment status only when the current status is one of the
 * allowed "from" states. Returns the updated row if the transition succeeded,
 * or undefined if the current status was not in the allowed list (i.e. the
 * transition is forbidden). This prevents backward state moves such as
 * captured → processing.
 *
 * Allowed transitions:
 *   initiated  → processing | captured | failed
 *   processing → captured | failed
 *   captured   → refunded
 *   failed     → (terminal)
 *   refunded   → (terminal)
 */
export async function transitionPaymentStatus(
  database: Executor,
  paymentId: string,
  toStatus: PaymentStatus,
  fromStatuses: PaymentStatus[],
  extra?: {
    error_code?: string | null;
    error_description?: string | null;
    updated_at?: Date;
  },
) {
  return await database
    .updateTable("payments")
    .set({
      status: toStatus,
      ...(extra ?? {}),
      updated_at: extra?.updated_at ?? new Date(),
    })
    .where("id", "=", paymentId)
    .where("status", "in", fromStatuses)
    .returningAll()
    .executeTakeFirst();
}

/**
 * Points an existing payment row at a freshly created gateway order, but
 * only while the payment is not in a final state. The guard matters: a
 * webhook can capture the payment between the caller's read and this
 * write, and an unconditional update would stomp a CAPTURED payment back
 * to "initiated" with a different gateway_order_id — orphaning the money.
 * Returns undefined when the payment reached a final state meanwhile.
 */
export async function reinitializePaymentIfNotFinal(
  database: Executor,
  paymentId: string,
  updates: {
    gateway_order_id: string;
    gateway_key_id: string | null;
    amount: number;
    currency: string;
    updated_at?: Date;
  },
) {
  return await database
    .updateTable("payments")
    .set({
      ...updates,
      status: "initiated",
      error_code: null,
      error_description: null,
      updated_at: updates.updated_at ?? new Date(),
    })
    .where("id", "=", paymentId)
    .where("status", "not in", ["captured", "refunded"])
    .returningAll()
    .executeTakeFirst();
}

/**
 * Closes whatever gateway payment an order still has open, when the order
 * has been settled some other way. The row stops being treated as a payment
 * in progress; a capture that still arrives for it is not lost (a failed
 * payment can be claimed): it is recorded as a surplus payment, because its
 * order is already paid (see surplus-payment.ts).
 */
export async function closeOpenPaymentsForOrder(
  database: Executor,
  orderId: string,
  reason: { error_code: string; error_description: string; now: Date },
) {
  return await database
    .updateTable("payments")
    .set({
      status: "failed",
      error_code: reason.error_code,
      error_description: reason.error_description,
      updated_at: reason.now,
    })
    .where("order_id", "=", orderId)
    .where("status", "in", ["initiated", "processing"])
    .returning("id")
    .execute();
}

/**
 * The last time an order's gateway order was returned to the buyer. Every
 * hand-out records an attempt, so this is the newest such attempt on the
 * order's gateway payment; undefined when it never had one.
 */
export async function findLastCheckoutHandOutAt(
  database: Executor,
  orderId: string,
): Promise<Date | undefined> {
  const row = await database
    .selectFrom("payment_attempts as a")
    .innerJoin("payments as p", "p.id", "a.payment_id")
    .select((eb) => eb.fn.max("a.created_at").as("at"))
    .where("p.order_id", "=", orderId)
    .where("p.gateway_provider", "not in", ["free", "manual"])
    .where("a.status", "=", CHECKOUT_HAND_OUT_ATTEMPT_STATUS)
    .executeTakeFirst();
  return row?.at ?? undefined;
}

/** Attempts recorded so far; the next attempt's number is this plus one. */
export async function countPaymentAttempts(
  database: Executor,
  paymentId: string,
): Promise<number> {
  const row = await database
    .selectFrom("payment_attempts")
    .select((eb) => eb.fn.countAll().as("count"))
    .where("payment_id", "=", paymentId)
    .executeTakeFirst();
  return Number(row?.count ?? 0);
}

export async function insertPaymentAttempt(
  database: Executor,
  values: {
    id: string;
    payment_id: string;
    gateway_payment_id?: string | null;
    attempt_number: number;
    status: PaymentAttemptStatus;
    error_code?: string | null;
    error_description?: string | null;
    raw_payload?: Json | null;
    created_at?: Date;
  },
) {
  return await database
    .insertInto("payment_attempts")
    .values(values)
    .returningAll()
    .executeTakeFirstOrThrow();
}
