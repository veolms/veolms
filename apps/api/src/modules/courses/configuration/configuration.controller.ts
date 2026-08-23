import type { FastifyRequest } from "fastify";
import type {
  UpdateCourseAccessRuleRequest,
  UpdateCoursePricingRequest,
  UpdateCourseSettingsRequest,
} from "@veolms/contracts";
import type { ConfigurationService } from "./configuration.service.ts";

export function createConfigurationController({
  service,
}: {
  service: ConfigurationService;
}) {
  async function upsertCourseAccessRules(
    request: FastifyRequest<{
      Params: { id: string };
      Body: UpdateCourseAccessRuleRequest;
    }>,
  ) {
    const { id } = request.params;
    const creatorId = request.user!.id;
    return await service.upsertCourseAccessRules(id, creatorId, request.body);
  }

  async function upsertCoursePricing(
    request: FastifyRequest<{
      Params: { id: string };
      Body: UpdateCoursePricingRequest;
    }>,
  ) {
    const { id } = request.params;
    const creatorId = request.user!.id;
    return await service.upsertCoursePricing(id, creatorId, request.body);
  }

  async function upsertCourseSettings(
    request: FastifyRequest<{
      Params: { id: string };
      Body: UpdateCourseSettingsRequest;
    }>,
  ) {
    const { id } = request.params;
    const creatorId = request.user!.id;
    return await service.upsertCourseSettings(id, creatorId, request.body);
  }

  return {
    upsertCourseAccessRules,
    upsertCoursePricing,
    upsertCourseSettings,
  };
}

export type ConfigurationController = ReturnType<typeof createConfigurationController>;
