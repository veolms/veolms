export type OrderHistoryStatus =
  "completed" | "processing" | "refunded" | "failed" | "canceled";

export interface OrderHistoryPayment {
  type: "visa" | "mastercard" | "upi" | "paypal" | "other";
  /** How it was paid, e.g. "UPI · name@bank". Empty when there is no more to say. */
  label: string;
  /** Who took the payment, or a plain statement when nobody did. */
  brand: string;
}

/** The payment on one line: "Razorpay (UPI · name@bank)", or just the brand. */
export function formatOrderHistoryPayment(
  payment: OrderHistoryPayment,
): string {
  return payment.label ? `${payment.brand} (${payment.label})` : payment.brand;
}

export interface OrderHistoryItem {
  id: string;
  orderNumber: string; // e.g. "#ORD-240524-1001"
  /**
   * The number on the invoice the server issues for this order. Null until
   * the order is paid: an unpaid order has no invoice.
   */
  invoiceNumber: string | null;
  courseId: string;
  courseTitle: string;
  itemCount: string; // e.g. "1 Course"
  iconColor: string; // e.g. "#3b82f6"
  date: string; // e.g. "May 24, 2025"
  time: string; // e.g. "10:30 AM"
  payment: OrderHistoryPayment;
  amount: number; // major units of the order's currency
  formattedAmount: string; // e.g. "$49.00"
  status: OrderHistoryStatus;
  statusLabel: string;
  subtotal: number;
  /** What a coupon took off the subtotal; 0 when nothing was. */
  discount?: number;
  tax: number;
  /** ISO 4217 code of the order; defaults to INR when absent. */
  currency?: string;
  /**
   * The payment provider's reference for the payment, when the API gives
   * one. It does not for a learner's own orders, so it is null there and
   * nothing is shown in its place.
   */
  transactionId: string | null;
}

export type OrderHistoryTabId =
  "all" | "completed" | "processing" | "refunded" | "failed" | "canceled";
