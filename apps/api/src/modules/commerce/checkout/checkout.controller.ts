import type { FastifyRequest } from "fastify";
import type {
  CheckoutPreviewRequest,
  CreateCheckoutOrderRequest,
} from "@veolms/contracts";
import type { CheckoutService } from "./checkout.service.ts";

export function createCheckoutController({
  service,
}: {
  service: CheckoutService;
}) {
  async function previewCheckout(
    request: FastifyRequest<{ Body: CheckoutPreviewRequest }>,
  ) {
    const userId = request.user?.id;
    return await service.previewCheckout(userId, request.body);
  }

  async function createOrder(
    request: FastifyRequest<{ Body: CreateCheckoutOrderRequest }>,
  ) {
    const user = {
      id: request.user!.id,
      name: request.user!.displayName || request.user!.username,
      email: request.user!.email,
      phone: request.user!.phoneNo,
    };
    return await service.createOrder(user, request.body);
  }

  return {
    previewCheckout,
    createOrder,
  };
}
