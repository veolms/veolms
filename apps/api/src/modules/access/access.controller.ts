import type { FastifyReply, FastifyRequest } from "fastify";
import type {
  CourseAccessChangeResponse,
  CourseAccessParams,
  CreateManualAccessGrantRequest,
} from "@veolms/contracts";
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
  revokeCourseAccess(
    request: FastifyRequest<{ Params: CourseAccessParams }>,
  ): Promise<CourseAccessChangeResponse>;
  restoreCourseAccess(
    request: FastifyRequest<{ Params: CourseAccessParams }>,
  ): Promise<CourseAccessChangeResponse>;
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
      // Only an absent or null value means lifetime. An empty string used to
      // fall through to lifetime too; it now reaches the service as an
      // unreadable date and is refused there (INVALID_VALID_UNTIL).
      validUntil:
        validUntil === undefined || validUntil === null
          ? null
          : new Date(validUntil),
    });
    await reply.status(201).send(result);
  }

  async function revokeAccessGrant(
    request: FastifyRequest<{ Params: { grantId: string } }>,
    reply: FastifyReply,
  ) {
    const { grantId } = request.params;
    await service.revokeAccessGrantById(database, grantId);
    await reply
      .status(200)
      .send({ message: "Access grant revoked successfully." });
  }

  async function revokeCourseAccess(
    request: FastifyRequest<{ Params: CourseAccessParams }>,
  ): Promise<CourseAccessChangeResponse> {
    const { userId, courseId } = request.params;
    await service.revokeCourseAccess(database, userId, courseId);
    return { userId, courseId, status: "revoked" };
  }

  async function restoreCourseAccess(
    request: FastifyRequest<{ Params: CourseAccessParams }>,
  ): Promise<CourseAccessChangeResponse> {
    const { userId, courseId } = request.params;
    await service.restoreCourseAccess(database, userId, courseId);
    return { userId, courseId, status: "active" };
  }

  async function listUserGrants(
    request: FastifyRequest<{ Params: { userId: string } }>,
    reply: FastifyReply,
  ) {
    const { userId } = request.params;
    const grants = await service.listUserGrants(database, userId);
    await reply.status(200).send(grants);
  }

  return {
    grantManualAccess,
    revokeAccessGrant,
    revokeCourseAccess,
    restoreCourseAccess,
    listUserGrants,
  };
}
