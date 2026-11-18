import type { AdminOrder } from "@veolms/contracts";
import { minorUnitsPerMajor } from "@veolms/contracts";

/**
 * The Orders screen's CSV export: one line per order, in the columns the
 * screen shows. Amounts are major units (₹499.00 as 499.00).
 */

export const ORDERS_CSV_HEADER = [
  "Order ID",
  "Invoice",
  "Date (UTC)",
  "Status",
  "Learner",
  "Email",
  "Course",
  "Currency",
  "Price",
  "Coupon",
  "Discount",
  "Tax",
  "Total",
  "Gateway",
  "Method",
  "Transaction ID",
  "Paid at (UTC)",
  "Failure reason",
];

const STATUS_LABELS: Record<AdminOrder["status"], string> = {
  pending: "Pending",
  payment_processing: "Processing",
  paid: "Success",
  payment_failed: "Failed",
  cancelled: "Cancelled",
  expired: "Expired",
  partially_refunded: "Partially refunded",
  refunded: "Refunded",
};

/**
 * One CSV cell. Quoted when it holds a comma, quote or line break, and
 * prefixed with an apostrophe when a spreadsheet would read it as a formula
 * (a learner's name of "=HYPERLINK(...)" must stay text).
 */
export function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  let text = String(value);
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(text)) {
    text = `'${text}`;
  }
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function isoOrEmpty(value: string | Date | null | undefined): string {
  if (!value) return "";
  return new Date(value).toISOString();
}

export function orderCsvRow(order: AdminOrder): string {
  const money = (minor: number) =>
    (minor / minorUnitsPerMajor(order.currency)).toFixed(2);
  const item = order.items[0];
  const course = item?.display?.courseTitle ?? item?.titleSnapshot ?? "";
  const payment = order.admin.payment;
  return [
    order.orderNumber,
    order.invoiceNumber,
    isoOrEmpty(order.createdAt),
    STATUS_LABELS[order.status],
    order.admin.student.name,
    order.admin.student.email,
    order.items.length > 1
      ? `${course} (+${order.items.length - 1} more)`
      : course,
    order.currency,
    money(order.subtotalAmount),
    order.admin.coupon?.code ?? "",
    money(order.discountAmount),
    money(order.taxAmount),
    money(order.totalAmount),
    payment?.gatewayProvider ?? "",
    payment?.paymentMethod?.method ?? "",
    payment?.gatewayPaymentId ?? "",
    isoOrEmpty(order.paidAt),
    payment?.failureReason ?? "",
  ]
    .map(csvCell)
    .join(",");
}
