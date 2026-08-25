import type { Order } from "@veolms/contracts";
import type { Executor } from "../shared/repository.types.ts";
import { CommerceErrors } from "../shared/commerce.errors.ts";
import * as orderRepo from "./order.repository.ts";

export interface OrderService {
  getOrderById(userId: string, orderId: string): Promise<Order>;
  listUserOrders(userId: string): Promise<Order[]>;
}

export function createOrderService({
  database,
}: {
  database: Executor;
}): OrderService {
  async function getOrderById(userId: string, orderId: string): Promise<Order> {
    const order = await orderRepo.findOrderById(database, orderId);
    if (!order || order.user_id !== userId) {
      throw CommerceErrors.ORDER_NOT_FOUND(orderId);
    }

    const items = await orderRepo.listOrderItems(database, order.id);

    return {
      id: order.id,
      orderNumber: order.order_number,
      userId: order.user_id,
      status: order.status as any,
      currency: order.currency,
      subtotalAmount: order.subtotal_amount,
      discountAmount: order.discount_amount,
      taxAmount: order.tax_amount,
      totalAmount: order.total_amount,
      couponId: order.coupon_id,
      idempotencyKey: order.idempotency_key,
      items: items.map((oi) => ({
        id: oi.id,
        orderId: oi.order_id,
        itemType: oi.item_type as any,
        courseId: oi.course_id,
        bundleId: oi.bundle_id,
        titleSnapshot: oi.title_snapshot,
        unitPrice: oi.unit_price,
        discountAmount: oi.discount_amount,
        taxAmount: oi.tax_amount,
        finalAmount: oi.final_amount,
        createdAt: oi.created_at,
      })),
      expiresAt: order.expires_at,
      paidAt: order.paid_at,
      createdAt: order.created_at,
      updatedAt: order.updated_at,
    };
  }

  async function listUserOrders(userId: string): Promise<Order[]> {
    const orders = await orderRepo.listOrdersByUserId(database, userId);
    const result: Order[] = [];

    for (const order of orders) {
      const items = await orderRepo.listOrderItems(database, order.id);
      result.push({
        id: order.id,
        orderNumber: order.order_number,
        userId: order.user_id,
        status: order.status as any,
        currency: order.currency,
        subtotalAmount: order.subtotal_amount,
        discountAmount: order.discount_amount,
        taxAmount: order.tax_amount,
        totalAmount: order.total_amount,
        couponId: order.coupon_id,
        idempotencyKey: order.idempotency_key,
        items: items.map((oi) => ({
          id: oi.id,
          orderId: oi.order_id,
          itemType: oi.item_type as any,
          courseId: oi.course_id,
          bundleId: oi.bundle_id,
          titleSnapshot: oi.title_snapshot,
          unitPrice: oi.unit_price,
          discountAmount: oi.discount_amount,
          taxAmount: oi.tax_amount,
          finalAmount: oi.final_amount,
          createdAt: oi.created_at,
        })),
        expiresAt: order.expires_at,
        paidAt: order.paid_at,
        createdAt: order.created_at,
        updatedAt: order.updated_at,
      });
    }

    return result;
  }

  return {
    getOrderById,
    listUserOrders,
  };
}
