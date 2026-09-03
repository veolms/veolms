import type { FastifyRequest } from "fastify";
import type { VerifyPaymentRequest } from "@veolms/contracts";
import type { PaymentService } from "./payment.service.ts";

export function createPaymentController({
  service,
}: {
  service: PaymentService;
}) {
  /**
   * POST /payments/verify
   * Passes the authenticated userId so the service can enforce order ownership.
   */
  async function verifyPayment(
    request: FastifyRequest<{ Body: VerifyPaymentRequest }>,
  ) {
    const userId = request.user!.id;
    return await service.verifyPayment(userId, request.body);
  }

  return {
    verifyPayment,
  };
}
