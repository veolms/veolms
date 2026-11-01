import type {
  StudentContactUpdateRequest,
  StudentListQuery,
  StudentUsernameParams,
} from "@veolms/contracts";
import type { FastifyReply, FastifyRequest } from "fastify";

import type { StudentsService } from "./students.service.ts";

export interface StudentsControllerOptions {
  service: StudentsService;
}

// Every route runs behind requireRoles, so the user is always present here.
const requireActor = (request: FastifyRequest) => {
  const user = request.user as NonNullable<FastifyRequest["user"]>;
  return { id: user.id, roles: user.roles };
};

export function createStudentsController({
  service,
}: StudentsControllerOptions) {
  async function list(
    request: FastifyRequest<{ Querystring: StudentListQuery }>,
    _reply: FastifyReply,
  ) {
    return await service.listStudents(request.query, requireActor(request));
  }

  async function getByUsername(
    request: FastifyRequest<{ Params: StudentUsernameParams }>,
    _reply: FastifyReply,
  ) {
    return await service.getStudentByUsername(
      request.params.username,
      requireActor(request),
    );
  }

  async function updateContact(
    request: FastifyRequest<{
      Params: StudentUsernameParams;
      Body: StudentContactUpdateRequest;
    }>,
    _reply: FastifyReply,
  ) {
    return await service.updateStudentContact(
      request.params.username,
      request.body,
      requireActor(request),
    );
  }

  return {
    list,
    getByUsername,
    updateContact,
  };
}

export type StudentsController = ReturnType<typeof createStudentsController>;
