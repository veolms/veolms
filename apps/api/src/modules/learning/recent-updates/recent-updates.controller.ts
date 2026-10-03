import type { RecentUpdatesQuery } from "@veolms/contracts";
import type { FastifyRequest } from "fastify";

import type { RecentUpdatesService } from "./recent-updates.service.ts";

export function createRecentUpdatesController({ service }: { service: RecentUpdatesService }) {
  async function list(request: FastifyRequest<{ Querystring: RecentUpdatesQuery }>) {
    return await service.list(request.user!.id, request.query);
  }

  return { list };
}
