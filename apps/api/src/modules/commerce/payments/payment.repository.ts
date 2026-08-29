import { sql } from "kysely";
import type { PaymentStatus, PaymentAttemptStatus, Json } from "@veolms/database";
import type { Executor } from "../shared/repository.types.ts";

export async function findPaymentById(database: Executor, paymentId: string) {
  return await database
    .selectFrom("payments")
    .selectAll()
    .where("id", "=", paymentId)
    .executeTakeFirst();
}

export async function findPaymentByOrderId(database: Executor, orderId: string) {
  return await database
    .selectFrom("payments")
    .selectAll()
    .where("order_id", "=", orderId)
    .orderBy(
      sql`CASE WHEN status = 'captured' THEN 0 WHEN status = 'authorized' THEN 1 WHEN status = 'pending' THEN 2 WHEN status = 'initiated' THEN 3 ELSE 4 END`,
      "asc",
    )
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

export async function updatePayment(
  database: Executor,
  paymentId: string,
  updates: {
    gateway_order_id?: string;
    gateway_payment_id?: string | null;
    gateway_key_id?: string | null;
    status?: PaymentStatus;
    payment_method?: Json | null;
    error_code?: string | null;
    error_description?: string | null;
    updated_at?: Date;
  },
) {
  return await database
    .updateTable("payments")
    .set(updates)
    .where("id", "=", paymentId)
    .returningAll()
    .executeTakeFirst();
}

export async function listPaymentAttempts(
  database: Executor,
  paymentId: string,
) {
  return await database
    .selectFrom("payment_attempts")
    .selectAll()
    .where("payment_id", "=", paymentId)
    .orderBy("attempt_number", "asc")
    .execute();
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
