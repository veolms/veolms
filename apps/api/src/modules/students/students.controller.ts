import type {
  StudentContactUpdateRequest,
  StudentCreateRequest,
  StudentListQuery,
  StudentUsernameParams,
} from "@veolms/contracts";
import type { FastifyReply, FastifyRequest } from "fastify";

import type { StudentCreationService } from "./student-creation.service.ts";
import type { StudentsService } from "./students.service.ts";

export interface StudentsControllerOptions {
  service: StudentsService;
  creationService: StudentCreationService;
}

// Every route runs behind requireRoles, so the user is always present here.
const requireActor = (request: FastifyRequest) => {
  const user = request.user as NonNullable<FastifyRequest["user"]>;
  return { id: user.id, roles: user.roles };
};

export function createStudentsController({
  service,
  creationService,
}: StudentsControllerOptions) {
  async function create(
    request: FastifyRequest<{ Body: StudentCreateRequest }>,
    reply: FastifyReply,
  ) {
    const student = await creationService.createStudent(
      request.body,
      requireActor(request),
    );
    return reply.status(201).send(student);
  }

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
    create,
    list,
    getByUsername,
    updateContact,
  };
}

export type StudentsController = ReturnType<typeof createStudentsController>;
