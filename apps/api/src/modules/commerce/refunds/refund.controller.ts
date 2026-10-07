import type { FastifyRequest } from "fastify";
import type { CreateRefundRequest } from "@veolms/contracts";
import { AppError } from "../../../lib/errors.ts";
import { toRefundResult } from "./refund.mapper.ts";
import type { RefundService } from "./refund.service.ts";

export function createRefundController({
  service,
}: {
  service: RefundService;
}) {
  async function createRefund(
    request: FastifyRequest<{ Body: CreateRefundRequest }>,
  ) {
    const adminUserId = request.user!.id;
    const refund = await service.processRefund(adminUserId, request.body);
    return toRefundResult(refund);
  }

  async function getRefund(
    request: FastifyRequest<{ Params: { refundId: string } }>,
  ) {
    const refund = await service.getRefundById(request.params.refundId);
    if (!refund) {
      throw new AppError(
        404,
        "REFUND_NOT_FOUND",
        "Refund record was not found.",
      );
    }
    return refund;
  }

  async function listOrderRefunds(
    request: FastifyRequest<{ Params: { orderId: string } }>,
  ) {
    return await service.listRefundsForOrder(request.params.orderId);
  }

  return {
    createRefund,
    getRefund,
    listOrderRefunds,
  };
}
