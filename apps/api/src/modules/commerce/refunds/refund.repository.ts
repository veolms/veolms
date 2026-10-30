import { sql } from "kysely";
import type { RefundStatus } from "@veolms/database";
import type { Executor } from "../shared/repository.types.ts";
import {
  AUTO_REFUND_RETRY_MIN_MS,
  autoRefundKey,
} from "../payments/extra-payment.ts";
import { SURPLUS_CAPTURE_ERROR_CODE } from "../payments/surplus-payment.ts";

export async function findRefundById(database: Executor, refundId: string) {
  return await database
    .selectFrom("refunds")
    .selectAll()
    .where("id", "=", refundId)
    .executeTakeFirst();
}

export async function findRefundByGatewayRefundId(
  database: Executor,
  gatewayRefundId: string,
) {
  return await database
    .selectFrom("refunds")
    .selectAll()
    .where("gateway_refund_id", "=", gatewayRefundId)
    .executeTakeFirst();
}

export async function findRefundByIdempotencyKey(
  database: Executor,
  orderId: string,
  idempotencyKey: string,
) {
  return await database
    .selectFrom("refunds")
    .selectAll()
    .where("order_id", "=", orderId)
    .where("idempotency_key", "=", idempotencyKey)
    .executeTakeFirst();
}

export async function listRefundsByOrderId(
  database: Executor,
  orderId: string,
) {
  return await database
    .selectFrom("refunds")
    .selectAll()
    .where("order_id", "=", orderId)
    .orderBy("created_at", "desc")
    .execute();
}

export async function insertRefund(
  database: Executor,
  values: {
    id: string;
    order_id: string;
    order_item_id?: string | null;
    payment_id: string;
    gateway_refund_id?: string | null;
    amount: number;
    currency: string;
    reason?: string | null;
    status: RefundStatus;
    created_by?: string | null;
    idempotency_key?: string | null;
    preserve_access?: boolean;
    created_at?: Date;
    updated_at?: Date;
  },
) {
  return await database
    .insertInto("refunds")
    .values(values)
    .returningAll()
    .executeTakeFirstOrThrow();
}

export async function updateRefundStatus(
  database: Executor,
  refundId: string,
  updates: {
    gateway_refund_id?: string | null;
    status: RefundStatus;
    // Pass `null` to release the key so a failed attempt can be retried
    // under the same key.
    idempotency_key?: string | null;
    updated_at?: Date;
  },
) {
  return await database
    .updateTable("refunds")
    .set(updates)
    .where("id", "=", refundId)
    .returningAll()
    .executeTakeFirst();
}

/**
 * Records the gateway's answer on a reservation, but only while it is still
 * unconfirmed (`pending` with no gateway refund id). Returns nothing when
 * another request already finalized it, so a repeat can skip side effects
 * that must happen once.
 */
export async function finalizePendingRefund(
  database: Executor,
  refundId: string,
  updates: {
    gateway_refund_id: string;
    status: RefundStatus;
    updated_at?: Date;
  },
) {
  return await database
    .updateTable("refunds")
    .set(updates)
    .where("id", "=", refundId)
    .where("status", "=", "pending")
    .where("gateway_refund_id", "is", null)
    .returningAll()
    .executeTakeFirst();
}

/**
 * Gives up a reservation the gateway will not take, but only while it is
 * still unconfirmed (`pending` with no gateway refund id). Another path may
 * have completed it in the meantime (the gateway's refund event for money
 * staff returned from the dashboard); that row is left as it is, and
 * nothing is returned.
 */
export async function failUnsentRefund(
  database: Executor,
  refundId: string,
  now: Date,
) {
  return await database
    .updateTable("refunds")
    .set({ status: "failed", updated_at: now })
    .where("id", "=", refundId)
    .where("status", "=", "pending")
    .where("gateway_refund_id", "is", null)
    .returning("id")
    .executeTakeFirst();
}

/**
 * Idempotently records a refund confirmed by the gateway.
 * If a refund record with this gateway_refund_id already exists, updates its status.
 * If not, inserts a new record. Returns the upserted row.
 */
export async function upsertRefundByGatewayRefundId(
  database: Executor,
  values: {
    id: string;
    order_id: string;
    order_item_id?: string | null;
    payment_id: string;
    gateway_refund_id: string;
    amount: number;
    currency: string;
    reason?: string | null;
    status: RefundStatus;
    updated_at?: Date;
  },
) {
  return await database
    .insertInto("refunds")
    .values(values)
    .onConflict((oc) =>
      oc.column("gateway_refund_id").doUpdateSet({
        status: values.status,
        updated_at: values.updated_at ?? new Date(),
      }),
    )
    .returningAll()
    .executeTakeFirstOrThrow();
}

