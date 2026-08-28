import type { Invoice } from "@veolms/contracts";
import type { Executor } from "../shared/repository.types.ts";
import { CommerceErrors } from "../shared/commerce.errors.ts";
import * as orderRepo from "../orders/order.repository.ts";
import * as paymentRepo from "../payments/payment.repository.ts";
import * as authRepo from "../../auth/authentication/authentication.repository.ts";
import * as setupRepo from "../../auth/setup/setup.repository.ts";

export interface InvoiceService {
  generateInvoiceData(
    userId: string,
    orderId: string,
    isAdmin?: boolean,
  ): Promise<Invoice>;
  generateInvoiceHtml(
    userId: string,
    orderId: string,
    isAdmin?: boolean,
  ): Promise<string>;
}

export function createInvoiceService({
  database,
}: {
  database: Executor;
}): InvoiceService {
  async function generateInvoiceData(
    userId: string,
    orderId: string,
    isAdmin = false,
  ): Promise<Invoice> {
    const order = await orderRepo.findOrderById(database, orderId);
    if (!order || (!isAdmin && order.user_id !== userId)) {
      throw CommerceErrors.ORDER_NOT_FOUND(orderId);
    }

    const items = await orderRepo.listOrderItems(database, orderId);
    const payment = await paymentRepo.findPaymentByOrderId(database, orderId);
    const user = await authRepo.findUserById(database, order.user_id);
    const academy = await setupRepo.findAcademy(database);

    const paymentRef = payment?.gateway_payment_id ?? payment?.gateway_order_id ?? "N/A";

    return {
      invoiceNumber: `INV-${order.order_number}`,
      orderNumber: order.order_number,
      purchaseId: order.id,
      buyer: {
        userId: order.user_id,
        name: user?.display_name || user?.username || "Student",
        email: user?.email,
      },
      seller: {
        name: academy?.name || "Academy",
        logoUrl: academy?.logo_url ?? null,
        customDomain: academy?.custom_domain ?? null,
      },
      currency: order.currency,
      subtotalAmount: order.subtotal_amount,
      discountAmount: order.discount_amount,
      taxAmount: order.tax_amount,
      totalAmount: order.total_amount,
      paymentReference: paymentRef,
      items: items.map((it) => ({
        title: it.title_snapshot,
        unitPrice: it.unit_price,
        discountAmount: it.discount_amount,
        finalAmount: it.final_amount,
      })),
      paidAt: order.paid_at,
      createdAt: order.created_at,
    };
  }

  async function generateInvoiceHtml(
    userId: string,
    orderId: string,
    isAdmin = false,
  ): Promise<string> {
    const inv = await generateInvoiceData(userId, orderId, isAdmin);
    const dateStr = inv.paidAt
      ? new Date(inv.paidAt).toLocaleDateString("en-IN", {
          year: "numeric",
          month: "long",
          day: "numeric",
        })
      : new Date(inv.createdAt).toLocaleDateString("en-IN", {
          year: "numeric",
          month: "long",
          day: "numeric",
        });

    const rows = inv.items
      .map(
        (it) => `
        <tr>
          <td style="padding: 12px 8px; border-bottom: 1px solid #e2e8f0;">${it.title}</td>
          <td style="padding: 12px 8px; border-bottom: 1px solid #e2e8f0; text-align: right;">₹${(it.unitPrice / 100).toFixed(2)}</td>
          <td style="padding: 12px 8px; border-bottom: 1px solid #e2e8f0; text-align: right; color: #16a34a;">-₹${(it.discountAmount / 100).toFixed(2)}</td>
          <td style="padding: 12px 8px; border-bottom: 1px solid #e2e8f0; text-align: right; font-weight: 600;">₹${(it.finalAmount / 100).toFixed(2)}</td>
        </tr>`,
      )
      .join("");

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Invoice - ${inv.invoiceNumber}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #0f172a; margin: 0; padding: 40px; background: #fff; }
    .container { max-width: 720px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 8px; padding: 40px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #0f172a; padding-bottom: 20px; margin-bottom: 28px; }
    .title { font-size: 24px; font-weight: 800; }
    .meta-table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
    .meta-table td { padding: 4px 0; vertical-align: top; }
    .items-table { width: 100%; border-collapse: collapse; margin-top: 16px; margin-bottom: 24px; }
    .items-table th { background: #f8fafc; padding: 10px 8px; text-align: left; font-size: 12px; text-transform: uppercase; color: #64748b; border-bottom: 1px solid #cbd5e1; }
    .totals { width: 280px; margin-left: auto; border-top: 2px solid #0f172a; padding-top: 12px; }
    .totals-row { display: flex; justify-content: space-between; padding: 4px 0; font-size: 14px; }
    .totals-grand { font-size: 18px; font-weight: 800; border-top: 1px solid #e2e8f0; padding-top: 8px; margin-top: 4px; }
    .footer { margin-top: 40px; text-align: center; color: #94a3b8; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div>
        <div class="title">${inv.seller.name}</div>
        <div style="color: #64748b; font-size: 14px;">${inv.seller.customDomain || ""}</div>
      </div>
      <div style="text-align: right;">
        <div style="font-size: 20px; font-weight: 700; color: #0284c7;">INVOICE</div>
        <div style="font-size: 14px; font-weight: 600;">#${inv.invoiceNumber}</div>
        <div style="font-size: 12px; color: #64748b;">Date: ${dateStr}</div>
      </div>
    </div>

    <table class="meta-table">
      <tr>
        <td style="width: 50%;">
          <div style="font-size: 11px; text-transform: uppercase; color: #64748b; font-weight: 700;">Billed To</div>
          <div style="font-weight: 600; font-size: 15px;">${inv.buyer.name}</div>
          <div style="color: #64748b; font-size: 13px;">${inv.buyer.email || ""}</div>
        </td>
        <td style="width: 50%; text-align: right;">
          <div style="font-size: 11px; text-transform: uppercase; color: #64748b; font-weight: 700;">Payment Details</div>
          <div style="font-size: 13px;">Order: <strong>${inv.orderNumber}</strong></div>
          <div style="font-size: 13px; color: #64748b;">Ref: ${inv.paymentReference}</div>
        </td>
      </tr>
    </table>

    <table class="items-table">
      <thead>
        <tr>
          <th>Description</th>
          <th style="text-align: right;">Price</th>
          <th style="text-align: right;">Discount</th>
          <th style="text-align: right;">Amount</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>

    <div class="totals">
      <div class="totals-row">
        <span style="color: #64748b;">Subtotal:</span>
        <span>₹${(inv.subtotalAmount / 100).toFixed(2)}</span>
      </div>
      ${
        inv.discountAmount > 0
          ? `<div class="totals-row" style="color: #16a34a;">
              <span>Discount:</span>
              <span>-₹${(inv.discountAmount / 100).toFixed(2)}</span>
            </div>`
          : ""
      }
      <div class="totals-row totals-grand">
        <span>Total Paid:</span>
        <span>₹${(inv.totalAmount / 100).toFixed(2)}</span>
      </div>
    </div>

    <div class="footer">
      <p>Thank you for learning with ${inv.seller.name}. This is a computer-generated receipt.</p>
    </div>
  </div>
</body>
</html>`;
  }

  return {
    generateInvoiceData,
    generateInvoiceHtml,
  };
}

