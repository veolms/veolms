import type {
  AffiliateApplyRequest,
  AffiliateCommissionsQuery,
  AffiliatePayoutDetailsRequest,
  AffiliateStatsQuery,
  UpdateAffiliateMeRequest,
} from "@veolms/contracts";
import type { FastifyReply, FastifyRequest } from "fastify";

import { AppError } from "../../lib/errors.ts";
import type {
  AffiliateAccountService,
  AffiliateUser,
} from "./affiliate-account.service.ts";

function caller(request: FastifyRequest): AffiliateUser {
  const user = request.user!;
  return {
    id: user.id,
    email: user.email ?? null,
    displayName: user.displayName || user.username || null,
  };
}

export function createAffiliateAccountController({
  service,
}: {
  service: AffiliateAccountService;
}) {
  const noStore = (reply: FastifyReply) =>
    reply.header("Cache-Control", "private, no-store");

  return {
    async apply(
      request: FastifyRequest<{ Body: AffiliateApplyRequest }>,
      reply: FastifyReply,
    ) {
      noStore(reply);
      return await service.apply(caller(request), request.body);
    },
    async getMe(request: FastifyRequest, reply: FastifyReply) {
      noStore(reply);
      return await service.getMe(caller(request));
    },
    async updateMe(
      request: FastifyRequest<{ Body: UpdateAffiliateMeRequest }>,
      reply: FastifyReply,
    ) {
      noStore(reply);
      return await service.updateMe(caller(request), request.body);
    },
    async setPayoutDetails(
      request: FastifyRequest<{ Body: AffiliatePayoutDetailsRequest }>,
      reply: FastifyReply,
    ) {
      noStore(reply);
      return await service.setPayoutDetails(caller(request), request.body);
    },
    async deletePayoutDetails(request: FastifyRequest, reply: FastifyReply) {
      noStore(reply);
      return await service.deletePayoutDetails(caller(request));
    },
    async getStats(
      request: FastifyRequest<{ Querystring: AffiliateStatsQuery }>,
      reply: FastifyReply,
    ) {
      noStore(reply);
      return await service.getStats(caller(request), request.query);
    },
    async listCommissions(
      request: FastifyRequest<{
        Querystring: AffiliateCommissionsQuery & { limit: number };
      }>,
      reply: FastifyReply,
    ) {
      noStore(reply);
      return await service.listCommissions(caller(request), request.query);
    },
    async listPayouts(request: FastifyRequest, reply: FastifyReply) {
      noStore(reply);
      return await service.listPayouts(caller(request));
    },
    async requestPayout(request: FastifyRequest, reply: FastifyReply) {
      const header = request.headers["idempotency-key"];
      const key = (Array.isArray(header) ? header[0] : header)?.trim();
      if (!key || key.length > 100) {
        throw new AppError(
          400,
          "IDEMPOTENCY_KEY_REQUIRED",
          "Send an Idempotency-Key header (up to 100 characters).",
        );
      }
      noStore(reply);
      const { payout, created } = await service.requestPayout(
        caller(request),
        key,
      );
      reply.code(created ? 201 : 200);
      return payout;
    },
  };
}
