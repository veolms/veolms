import type { PaymentStatus, PaymentAttemptStatus } from "@veolms/database";
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
    payment_method?: unknown | null;
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

export async function updatePayment(
  database: Executor,
  paymentId: string,
  updates: {
    gateway_payment_id?: string | null;
    gateway_key_id?: string | null;
    status?: PaymentStatus;
    payment_method?: unknown | null;
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
    raw_payload?: unknown | null;
    created_at?: Date;
  },
) {
  return await database
    .insertInto("payment_attempts")
    .values(values)
    .returningAll()
    .executeTakeFirstOrThrow();
}
