import type { FastifyReply, FastifyRequest } from "fastify";
import type {
  SubmitManualPaymentRequest,
  VerifyManualPaymentRequest,
} from "@veolms/contracts";
import type { ManualPaymentStatus } from "@veolms/database";
import type { ManualPaymentService } from "./manual-payment.service.ts";

export interface ManualPaymentController {
  submitPayment(
    request: FastifyRequest<{
      Params: { orderId: string };
      Body: SubmitManualPaymentRequest;
    }>,
    reply: FastifyReply,
  ): Promise<void>;
  listMyPayments(request: FastifyRequest, reply: FastifyReply): Promise<void>;
  listAllPayments(
    request: FastifyRequest<{ Querystring: { status?: ManualPaymentStatus } }>,
    reply: FastifyReply,
  ): Promise<void>;
  verifyPayment(
    request: FastifyRequest<{
      Params: { requestId: string };
      Body: VerifyManualPaymentRequest;
    }>,
    reply: FastifyReply,
  ): Promise<void>;
}

export function createManualPaymentController({
  service,
}: {
  service: ManualPaymentService;
}): ManualPaymentController {
  async function submitPayment(
    request: FastifyRequest<{
      Params: { orderId: string };
      Body: SubmitManualPaymentRequest;
    }>,
    reply: FastifyReply,
  ) {
    const userId = request.user!.id;
    const { orderId } = request.params;
    const result = await service.submitManualPayment(
      userId,
      orderId,
      request.body,
    );
    reply.status(201).send(result);
  }

  async function listMyPayments(request: FastifyRequest, reply: FastifyReply) {
    const userId = request.user!.id;
    const items = await service.listUserManualPayments(userId);
    reply.status(200).send(items);
  }

  async function listAllPayments(
    request: FastifyRequest<{ Querystring: { status?: ManualPaymentStatus } }>,
    reply: FastifyReply,
  ) {
    const { status } = request.query;
    const items = await service.listAllManualPayments(status);
    reply.status(200).send(items);
  }

  async function verifyPayment(
    request: FastifyRequest<{
      Params: { requestId: string };
      Body: VerifyManualPaymentRequest;
    }>,
    reply: FastifyReply,
  ) {
    const adminUserId = request.user!.id;
    const { requestId } = request.params;
    const result = await service.verifyManualPayment(
      adminUserId,
      requestId,
      request.body,
    );
    reply.status(200).send(result);
  }

  return {
    submitPayment,
    listMyPayments,
    listAllPayments,
    verifyPayment,
  };
}
