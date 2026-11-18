import assert from "node:assert/strict";
import { test } from "node:test";
import type { AdminOrder } from "@veolms/contracts";
import { csvCell, orderCsvRow, ORDERS_CSV_HEADER } from "./orders-csv.ts";

function order(overrides: Partial<AdminOrder> = {}): AdminOrder {
  return {
    id: crypto.randomUUID(),
    orderNumber: "ORD-1",
    invoiceNumber: "INV/2026/000001",
    status: "paid",
    currency: "INR",
    subtotalAmount: 79900,
    discountAmount: 30000,
    taxAmount: 0,
    totalAmount: 49900,
    afterCommissionAmount: null,
    items: [{ titleSnapshot: "JavaScript", courseId: null }],
    paidAt: "2026-11-11T08:24:00.000Z",
    createdAt: "2026-11-11T08:22:00.000Z",
    admin: {
      student: {
        name: "Aarav Mehta",
        displayName: "Aarav Mehta",
        email: "aarav@example.com",
        username: "aarav",
        avatarUrl: null,
      },
      coupon: { code: "DIWALI26" },
      payment: {
        gatewayProvider: "razorpay",
        gatewayPaymentId: "pay_1",
        paymentMethod: { method: "upi", vpa: null },
        failureReason: null,
      },
    },
    ...overrides,
  };
}

await test("a cell with a comma, quote or line break is quoted", () => {
  assert.equal(csvCell('Say "hi", then\nleave'), '"Say ""hi"", then\nleave"');
  assert.equal(csvCell("plain"), "plain");
});

await test("a cell a spreadsheet would run as a formula stays text", () => {
  assert.equal(csvCell("=HYPERLINK(1)"), "'=HYPERLINK(1)");
  assert.equal(csvCell("+91 98"), "'+91 98");
  assert.equal(csvCell("@sum"), "'@sum");
  assert.equal(csvCell("-1"), "'-1");
});

await test("numbers and empty values are written as they are", () => {
  assert.equal(csvCell(-5), "-5");
  assert.equal(csvCell(null), "");
});

await test("an order line has a cell for every header, amounts in major units", () => {
  const cells = orderCsvRow(order()).split(",");
  assert.equal(cells.length, ORDERS_CSV_HEADER.length);
  assert.equal(cells[3], "Success");
  assert.equal(cells[8], "799.00");
  assert.equal(cells[12], "499.00");
});

await test("a partially refunded order says so", () => {
  const cells = orderCsvRow(order({ status: "partially_refunded" })).split(",");
  assert.equal(cells[3], "Partially refunded");
});
