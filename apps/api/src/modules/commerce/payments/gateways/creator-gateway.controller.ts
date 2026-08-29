import type { FastifyReply, FastifyRequest } from "fastify";
import type { SaveCreatorPaymentConfigRequest } from "@veolms/contracts";
import type { CreatorGatewayService } from "./creator-gateway.service.ts";

export interface CreatorGatewayController {
  saveConfig(
    request: FastifyRequest<{ Body: SaveCreatorPaymentConfigRequest }>,
    reply: FastifyReply,
  ): Promise<void>;
  getConfig(request: FastifyRequest, reply: FastifyReply): Promise<void>;
}

export function createCreatorGatewayController({
  service,
}: {
  service: CreatorGatewayService;
}): CreatorGatewayController {
  async function saveConfig(
    request: FastifyRequest<{ Body: SaveCreatorPaymentConfigRequest }>,
    reply: FastifyReply,
  ) {
    const creatorId = request.user!.id;
    const config = await service.saveCreatorConfig(creatorId, request.body);
    reply.status(200).send(config);
  }

  async function getConfig(request: FastifyRequest, reply: FastifyReply) {
    const creatorId = request.user!.id;
    const config = await service.getCreatorConfig(creatorId);
    reply.status(200).send(config);
  }

  return {
    saveConfig,
    getConfig,
  };
}