/**
 * Sums every OTHER refund for an order that counts toward "how much has
 * already been refunded" — `status IN ('processed', 'pending')` — so a
 * caller can compare `thisRefundAmount + sumOtherCountedRefunds(...)`
 * against the payment total to decide full vs. partial. `exclude` lets a
 * caller that already has its own row (or is about to insert/upsert one)
 * avoid double-counting itself, by `id` and/or `gateway_refund_id`.
 *
 * Single shared implementation of a cumulative-refund-total check that used
 * to be reimplemented independently in 3 places (refund.service.ts,
 * fulfillment/payment.worker.ts, fulfillment/refund-reconciliation.worker.ts)
 * with 3 different — and in one case incomplete — filter predicates.
 * refund-reconciliation.worker.ts's old inline version didn't count other
 * `pending` refunds toward the total at all, only `processed` ones, which
 * could under-count the true refunded total whenever more than one refund
 * for the same order was in flight at once — a future correctness fix
 * applied to one copy silently not reaching the other two is exactly the
 * failure mode this consolidation removes.
 *
 * A refund of an extra payment (payments/extra-payment.ts) is not counted:
 * that money was never part of what the order was paid with, so sending it
 * back takes nothing from what the order can still be refunded.
 */
export async function sumOtherCountedRefunds(
  database: Executor,
  orderId: string,
  exclude?: { refundId?: string; gatewayRefundId?: string | null },
): Promise<number> {
  const existingRefunds = await database
    .selectFrom("refunds as r")
    .select(["r.id", "r.gateway_refund_id", "r.amount", "r.status"])
    .where("r.order_id", "=", orderId)
    .where((eb) =>
      eb.not(
        eb.exists(
          eb
            .selectFrom("payments as p")
            .select("p.id")
            .whereRef("p.id", "=", "r.payment_id")
            .where("p.error_code", "=", SURPLUS_CAPTURE_ERROR_CODE),
        ),
      ),
    )
    .execute();
  return existingRefunds
    .filter((r) => {
      if (exclude?.refundId && r.id === exclude.refundId) return false;
      if (
        exclude?.gatewayRefundId &&
        r.gateway_refund_id === exclude.gatewayRefundId
      )
        return false;
      return r.status === "processed" || r.status === "pending";
    })
    .reduce((sum, r) => sum + r.amount, 0);
}

/**
 * Gives a gateway refund id to the admin's unconfirmed reservation for the
 * same refund, if there is one.
 *
 * The admin path reserves a `pending` row, calls the gateway, then writes
 * the gateway id onto that row. A webhook that arrives in between — or after
 * that last write failed — knows the refund only by its gateway id and
 * could not see the reservation: it inserted a second row for the same
 * refund, the reservation was counted as a separate refund (turning a
 * partial refund into a "full" one), and the admin's preserve-access choice
 * on the reservation was lost. Matching on payment and amount lets the
 * webhook continue the reservation instead.
 */
export async function adoptUnconfirmedReservation(
  database: Executor,
  input: {
    paymentId: string;
    amount: number;
    gatewayRefundId: string;
    now: Date;
  },
) {
  return await database
    .updateTable("refunds")
    .set({ gateway_refund_id: input.gatewayRefundId, updated_at: input.now })
    .where("id", "=", (eb) =>
      eb
        .selectFrom("refunds")
        .select("id")
        .where("payment_id", "=", input.paymentId)
        .where("status", "=", "pending")
        .where("gateway_refund_id", "is", null)
        .where("amount", "=", input.amount)
        .orderBy("created_at", "asc")
        .limit(1),
    )
    .where("gateway_refund_id", "is", null)
    .returningAll()
    .executeTakeFirst();
}

/**
 * Releases reservations that never got a gateway refund id and never will:
 * the gateway call's outcome was lost and no webhook claimed the row. Left
 * alone they stay `pending` forever and permanently reduce what can still be
 * refunded on the order. Clearing the key lets the same request start over.
 */
export async function failStrandedReservations(
  database: Executor,
  olderThanHours: number,
  limit = 100,
) {
  const cutoff = new Date(Date.now() - olderThanHours * 60 * 60 * 1000);
  return await database
    .updateTable("refunds")
    .set({ status: "failed", idempotency_key: null, updated_at: new Date() })
    .where("id", "in", (eb) =>
      eb
        .selectFrom("refunds")
        .select("id")
        .where("status", "=", "pending")
        .where("gateway_refund_id", "is", null)
        .where("created_at", "<", cutoff)
        .orderBy("created_at", "asc")
        .limit(limit),
    )
    .where("status", "=", "pending")
    .where("gateway_refund_id", "is", null)
    .returning(["id", "order_id", "amount", "currency", "created_at"])
    .execute();
}

