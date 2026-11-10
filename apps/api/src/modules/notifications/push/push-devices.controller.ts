import type { RegisterPushDevice } from "@veolms/contracts";
import type { FastifyRequest } from "fastify";

import type { PushDeviceService } from "./push-devices.service.ts";

export function createPushDeviceController({
  service,
}: {
  service: PushDeviceService;
}) {
  async function register(
    request: FastifyRequest<{ Body: RegisterPushDevice }>,
  ) {
    return await service.register(
      request.user!.id,
      request.session?.id ?? null,
      request.body,
    );
  }

  async function unregister(
    request: FastifyRequest<{ Params: { fid: string } }>,
  ) {
    return await service.unregister(request.user!.id, request.params.fid);
  }

  return { register, unregister };
}
