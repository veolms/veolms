import type { FastifyRequest } from "fastify";
import type { AnalyticsFilterQuery, DashboardQuery } from "@veolms/contracts";
import type { AnalyticsService } from "./analytics.service.ts";
import type { AnalyticsDashboardScope } from "./analytics.types.ts";

type RequestContext = FastifyRequest & {
  user: NonNullable<FastifyRequest["user"]>;
  authorization?: {
    permission?: string;
  };
};
const context = (request: FastifyRequest) => request as RequestContext;
const actor = (request: FastifyRequest) => ({
  id: context(request).user.id,
  roles: context(request).user.roles,
});
const dashboardScope = (request: FastifyRequest): AnalyticsDashboardScope =>
  context(request).authorization?.permission === "analytics.revenue.read"
    ? "platform"
    : "course";

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
    dashboard: async (
      request: FastifyRequest<{ Querystring: DashboardQuery }>,
    ) => service.dashboard(actor(request), dashboardScope(request), request.query.range),
  };
}

export type AnalyticsController = ReturnType<typeof createAnalyticsController>;
