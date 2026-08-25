import type { Executor } from "../shared/repository.types.ts";
import { CommerceErrors } from "../shared/commerce.errors.ts";
import * as orderRepo from "../orders/order.repository.ts";
import * as paymentRepo from "../payments/payment.repository.ts";
import * as authRepo from "../../auth/authentication/authentication.repository.ts";

export interface InvoiceData {
  invoiceNumber: string;
  orderNumber: string;
  purchaseId: string;
  buyer: {
    userId: string;
    name: string;
    email?: string | null;
  };
  seller: {
    name: string;
  };
  currency: string;
  subtotalAmount: number;
  discountAmount: number;
  taxAmount: number;
  totalAmount: number;
  paymentReference: string;
  items: Array<{
    title: string;
    unitPrice: number;
    discountAmount: number;
    finalAmount: number;
  }>;
  paidAt: Date | null;
  createdAt: Date;
}

export interface InvoiceService {
  generateInvoiceData(orderId: string): Promise<InvoiceData>;
}

export function createInvoiceService({
  database,
}: {
  database: Executor;
}): InvoiceService {
  async function generateInvoiceData(orderId: string): Promise<InvoiceData> {
    const order = await orderRepo.findOrderById(database, orderId);
    if (!order) {
      throw CommerceErrors.ORDER_NOT_FOUND(orderId);
    }

    const items = await orderRepo.listOrderItems(database, orderId);
    const payment = await paymentRepo.findPaymentByOrderId(database, orderId);
    const user = await authRepo.findUserById(database, order.user_id);

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
        name: "VeoLMS Academy",
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

  return {
    generateInvoiceData,
  };
}
