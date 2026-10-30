import assert from "node:assert/strict";
import { test } from "node:test";

import { createNotificationIntents } from "../../notifications/notifications.handlers.ts";
import { createInvoiceAttachmentResolver } from "./invoice-email-attachment.ts";

const orderId = "7f0c2a4e-1d1b-4c55-9f7e-2a9b3c4d5e6f";

await test("the purchase email asks for the order's invoice", async () => {
  const [intent] = await createNotificationIntents(
    "payment.completed",
    {
      paymentId: "0b6d3a3c-58f3-4a8f-8d3e-3b0f6c1a2b3c",
      orderId,
      orderNumber: "ORD-20261018-AB12CD",
      recipientUserId: "3f2a9c1e-8b7d-4e6f-a5c4-1b2d3e4f5a6b",
      totalAmount: 799,
      currency: "INR",
      itemTitles: ["The Complete JavaScript Course"],
    },
    { listActiveCourseRecipientUserIds: async () => [] },
  );
  assert.deepEqual(intent?.emailAttachments, [
    { kind: "order-invoice", orderId },
  ]);
});

await test("the invoice is attached as the PDF a download serves", async () => {
  const pdf = Buffer.from("%PDF-1.3 invoice");
  const asked: string[] = [];
  const resolver = createInvoiceAttachmentResolver({
    getOrderInvoicePdf: async (id) => {
      asked.push(id);
      return { fileName: "invoice-INV-2026-000042.pdf", pdf };
    },
  });

  assert.deepEqual(await resolver.resolve({ kind: "order-invoice", orderId }), {
    filename: "invoice-INV-2026-000042.pdf",
    content: pdf,
    contentType: "application/pdf",
  });
  assert.deepEqual(asked, [orderId]);
});

await test("an invoice that cannot be had fails the attachment, so the email is tried again", async () => {
  const resolver = createInvoiceAttachmentResolver({
    getOrderInvoicePdf: async () => {
      throw new Error("storage unreachable");
    },
  });
  await assert.rejects(
    resolver.resolve({ kind: "order-invoice", orderId }),
    /storage unreachable/,
  );
});
