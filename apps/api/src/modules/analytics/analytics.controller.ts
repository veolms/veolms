import type { FastifyRequest } from "fastify";
import type { AnalyticsFilterQuery } from "@veolms/contracts";
import type { AnalyticsService } from "./analytics.service.ts";

type RequestContext = FastifyRequest & {
  user: NonNullable<FastifyRequest["user"]>;
};
const context = (request: FastifyRequest) => request as RequestContext;
const actor = (request: FastifyRequest) => ({
  id: context(request).user.id,
  roles: context(request).user.roles,
});

export function createAnalyticsController({
  service,
}: {
  service: AnalyticsService;
}) {
  return {
    adminOverview: async (
      request: FastifyRequest<{ Querystring: AnalyticsFilterQuery }>,
    ) => service.adminOverview(actor(request), request.query),
    instructorOverview: async (
      request: FastifyRequest<{ Querystring: AnalyticsFilterQuery }>,
    ) => service.instructorOverview(actor(request), request.query),
  };
}

export type AnalyticsController = ReturnType<typeof createAnalyticsController>;
