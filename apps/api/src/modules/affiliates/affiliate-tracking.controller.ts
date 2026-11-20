import type { RecordAffiliateClickRequest } from "@veolms/contracts";
import type { FastifyReply, FastifyRequest } from "fastify";

import {
  readAffiliateClickId,
  setAffiliateClickCookie,
} from "./affiliate-click-cookie.ts";
import type { AffiliateTrackingService } from "./affiliate-tracking.service.ts";

export function createAffiliateTrackingController({
  service,
}: {
  service: AffiliateTrackingService;
}) {
  async function getPublicProgram(
    _request: FastifyRequest,
    reply: FastifyReply,
  ) {
    reply.header("Cache-Control", "public, max-age=60");
    return await service.getPublicProgram();
  }

  async function recordClick(
    request: FastifyRequest<{ Body: RecordAffiliateClickRequest }>,
    reply: FastifyReply,
  ) {
    const recorded = await service.recordClick({
      ...request.body,
      address: request.ip,
      userAgent: request.headers["user-agent"],
      userId: request.user?.id ?? null,
      existingClickId: readAffiliateClickId(request),
    });
    if (recorded) {
      setAffiliateClickCookie(reply, recorded.clickId, recorded.maxAgeSeconds);
    }
    reply.header("Cache-Control", "private, no-store");
    return { ok: true as const };
  }

  async function claimReferral(request: FastifyRequest, reply: FastifyReply) {
    await service.claimReferral({
      userId: request.user!.id,
      clickId: readAffiliateClickId(request),
    });
    reply.header("Cache-Control", "private, no-store");
    return { ok: true as const };
  }

  return { getPublicProgram, recordClick, claimReferral };
}
