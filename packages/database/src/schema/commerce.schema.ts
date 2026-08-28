import type { Generated } from "kysely";

export type BundleStatus = "draft" | "published" | "archived";
export type CartItemType = "course" | "bundle";
export type OrderItemType = "course" | "bundle";
export type CouponDiscountType = "percentage" | "fixed";
export type OrderStatus =
  | "pending"
  | "payment_processing"
  | "paid"
  | "payment_failed"
  | "cancelled"
  | "expired"
  | "partially_refunded"
  | "refunded";
export type PaymentStatus =
  | "initiated"
  | "processing"
  | "captured"
  | "failed"
  | "refunded";
export type PaymentAttemptStatus =
  | "initiated"
  | "processing"
  | "captured"
  | "failed";
export type RefundStatus = "pending" | "processed" | "failed";
export type EnrollmentStatus = "active" | "suspended" | "revoked" | "expired";
export type EnrollmentSource =
  | "direct_purchase"
  | "bundle_purchase"
  | "free_grant"
  | "admin_grant";

export interface CourseBundleTable {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  thumbnail_media_id: string | null;
  status: BundleStatus;
  price: number;
  currency: string;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
  deleted_at: Date | null;
}

export interface CourseBundleItemTable {
  id: string;
  bundle_id: string;
  course_id: string;
  created_at: Generated<Date>;
}

export interface CartTable {
  id: string;
  user_id: string;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface CartItemTable {
  id: string;
  cart_id: string;
  item_type: CartItemType;
  course_id: string | null;
  bundle_id: string | null;
  created_at: Generated<Date>;
}

export interface CouponTable {
  id: string;
  code: string;
  description: string | null;
  discount_type: CouponDiscountType;
  discount_value: number;
  max_discount_amount: number | null;
  min_order_amount: Generated<number>;
  starts_at: Date;
  expires_at: Date;
  global_usage_limit: number | null;
  per_user_limit: Generated<number>;
  is_active: Generated<boolean>;
  restricted_course_ids: string[] | null;
  restricted_bundle_ids: string[] | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface CouponRedemptionTable {
  id: string;
  coupon_id: string;
  user_id: string;
  order_id: string;
  discount_amount: number;
  created_at: Generated<Date>;
}

export interface OrderTable {
  id: string;
  order_number: string;
  user_id: string;
  status: OrderStatus;
  currency: string;
  subtotal_amount: number;
  discount_amount: Generated<number>;
  tax_amount: Generated<number>;
  total_amount: number;
  coupon_id: string | null;
  idempotency_key: string | null;
  expires_at: Date;
  paid_at: Date | null;
  gstin: string | null;
  cgst_amount: Generated<number>;
  sgst_amount: Generated<number>;
  igst_amount: Generated<number>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface OrderItemTable {
  id: string;
  order_id: string;
  item_type: OrderItemType;
  course_id: string | null;
  bundle_id: string | null;
  title_snapshot: string;
  unit_price: number;
  discount_amount: Generated<number>;
  tax_amount: Generated<number>;
  final_amount: number;
  hsn_sac_code: string | null;
  tax_rate_percent: Generated<number>;
  cgst_amount: Generated<number>;
  sgst_amount: Generated<number>;
  igst_amount: Generated<number>;
  created_at: Generated<Date>;
}

export interface PaymentTable {
  id: string;
  order_id: string;
  gateway_provider: string;
  gateway_order_id: string;
  gateway_payment_id: string | null;
  gateway_key_id: string | null;
  amount: number;
  currency: string;
  status: PaymentStatus;
  payment_method: unknown | null;
  error_code: string | null;
  error_description: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface PaymentAttemptTable {
  id: string;
  payment_id: string;
  gateway_payment_id: string | null;
  attempt_number: number;
  status: PaymentAttemptStatus;
  error_code: string | null;
  error_description: string | null;
  raw_payload: unknown | null;
  created_at: Generated<Date>;
}

export interface RefundTable {
  id: string;
  order_id: string;
  payment_id: string;
  gateway_refund_id: string | null;
  amount: number;
  currency: string;
  reason: string | null;
  status: RefundStatus;
  created_by: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface AccessGrantTable {
  id: string;
  user_id: string;
  course_id: string;
  order_id: string | null;
  status: "active" | "suspended" | "revoked" | "expired";
  source: "purchase" | "bundle_purchase" | "free_grant" | "admin_grant";
  valid_from: Generated<Date>;
  valid_until: Date | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface EnrollmentTable {
  id: string;
  user_id: string;
  course_id: string;
  order_id: string | null;
  status: EnrollmentStatus;
  source: EnrollmentSource;
  access_starts_at: Generated<Date>;
  access_expires_at: Date | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface CreatorPaymentConfigTable {
  id: string;
  creator_id: string;
  provider: string;
  encrypted_key_id: string;
  encrypted_key_secret: string;
  encrypted_webhook_secret: string | null;
  is_active: Generated<boolean>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export type RefundRequestStatus = "pending" | "approved" | "rejected" | "cancelled";

export interface RefundRequestTable {
  id: string;
  order_id: string;
  user_id: string;
  reason: string;
  status: Generated<RefundRequestStatus>;
  admin_notes: string | null;
  resolved_at: Date | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export type ManualPaymentStatus = "pending" | "verified" | "rejected";

export interface ManualPaymentRequestTable {
  id: string;
  order_id: string;
  user_id: string;
  payment_method: string;
  transaction_reference: string;
  proof_media_id: string | null;
  status: Generated<ManualPaymentStatus>;
  admin_notes: string | null;
  verified_by: string | null;
  verified_at: Date | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface CreditNoteTable {
  id: string;
  credit_note_number: string;
  refund_id: string;
  order_id: string;
  user_id: string;
  total_refund_amount: number;
  tax_adjustment_amount: Generated<number>;
  created_at: Generated<Date>;
}
