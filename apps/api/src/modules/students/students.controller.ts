import type {
  StudentListQuery,
  StudentUsernameParams,
} from "@veolms/contracts";
import type { FastifyReply, FastifyRequest } from "fastify";

import type { StudentsService } from "./students.service.ts";

export interface StudentsControllerOptions {
  service: StudentsService;
}

export function createStudentsController({
  service,
}: StudentsControllerOptions) {
  async function list(
    request: FastifyRequest<{ Querystring: StudentListQuery }>,
    _reply: FastifyReply,
  ) {
    return await service.listStudents(request.query);
  }

  async function getByUsername(
    request: FastifyRequest<{ Params: StudentUsernameParams }>,
    _reply: FastifyReply,
  ) {
    return await service.getStudentByUsername(request.params.username);
  }

  return {
    list,
    getByUsername,
  };
}

export type StudentsController = ReturnType<typeof createStudentsController>;
