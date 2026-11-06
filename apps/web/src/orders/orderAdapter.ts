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
import { orderItemLabel } from "./orderHelpers";

/**
 * Adapts an API order to the frontend OrderHistoryItem model consumed by OrderHistoryPage.
 */
export function adaptOrderToOrderHistoryItem(
  order: LearnerOrder,
): OrderHistoryItem {
  const firstItem = order.items[0];
  // Part of a course is named by the course, with a note saying so.
  const firstLabel = firstItem ? orderItemLabel(firstItem) : null;
  const courseTitle =
    firstLabel?.title ||
    (order.items.length > 1
      ? `${order.items[0]?.titleSnapshot} + ${order.items.length - 1} more`
      : "Course Order");
  // An unlisted course (part of another course, sold on its own) has no
  // page: the course it unlocks is the one to view.
  const courseId = firstItem?.opensCourseId || firstItem?.courseId || "";

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
  // In the reader's own date and time conventions, not American ones.
  const date = dateObj.toLocaleDateString(undefined, {
    month: "short",
    day: "2-digit",
    year: "numeric",
  });
  const time = dateObj.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });

  const currency = order.currency || "INR";
  const amount = toMajorUnits(order.totalAmount, currency);
  const subtotal = toMajorUnits(order.subtotalAmount, currency);
  const tax = toMajorUnits(order.taxAmount, currency);
  // What a coupon took off: the learner's order carries the subtotal, the
  // tax and what was paid.
  const discount = toMajorUnits(
    Math.max(0, order.subtotalAmount + order.taxAmount - order.totalAmount),
    currency,
  );
  const formattedAmount = formatMoney(order.totalAmount, { currency });

  const cleanOrderNumber = order.orderNumber.startsWith("#")
    ? order.orderNumber
    : `#${order.orderNumber}`;
  // The server issues the invoice number when the order is paid, and sends
  // it with the order; an order never paid has none. A number made up here
  // used to be shown, and offered for copying, on every order: it matched no
  // invoice. The same went for a "transaction id" cut from the order's own
  // id, which no payment provider would recognise; the API gives a learner
  // no payment reference, so none is shown.
  const invoiceNumber =
    status === "completed" || status === "refunded"
      ? order.invoiceNumber
      : null;

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

  // Said in words a buyer would use. The provider and method used to be
  // printed as they come ("free (free)"), and an order nobody had paid yet
  // read "Payment (Payment method unavailable)".
  const paymentSummary = order.paymentSummary;
  const paymentDetail = [paymentSummary?.method, paymentSummary?.detail]
    .filter(Boolean)
    .join(" · ");
  const isNoCostOrder =
    order.totalAmount === 0 ||
    paymentSummary?.provider.toLowerCase() === "free";
  // No summary means the provider named no method, not that nothing was
  // paid: a completed order, or one since refunded, was paid for, and used
  // to read "No payment taken". Only an order that failed took nothing.
  const paymentBrand = isNoCostOrder
    ? "No payment needed"
    : paymentSummary
      ? paymentSummary.provider
      : status === "processing"
        ? "Awaiting payment"
        : status === "completed" || status === "refunded"
          ? "Payment received"
          : "No payment taken";
  const paymentLabel =
    isNoCostOrder ||
    !paymentSummary ||
    paymentDetail.toLowerCase() === paymentSummary.provider.toLowerCase()
      ? ""
      : paymentDetail;

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
    ...(firstLabel?.note ? { purchaseNote: firstLabel.note } : {}),
    ...(firstItem?.thumbnail
      ? {
          thumbnail: {
            url: firstItem.thumbnail.url,
            srcSet: firstItem.thumbnail.srcSet
              .map((variant) => `${variant.url} ${variant.width}w`)
              .join(", "),
          },
        }
      : {}),
    iconColor,
    date,
    time,
    payment: {
      type: paymentType,
      brand: paymentBrand,
      label: paymentLabel,
    },
    amount,
    formattedAmount,
    status,
    statusLabel,
    subtotal,
    discount,
    tax,
    transactionId: null,
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
  // Orders in different currencies (rupees, and dollars from a course
  // bought at its price outside India) are added up apart.
  const spentByCurrency = new Map<string, number>();

  for (const o of orders) {
    if (o.status === "completed") {
      completed += 1;
      totalSpentAmount += o.price;
      const currency = o.currency || "INR";
      spentByCurrency.set(
        currency,
        (spentByCurrency.get(currency) ?? 0) + o.price,
      );
    } else if (o.status === "pending") {
      pending += 1;
    } else if (o.status === "failed") {
      failed += 1;
    } else if (o.status === "refunded") {
      refunded += 1;
    }
  }

  // `price` on the view model is already in major units.
  const formattedTotal =
    spentByCurrency.size > 1
      ? [...spentByCurrency]
          .map(([currency, amount]) =>
            formatMoney(Math.round(amount * 100) / 100, {
              currency,
              unit: "major",
            }),
          )
          .join(" + ")
      : formatMoney(totalSpentAmount, {
          currency: [...spentByCurrency.keys()][0] ?? "INR",
          unit: "major",
        });

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
