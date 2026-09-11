import type { Order } from "@veolms/contracts";
import type {
  OrderItem,
  OrderStatus,
  OrderSummaryMetrics,
  RecentPaymentItem,
} from "./ordersData";
import type {
  OrderHistoryItem,
  OrderHistoryStatus,
} from "../order-history/orderHistoryData";

/**
 * Adapts an API Order to the frontend OrderItem model consumed by OrdersPage.
 */
export function adaptOrderToOrderItem(order: Order): OrderItem {
  const firstItem = order.items?.[0];
  const courseTitle =
    firstItem?.titleSnapshot ||
    (order.items && order.items.length > 1
      ? `${order.items[0]?.titleSnapshot} + ${order.items.length - 1} more`
      : "Course Order");
  const courseId = firstItem?.courseId || firstItem?.bundleId || order.id;

  let badgeText = "TS";
  let badgeColor = "#2563eb";
  let badgeTextColor = "#ffffff";
  const titleLower = courseTitle.toLowerCase();
  if (titleLower.includes("typescript")) {
    badgeText = "TS";
    badgeColor = "#2563eb";
  } else if (titleLower.includes("javascript")) {
    badgeText = "JS";
    badgeColor = "#eab308";
    badgeTextColor = "#000000";
  } else if (titleLower.includes("node") || titleLower.includes("backend")) {
    badgeText = "node";
    badgeColor = "#1e293b";
    badgeTextColor = "#4ade80";
  } else if (
    titleLower.includes("ui") ||
    titleLower.includes("ux") ||
    titleLower.includes("design")
  ) {
    badgeText = "UI";
    badgeColor = "#8b5cf6";
  } else if (
    titleLower.includes("postgres") ||
    titleLower.includes("sql") ||
    titleLower.includes("database")
  ) {
    badgeText = "PG";
    badgeColor = "#0284c7";
  } else if (titleLower.includes("react")) {
    badgeText = "react";
    badgeColor = "#06b6d4";
  } else if (titleLower.includes("graphql")) {
    badgeText = "GQL";
    badgeColor = "#ec4899";
  } else if (titleLower.includes("aws") || titleLower.includes("cloud")) {
    badgeText = "AWS";
    badgeColor = "#f59e0b";
  } else {
    badgeText = courseTitle.slice(0, 2).toUpperCase();
    badgeColor = "#3b82f6";
  }

  let status: OrderStatus = "pending";
  let statusLabel = "Pending";
  if (order.status === "paid") {
    status = "completed";
    statusLabel = "Completed";
  } else if (
    order.status === "pending" ||
    order.status === "payment_processing"
  ) {
    status = "pending";
    statusLabel =
      order.status === "payment_processing" ? "Processing" : "Pending";
  } else if (
    order.status === "payment_failed" ||
    order.status === "expired" ||
    order.status === "cancelled"
  ) {
    status = "failed";
    statusLabel = order.status === "cancelled" ? "Cancelled" : "Failed";
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

  const price = Math.round(order.totalAmount / 100);
  const subtotal = Math.round(order.subtotalAmount / 100);
  const tax = Math.round(order.taxAmount / 100);
  const currency = order.currency || "INR";
  const formattedPrice = new Intl.NumberFormat(
    currency === "INR" ? "en-IN" : "en-US",
    {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    },
  ).format(price);

  const cleanOrderNumber = order.orderNumber.startsWith("#")
    ? order.orderNumber
    : `#${order.orderNumber}`;
  const invoiceNumber = `INV-${
    order.orderNumber.replace(/^[#A-Za-z_-]+/, "") || order.id.slice(0, 8)
  }`;
  const transactionId =
    order.idempotencyKey || `TXN_${order.id.replace(/-/g, "").slice(0, 10)}`;

  return {
    id: order.id,
    orderNumber: cleanOrderNumber,
    courseId,
    courseTitle,
    badgeText,
    badgeColor,
    badgeTextColor,
    date,
    paymentMethod: "Credit Card / UPI",
    price,
    formattedPrice,
    status,
    statusLabel,
    invoiceNumber,
    transactionId,
    tax,
    subtotal,
  };
}

/**
 * Adapts an API Order to the frontend OrderHistoryItem model consumed by OrderHistoryPage.
 */
export function adaptOrderToOrderHistoryItem(order: Order): OrderHistoryItem {
  const firstItem = order.items?.[0];
  const courseTitle =
    firstItem?.titleSnapshot ||
    (order.items && order.items.length > 1
      ? `${order.items[0]?.titleSnapshot} + ${order.items.length - 1} more`
      : "Course Order");
  const courseId = firstItem?.courseId || firstItem?.bundleId || order.id;

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
    order.status === "expired"
  ) {
    status = "failed";
    statusLabel = "Failed";
  } else if (order.status === "cancelled") {
    status = "canceled";
    statusLabel = "Canceled";
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

  const amount = order.totalAmount / 100;
  const subtotal = order.subtotalAmount / 100;
  const tax = order.taxAmount / 100;
  const currency = order.currency || "INR";
  const formattedAmount = new Intl.NumberFormat(
    currency === "INR" ? "en-IN" : "en-US",
    {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    },
  ).format(amount);

  const cleanOrderNumber = order.orderNumber.startsWith("#")
    ? order.orderNumber
    : `#${order.orderNumber}`;
  const invoiceNumber = `INV-${
    order.orderNumber.replace(/^[#A-Za-z_-]+/, "") || order.id.slice(0, 8)
  }`;
  const transactionId =
    order.idempotencyKey || `TXN_${order.id.replace(/-/g, "").slice(0, 10)}`;

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
    order.items && order.items.length > 1
      ? `${order.items.length} Courses`
      : "1 Course";

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
      type: "visa",
      brand: "Visa",
      label: "•••• 4242",
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

  const formattedTotal = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(totalSpentAmount);

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
