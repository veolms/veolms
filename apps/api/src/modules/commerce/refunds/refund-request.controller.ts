import type { FastifyReply, FastifyRequest } from "fastify";
import type {
  CreateStudentRefundRequest,
  ReviewRefundRequest,
} from "@veolms/contracts";
import type { RefundRequestService } from "./refund-request.service.ts";

export interface RefundRequestController {
  submitRequest(
    request: FastifyRequest<{
      Params: { orderId: string };
      Body: CreateStudentRefundRequest;
    }>,
    reply: FastifyReply,
  ): Promise<void>;
  listMyRequests(request: FastifyRequest, reply: FastifyReply): Promise<void>;
  listAllRequests(
    request: FastifyRequest<{ Querystring: { status?: string } }>,
    reply: FastifyReply,
  ): Promise<void>;
  reviewRequest(
    request: FastifyRequest<{
      Params: { requestId: string };
      Body: ReviewRefundRequest;
    }>,
    reply: FastifyReply,
  ): Promise<void>;
}

export function createRefundRequestController({
  service,
}: {
  service: RefundRequestService;
}): RefundRequestController {
  async function submitRequest(
    request: FastifyRequest<{
      Params: { orderId: string };
      Body: CreateStudentRefundRequest;
    }>,
    reply: FastifyReply,
  ) {
    const userId = request.user!.id;
    const { orderId } = request.params;
    const result = await service.submitStudentRefundRequest(
      userId,
      orderId,
      request.body,
    );
    reply.status(201).send(result);
  }

  async function listMyRequests(request: FastifyRequest, reply: FastifyReply) {
    const userId = request.user!.id;
    const requests = await service.listStudentRefundRequests(userId);
    reply.status(200).send(requests);
  }

  async function listAllRequests(
    request: FastifyRequest<{ Querystring: { status?: string } }>,
    reply: FastifyReply,
  ) {
    const { status } = request.query;
    const requests = await service.listAllRefundRequests(status);
    reply.status(200).send(requests);
  }

  async function reviewRequest(
    request: FastifyRequest<{
      Params: { requestId: string };
      Body: ReviewRefundRequest;
    }>,
    reply: FastifyReply,
  ) {
    const adminUserId = request.user!.id;
    const { requestId } = request.params;
    const result = await service.reviewRefundRequest(
      adminUserId,
      requestId,
      request.body,
    );
    reply.status(200).send(result.refundRequest);
  }

  return {
    submitRequest,
    listMyRequests,
    listAllRequests,
    reviewRequest,
  };
}
