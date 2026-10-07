import type { LearnerOrder } from "@veolms/contracts";
import { formatMoney, toMajorUnits } from "@veolms/contracts/commerce/money";
import type {
  OrderItem,
  OrderSummaryMetrics,
  RecentPaymentItem,
} from "./ordersData";
import type {
  OrderHistoryItem,
  OrderHistoryStatus,
} from "../order-history/orderHistoryData";

/**
 * Adapts an API order to the frontend OrderHistoryItem model consumed by OrderHistoryPage.
 */
export function adaptOrderToOrderHistoryItem(
  order: LearnerOrder,
): OrderHistoryItem {
  const firstItem = order.items[0];
  const courseTitle =
    firstItem?.titleSnapshot ||
    (order.items.length > 1
      ? `${order.items[0]?.titleSnapshot} + ${order.items.length - 1} more`
      : "Course Order");
  const courseId = firstItem?.courseId || "";

  let status: OrderHistoryStatus = "processing";
  let statusLabel = "Processing";
  if (order.status === "paid") {
    status = "completed";
    statusLabel = "Completed";
  } else if (
    order.status === "pending" ||
    order.status === "payment_processing"
  ) {
    status = "processing";
    statusLabel = "Processing";
  } else if (
    order.status === "payment_failed" ||
    order.status === "expired" ||
    order.status === "cancelled"
  ) {
    status = "failed";
    statusLabel = "Failed";
  } else if (
    order.status === "refunded" ||
    order.status === "partially_refunded"
  ) {
    status = "refunded";
    statusLabel = "Refunded";
  }

  const dateObj = order.createdAt ? new Date(order.createdAt) : new Date();
  const date = dateObj.toLocaleDateString("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  });
  const time = dateObj.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });

  const currency = order.currency || "INR";
  const amount = toMajorUnits(order.totalAmount, currency);
  const subtotal = toMajorUnits(order.subtotalAmount, currency);
  const tax = toMajorUnits(order.taxAmount, currency);
  const formattedAmount = formatMoney(order.totalAmount, { currency });

  const cleanOrderNumber = order.orderNumber.startsWith("#")
    ? order.orderNumber
    : `#${order.orderNumber}`;
  const invoiceNumber = `INV-${
    order.orderNumber.replace(/^[#A-Za-z_-]+/, "") || order.id.slice(0, 8)
  }`;
  const transactionId = `TXN_${order.id.replace(/-/g, "").slice(0, 10)}`;

  let iconColor = "#3b82f6";
  const titleLower = courseTitle.toLowerCase();
  if (titleLower.includes("typescript")) iconColor = "#3b82f6";
  else if (titleLower.includes("node") || titleLower.includes("backend"))
    iconColor = "#f59e0b";
  else if (titleLower.includes("python") || titleLower.includes("next"))
    iconColor = "#10b981";
  else if (titleLower.includes("react") || titleLower.includes("graphql"))
    iconColor = "#8b5cf6";
  else if (titleLower.includes("ui") || titleLower.includes("ux"))
    iconColor = "#ef4444";
  else if (titleLower.includes("javascript")) iconColor = "#f97316";

  const itemCount =
    order.items.length > 1 ? `${order.items.length} Courses` : "1 Course";

  const paymentMethod = order.paymentSummary?.method.toLowerCase() ?? "";
  const paymentType = paymentMethod.includes("upi")
    ? "upi"
    : paymentMethod.includes("visa")
      ? "visa"
      : paymentMethod.includes("mastercard")
        ? "mastercard"
        : paymentMethod.includes("paypal")
          ? "paypal"
          : "other";

  return {
    id: order.id,
    orderNumber: cleanOrderNumber,
    invoiceNumber,
    courseId,
    courseTitle,
    itemCount,
    iconColor,
    date,
    time,
    payment: {
      type: paymentType,
      brand: order.paymentSummary?.provider || "Payment",
      label:
        [order.paymentSummary?.method, order.paymentSummary?.detail]
          .filter(Boolean)
          .join(" · ") || "Payment method unavailable",
    },
    amount,
    formattedAmount,
    status,
    statusLabel,
    subtotal,
    tax,
    transactionId,
  };
}

/**
 * Computes live order summary metrics from order items.
 */
export function computeOrderSummary(
  orders: readonly OrderItem[],
): OrderSummaryMetrics {
  let completed = 0;
  let pending = 0;
  let failed = 0;
  let refunded = 0;
  let totalSpentAmount = 0;

  for (const o of orders) {
    if (o.status === "completed") {
      completed += 1;
      totalSpentAmount += o.price;
    } else if (o.status === "pending") {
      pending += 1;
    } else if (o.status === "failed") {
      failed += 1;
    } else if (o.status === "refunded") {
      refunded += 1;
    }
  }

  // `price` on the view model is already in major units.
  const formattedTotal = formatMoney(totalSpentAmount, { unit: "major" });

  return {
    totalOrders: orders.length,
    completed,
    pending,
    failed,
    refunded,
    totalSpent: formattedTotal,
    totalSpentAmount,
  };
}

/**
 * Extracts recent payment entries for the widget from order items.
 */
export function extractRecentPayments(
  orders: readonly OrderItem[],
): RecentPaymentItem[] {
  return orders.slice(0, 4).map((o) => ({
    id: o.id,
    courseTitle: o.courseTitle,
    badgeText: o.badgeText,
    badgeColor: o.badgeColor,
    badgeTextColor: o.badgeTextColor,
    date: o.date,
    status: o.status,
    statusLabel: o.statusLabel,
    formattedPrice: o.formattedPrice,
  }));
}
