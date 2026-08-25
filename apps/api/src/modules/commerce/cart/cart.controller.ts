import type { FastifyReply, FastifyRequest } from "fastify";
import type { CartItemInput } from "@veolms/contracts";
import type { CartService } from "./cart.service.ts";

export function createCartController({
  service,
}: {
  service: CartService;
}) {
  async function getCart(request: FastifyRequest) {
    const userId = request.user!.id;
    return await service.getActiveCart(userId);
  }

  async function addItem(
    request: FastifyRequest<{ Body: CartItemInput }>,
  ) {
    const userId = request.user!.id;
    return await service.addItem(userId, request.body);
  }

  async function removeItem(
    request: FastifyRequest<{ Params: { itemId: string } }>,
  ) {
    const userId = request.user!.id;
    return await service.removeItem(userId, request.params.itemId);
  }

  async function clearCart(request: FastifyRequest) {
    const userId = request.user!.id;
    return await service.clearCart(userId);
  }

  return {
    getCart,
    addItem,
    removeItem,
    clearCart,
  };
}
