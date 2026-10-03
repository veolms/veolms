import type { PaymentStatus } from "@veolms/database";
import type { Payment, PaymentMethodDetails, PaymentProvider } from "@veolms/contracts";

/**
 * Minimal shape needed to map a persisted payment row to the `Payment` API
 * contract. Deliberately structural (not tied to Kysely's
 * `Selectable<PaymentTable>`) so it accepts both real DB rows and any
 * hand-built object with the same fields.
 */
export interface PaymentRowLike {
  id: string;
  order_id: string;
  gateway_provider: string;
  gateway_order_id: string;
  gateway_payment_id: string | null;
  amount: number;
  currency: string;
  status: PaymentStatus;
  payment_method: unknown;
  error_code: string | null;
  error_description: string | null;
  created_at: Date;
  updated_at: Date;
}

/**
 * `gateway_provider` is stored as unconstrained `text` in the DB — unlike
 * `orders_status_valid`, there's no check constraint narrowing it to the
 * contract's `PaymentProvider` enum, so this cast (unlike status/itemType
 * below) can't be eliminated by aligning the two types. Every write path in
 * this codebase only ever writes a `PaymentGateway.providerName` value
 * (already typed `PaymentProvider`) or the literal `"free"`, so the
 * narrowing holds in practice even though the schema can't enforce it.
 */
export function toPaymentProvider(value: string): PaymentProvider {
  return value as PaymentProvider;
}

export function toPaymentContract(row: PaymentRowLike): Payment {
  return {
    id: row.id,
    orderId: row.order_id,
    gatewayProvider: toPaymentProvider(row.gateway_provider),
    gatewayOrderId: row.gateway_order_id,
    gatewayPaymentId: row.gateway_payment_id,
    amount: row.amount,
    currency: row.currency,
    // PaymentStatus is the same literal union on both the DB
    // (@veolms/database) and contract (@veolms/contracts) side, so this is a
    // plain assignment — no cast. A drift here fails to typecheck instead of
    // silently passing through `as any`.
    status: row.status,
    // DB stores payment_method as untyped jsonb with no schema validation at
    // insert time, so — like gateway_provider — this can't be verified
    // structurally either.
    paymentMethod: row.payment_method as PaymentMethodDetails | null,
    errorCode: row.error_code,
    errorDescription: row.error_description,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
