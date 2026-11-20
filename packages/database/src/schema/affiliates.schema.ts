import type { ColumnType, Generated, JSONColumnType } from "kysely";
import type {
  AffiliateAttributionSource,
  AffiliateCommissionFlag,
  AffiliateCommissionKind,
  AffiliateCommissionStatus,
  AffiliatePayoutMethod,
  AffiliatePayoutStatus,
  AffiliateRateType,
  AffiliateRuleTargetType,
  AffiliateStatus,
} from "@veolms/contracts";

/**
 * The affiliate program (migration 20261121100000-create-affiliates.ts).
 * Money columns are bigint minor units; the client parses bigint to a
 * JavaScript number.
 */

/** One person in the program: an applicant, an invitee or an affiliate. */
export interface AffiliateTable {
  id: Generated<string>;
  /** Empty only for an invitation not yet accepted. */
  user_id: string | null;
  /** Lower case; set for invitations. */
  invited_email: string | null;
  /** Lower case; never changes after approval. */
  code: string;
  status: Generated<AffiliateStatus>;
  application_note: string | null;
  terms_accepted_at: Date | null;
  /** The personal coupon, when the program gives buyers a discount. */
  coupon_id: string | null;
  payout_method: AffiliatePayoutMethod | null;
  /** UPI id, or holder + account number + IFSC, as encrypted JSON. */
  payout_details_encrypted: string | null;
  /** Masked, for display: "r••••@okhdfc", "A/c ••••1234". */
  payout_details_hint: string | null;
  pan_encrypted: string | null;
  pan_last4: string | null;
  notify_on_commission: Generated<boolean>;
  status_reason: string | null;
  decided_by: string | null;
  decided_at: Date | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

/** A rate. Never edited: a change archives this row and adds another. */
export interface AffiliateCommissionRuleTable {
  id: Generated<string>;
  /** Null: every affiliate. */
  affiliate_id: string | null;
  /** Null (with target_id): every product. */
  target_type: AffiliateRuleTargetType | null;
  target_id: string | null;
  rate_type: AffiliateRateType;
  /** Percent in basis points (2000 = 20%); fixed in minor units. */
  rate_value: number;
  /** Required for a fixed rule. */
  currency: string | null;
  archived_at: Date | null;
  created_by: string | null;
  created_at: Generated<Date>;
}

/** A visit through an affiliate's link. Its id is the cookie's value. */
export interface AffiliateClickTable {
  id: Generated<string>;
  affiliate_id: string;
  user_id: string | null;
  landing_path: string;
  referrer_host: string | null;
  /** HMAC-SHA256 of the visitor's address. */
  ip_hash: string;
  user_agent: Generated<string>;
  created_at: Generated<Date>;
  expires_at: Date;
}

/** The last click tied to a signed-in buyer (cross-device credit). */
export interface AffiliateReferralTable {
  user_id: string;
  affiliate_id: string;
  click_id: string;
  expires_at: Date;
  updated_at: Generated<Date>;
}

/** Who gets credit for an order, decided once when the order is made. */
export interface AffiliateOrderAttributionTable {
  order_id: string;
  affiliate_id: string;
  source: AffiliateAttributionSource;
  click_id: string | null;
  coupon_id: string | null;
  created_at: Generated<Date>;
  changed_by: string | null;
  changed_at: Date | null;
}

/**
 * The ledger. Amounts and what they were worked out from never change (a
 * database trigger refuses it, and refuses deletes); only the state moves.
 */
export interface AffiliateCommissionTable {
  id: Generated<string>;
  affiliate_id: string;
  kind: AffiliateCommissionKind;
  status: Generated<AffiliateCommissionStatus>;
  order_id: string | null;
  order_item_id: string | null;
  refund_id: string | null;
  /** The sale a reversal belongs to. */
  parent_id: string | null;
  /** The order's currency. */
  currency: string;
  base_amount: Generated<number>;
  rule_id: string | null;
  rate_type: AffiliateRateType | null;
  rate_value: number | null;
  /** In the order's currency; negative for reversals. */
  amount: number;
  /** The academy's currency. */
  payout_currency: string;
  /** Equal to amount when the currencies match; filled at approval otherwise. */
  payout_amount: number | null;
  /** paid_at + the program's hold days. */
  available_at: Date;
  approved_at: Date | null;
  flags: ColumnType<
    AffiliateCommissionFlag[],
    AffiliateCommissionFlag[] | undefined,
    AffiliateCommissionFlag[]
  >;
  payout_id: string | null;
  paid_at: Date | null;
  note: string | null;
  created_by: string | null;
  created_at: Generated<Date>;
}

export interface AffiliatePayoutTable {
  id: Generated<string>;
  affiliate_id: string;
  status: Generated<AffiliatePayoutStatus>;
  currency: string;
  gross_amount: number;
  tds_amount: Generated<number>;
  net_amount: number;
  payout_method: AffiliatePayoutMethod;
  payout_details_encrypted: string;
  payout_details_hint: string | null;
  requested_by: "affiliate" | "admin";
  /** The affiliate's Idempotency-Key: a repeat returns this payout. */
  idempotency_key: string | null;
  /** UTR or UPI reference; required to mark paid. */
  reference: string | null;
  paid_on: ColumnType<string | null, string | null, string | null>;
  reason: string | null;
  note: string | null;
  decided_by: string | null;
  decided_at: Date | null;
  created_at: Generated<Date>;
}

export interface AffiliateAuditLogTable {
  id: Generated<string>;
  actor_user_id: string | null;
  action: string;
  subject_type: string;
  subject_id: string;
  /** Before and after; never PAN, bank or UPI details. */
  data: JSONColumnType<Record<string, unknown>>;
  created_at: Generated<Date>;
}
