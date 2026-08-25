import type { FastifyRequest } from "fastify";
import type { OrderService } from "./order.service.ts";

export function createOrderController({
  service,
}: {
  service: OrderService;
}) {
  async function getOrder(
    request: FastifyRequest<{ Params: { orderId: string } }>,
  ) {
    const userId = request.user!.id;
    return await service.getOrderById(userId, request.params.orderId);
  }

  async function listOrders(request: FastifyRequest) {
    const userId = request.user!.id;
    return await service.listUserOrders(userId);
  }

  return {
    getOrder,
    listOrders,
  };
}