export async function listStaleRefunds(
  database: Executor,
  olderThanMinutes: number,
  // Bounds how much work one scheduler tick can take on — without this a
  // backlog of N stale refunds (gateway outage, traffic spike) makes a
  // single tick's cost scale with N instead of a fixed batch size.
  limit = 100,
) {
  const cutoff = new Date(Date.now() - olderThanMinutes * 60 * 1000);
  return await database
    .selectFrom("refunds")
    .innerJoin("payments", "payments.id", "refunds.payment_id")
    .selectAll("refunds")
    // The gateway the refund was made through is the payment's.
    .select("payments.gateway_provider")
    .where("refunds.status", "=", "pending")
    .where("refunds.gateway_refund_id", "is not", null)
    .where("refunds.created_at", "<", cutoff)
    .orderBy("refunds.created_at", "asc")
    .limit(limit)
    .execute();
}

/**
 * The automatic refund reserved for an extra payment, if there is one. A
 * payment has at most one: the row carries autoRefundKey(paymentId), which
 * is unique within its order.
 */
export async function findAutoRefundForPayment(
  database: Executor,
  paymentId: string,
) {
  return await database
    .selectFrom("refunds")
    .selectAll()
    .where("payment_id", "=", paymentId)
    .where("idempotency_key", "=", autoRefundKey(paymentId))
    .executeTakeFirst();
}

/**
 * Automatic refunds reserved, not yet accepted by the gateway, and due for
 * an attempt now, the one tried longest ago first.
 *
 * Only rows the pass will act on are returned, so none can hold a place at
 * the head of the list and keep newer ones waiting:
 *
 *  - due: never tried, or the wait since the last attempt is over. The
 *    same rule as extra-payment.ts's autoRefundAttemptDue, on the same two
 *    columns (`updated_at` equal to `created_at` means never tried). Every
 *    attempt moves `updated_at` on, which puts the row at the back;
 *  - whose payment is still an extra payment of this gateway with the
 *    money to return (`captured`), or has had it returned another way
 *    (`refunded`), which the pass answers by giving the reservation up.
 *    A reservation whose payment is anything else is never sent.
 */
export async function listDueAutoRefunds(
  database: Executor,
  input: { now: Date; gatewayProviders: readonly string[]; limit?: number },
) {
  const minWaitSeconds = AUTO_REFUND_RETRY_MIN_MS / 1000;
  return await database
    .selectFrom("refunds as r")
    .innerJoin("payments as p", "p.id", "r.payment_id")
    .selectAll("r")
    .where("r.status", "=", "pending")
    .where("r.gateway_refund_id", "is", null)
    .where("r.idempotency_key", "like", `${autoRefundKey("")}%`)
    .where("p.error_code", "=", SURPLUS_CAPTURE_ERROR_CODE)
    .where("p.status", "in", ["captured", "refunded"])
    .where("p.gateway_provider", "in", [...input.gatewayProviders])
    .where("p.gateway_payment_id", "is not", null)
    .where(
      sql<boolean>`(
        r.updated_at <= r.created_at
        or ${input.now}::timestamptz - r.updated_at
          >= greatest(make_interval(secs => ${minWaitSeconds}::double precision), r.updated_at - r.created_at)
      )`,
    )
    .orderBy("r.updated_at", "asc")
    .orderBy("r.id", "asc")
    .limit(input.limit ?? 100)
    .execute();
}

/**
 * Takes the next attempt to send an automatic refund, by moving its
 * `updated_at` on from the value the caller read. Of two callers that read
 * the same row, one gets it and the other gets nothing, so the gateway is
 * asked once per attempt.
 */
export async function claimAutoRefundAttempt(
  database: Executor,
  refundId: string,
  lastTouchedAt: Date,
  now: Date,
) {
  return await database
    .updateTable("refunds")
    .set({ updated_at: now })
    .where("id", "=", refundId)
    .where("status", "=", "pending")
    .where("gateway_refund_id", "is", null)
    .where(
      sql<boolean>`date_trunc('milliseconds', updated_at) = date_trunc('milliseconds', ${lastTouchedAt}::timestamptz)`,
    )
    .returning("id")
    .executeTakeFirst();
}

/** The credit note a completed refund is recorded with (FR-PAY-009). */
export async function insertCreditNote(
  database: Executor,
  values: {
    id: string;
    credit_note_number: string;
    refund_id: string;
    order_id: string;
    user_id: string;
    total_refund_amount: number;
    created_at: Date;
  },
) {
  await database
    .insertInto("credit_notes")
    .values({ ...values, tax_adjustment_amount: 0 })
    .execute();
}
