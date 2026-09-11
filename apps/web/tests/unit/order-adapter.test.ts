import { describe, expect, it } from "vitest";
import type { Order } from "@veolms/contracts";
import {
  adaptOrderToOrderItem,
  adaptOrderToOrderHistoryItem,
  computeOrderSummary,
  extractRecentPayments,
} from "../../src/orders/orderAdapter";

describe("Order Flow - Adapters & Computation", () => {
  const sampleOrder: Order = {
    id: "33333333-3333-3333-3333-333333333333",
    orderNumber: "PC-72401",
    userId: "44444444-4444-4444-4444-444444444444",
    status: "paid",
    currency: "INR",
    subtotalAmount: 127000,
    discountAmount: 0,
    taxAmount: 22900,
    totalAmount: 149900,
    expiresAt: "2026-05-12T10:30:00Z",
    createdAt: "2025-05-12T10:30:00Z",
    updatedAt: "2025-05-12T10:30:00Z",
    items: [
      {
        id: "55555555-5555-5555-5555-555555555555",
        itemType: "course",
        courseId: "66666666-6666-6666-6666-666666666666",
        titleSnapshot: "The Ultimate TypeScript Course",
        unitPrice: 149900,
        discountAmount: 0,
        taxAmount: 22900,
        finalAmount: 149900,
        createdAt: "2025-05-12T10:30:00Z",
      },
    ],
  };

  it("adapts Order to OrderItem correctly", () => {
    const item = adaptOrderToOrderItem(sampleOrder);

    expect(item.id).toBe(sampleOrder.id);
    expect(item.orderNumber).toBe("#PC-72401");
    expect(item.courseTitle).toBe("The Ultimate TypeScript Course");
    expect(item.status).toBe("completed");
    expect(item.price).toBe(1499);
    expect(item.subtotal).toBe(1270);
    expect(item.tax).toBe(229);
    expect(item.formattedPrice).toContain("1,499");
  });

  it("adapts Order to OrderHistoryItem correctly", () => {
    const histItem = adaptOrderToOrderHistoryItem(sampleOrder);

    expect(histItem.id).toBe(sampleOrder.id);
    expect(histItem.orderNumber).toBe("#PC-72401");
    expect(histItem.courseTitle).toBe("The Ultimate TypeScript Course");
    expect(histItem.status).toBe("completed");
    expect(histItem.amount).toBe(1499);
    expect(histItem.itemCount).toBe("1 Course");
  });

  it("computes order summary metrics accurately", () => {
    const orderItems = [
      adaptOrderToOrderItem(sampleOrder),
      adaptOrderToOrderItem({
        ...sampleOrder,
        id: "ord-2",
        status: "pending",
        totalAmount: 99900,
      }),
      adaptOrderToOrderItem({
        ...sampleOrder,
        id: "ord-3",
        status: "payment_failed",
        totalAmount: 199900,
      }),
      adaptOrderToOrderItem({
        ...sampleOrder,
        id: "ord-4",
        status: "refunded",
        totalAmount: 149900,
      }),
    ];

    const summary = computeOrderSummary(orderItems);

    expect(summary.totalOrders).toBe(4);
    expect(summary.completed).toBe(1);
    expect(summary.pending).toBe(1);
    expect(summary.failed).toBe(1);
    expect(summary.refunded).toBe(1);
    expect(summary.totalSpentAmount).toBe(1499);
  });

  it("extracts recent payment items", () => {
    const orderItems = [adaptOrderToOrderItem(sampleOrder)];
    const recent = extractRecentPayments(orderItems);

    expect(recent.length).toBe(1);
    expect(recent[0]?.courseTitle).toBe("The Ultimate TypeScript Course");
    expect(recent[0]?.status).toBe("completed");
  });
});
