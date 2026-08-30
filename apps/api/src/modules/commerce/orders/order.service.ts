import type { Order } from "@veolms/contracts";
import type { Executor } from "../shared/repository.types.ts";
import { CommerceErrors } from "../shared/commerce.errors.ts";
import * as orderRepo from "./order.repository.ts";
import { toOrderContract } from "./order.mapper.ts";

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

    return toOrderContract(order, items);
  }

  async function listUserOrders(userId: string): Promise<Order[]> {
    const orders = await orderRepo.listOrdersByUserId(database, userId);
    if (orders.length === 0) return [];

    const orderIds = orders.map((o) => o.id);
    const allItems = await orderRepo.listOrderItemsByOrderIds(database, orderIds);

    // Group items by order_id in memory
    const itemsByOrderId = new Map<string, typeof allItems>();
    for (const item of allItems) {
      const list = itemsByOrderId.get(item.order_id) ?? [];
      list.push(item);
      itemsByOrderId.set(item.order_id, list);
    }

    return orders.map((order) => {
      const items = itemsByOrderId.get(order.id) ?? [];
      return toOrderContract(order, items);
    });
  }

  return {
    getOrderById,
    listUserOrders,
  };
}
