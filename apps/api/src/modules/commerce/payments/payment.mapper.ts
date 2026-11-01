import type {
  LearnerManualPaymentRequest,
  ManualPaymentRequest,
  PaymentProvider,
} from "@veolms/contracts";
import type { Database } from "@veolms/database";
import type { Selectable } from "kysely";

type ManualPaymentRequestRow = Selectable<Database["manual_payment_requests"]>;

/** A manual payment as staff reviewing it see it. */
export function toManualPaymentContract(
  r: ManualPaymentRequestRow,
): ManualPaymentRequest {
  return {
    id: r.id,
    orderId: r.order_id,
    userId: r.user_id,
    paymentMethod: r.payment_method,
    transactionReference: r.transaction_reference,
    proofMediaId: r.proof_media_id,
    status: r.status,
    adminNotes: r.admin_notes,
    verifiedBy: r.verified_by,
    verifiedAt: r.verified_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/**
 * A manual payment as the learner who submitted it sees it: no reviewer
 * identity and no internal review notes.
 */
export function toLearnerManualPayment(
  r: ManualPaymentRequestRow,
): LearnerManualPaymentRequest {
  return {
    id: r.id,
    orderId: r.order_id,
    paymentMethod: r.payment_method,
    transactionReference: r.transaction_reference,
    proofMediaId: r.proof_media_id,
    status: r.status,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/**
 * `gateway_provider` is stored as unconstrained `text` in the DB — unlike
 * `orders_status_valid`, there's no check constraint narrowing it to the
 * contract's `PaymentProvider` enum, so this cast can't be eliminated by
 * aligning the two types. Every write path in this codebase only ever writes
 * a `PaymentGateway.providerName` value (already typed `PaymentProvider`) or
 * the literals `"free"` / `"manual"`, so the narrowing holds in practice even
 * though the schema can't enforce it.
 */
export function toPaymentProvider(value: string): PaymentProvider {
  return value as PaymentProvider;
}
