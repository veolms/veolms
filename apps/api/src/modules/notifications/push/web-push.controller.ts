import type { RegisterWebPushSubscription } from "@veolms/contracts";
import type { FastifyRequest } from "fastify";

import type { WebPushService } from "./web-push.service.ts";

export function createWebPushController({
  service,
}: {
  service: WebPushService;
}) {
  async function config() {
    return service.config();
  }

  async function register(
    request: FastifyRequest<{ Body: RegisterWebPushSubscription }>,
  ) {
    return await service.register(
      request.user!.id,
      request.session?.id ?? null,
      request.body,
    );
  }

  async function remove(
    request: FastifyRequest<{ Body: { endpoint: string } }>,
  ) {
    return await service.remove(request.user!.id, request.body.endpoint);
  }

  async function test(request: FastifyRequest<{ Body: { endpoint: string } }>) {
    return await service.test(request.user!.id, request.body.endpoint);
  }

  return { config, register, remove, test };
}
