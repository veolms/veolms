import type { FastifyReply, FastifyRequest } from "fastify";
import type { CreateManualAccessGrantRequest } from "@veolms/contracts";
import type { AccessService } from "./access.service.ts";
import type { Executor } from "./access.repository.ts";

export interface AccessController {
  grantManualAccess(
    request: FastifyRequest<{ Body: CreateManualAccessGrantRequest }>,
    reply: FastifyReply,
  ): Promise<void>;
  revokeAccessGrant(
    request: FastifyRequest<{ Params: { grantId: string } }>,
    reply: FastifyReply,
  ): Promise<void>;
  listUserGrants(
    request: FastifyRequest<{ Params: { userId: string } }>,
    reply: FastifyReply,
  ): Promise<void>;
}

export function createAccessController({
  database,
  service,
}: {
  database: Executor;
  service: AccessService;
}): AccessController {
  async function grantManualAccess(
    request: FastifyRequest<{ Body: CreateManualAccessGrantRequest }>,
    reply: FastifyReply,
  ) {
    const { userId, courseId, validUntil } = request.body;
    const result = await service.grantManualAccess(database, {
      userId,
      courseId,
      validUntil: validUntil ? new Date(validUntil) : null,
    });
    reply.status(201).send(result);
  }

  async function revokeAccessGrant(
    request: FastifyRequest<{ Params: { grantId: string } }>,
    reply: FastifyReply,
  ) {
    const { grantId } = request.params;
    await service.revokeAccessGrantById(database, grantId);
    reply.status(200).send({ message: "Access grant revoked successfully." });
  }

  async function listUserGrants(
    request: FastifyRequest<{ Params: { userId: string } }>,
    reply: FastifyReply,
  ) {
    const { userId } = request.params;
    const grants = await service.listUserGrants(database, userId);
    reply.status(200).send(grants);
  }

  return {
    grantManualAccess,
    revokeAccessGrant,
    listUserGrants,
  };
}
