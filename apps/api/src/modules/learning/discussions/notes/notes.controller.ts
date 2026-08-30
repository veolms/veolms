import type { FastifyReply, FastifyRequest } from "fastify";
import type { DatabaseExecutor } from "@veolms/database";
import type {
  CreateLearningNoteRequest,
  ListLearningNotesQuery,
  UpdateLearningNoteRequest,
} from "@veolms/contracts";
import type { NotesService } from "./notes.service.ts";

export interface NotesController {
  createNote(
    request: FastifyRequest<{ Body: CreateLearningNoteRequest }>,
    reply: FastifyReply,
  ): Promise<void>;

  getNote(
    request: FastifyRequest<{ Params: { noteId: string } }>,
    reply: FastifyReply,
  ): Promise<void>;

  listNotes(
    request: FastifyRequest<{ Querystring: ListLearningNotesQuery }>,
    reply: FastifyReply,
  ): Promise<void>;

  getCourseNotesOverview(
    request: FastifyRequest<{ Params: { courseId: string } }>,
    reply: FastifyReply,
  ): Promise<void>;

  updateNote(
    request: FastifyRequest<{
      Params: { noteId: string };
      Body: UpdateLearningNoteRequest;
    }>,
    reply: FastifyReply,
  ): Promise<void>;

  deleteNote(
    request: FastifyRequest<{ Params: { noteId: string } }>,
    reply: FastifyReply,
  ): Promise<void>;
}

export function createNotesController({
  database,
  service,
}: {
  database: DatabaseExecutor;
  service: NotesService;
}): NotesController {
  return {
    async createNote(request, reply) {
      const user = request.user!;
      const body = request.body;

      const note = await service.createNote(database, {
        ...body,
        userId: user.id,
      });

      reply.status(201).send(note);
    },

    async getNote(request, reply) {
      const user = request.user!;
      const { noteId } = request.params;

      const note = await service.getNote(database, noteId, user.id);
      reply.status(200).send(note);
    },

    async listNotes(request, reply) {
      const user = request.user!;
      const query = request.query;

      const result = await service.listNotes(database, user.id, query);
      reply.status(200).send(result);
    },

    async getCourseNotesOverview(request, reply) {
      const user = request.user!;
      const { courseId } = request.params;

      const result = await service.getCourseNotesOverview(
        database,
        courseId,
        user.id,
      );
      reply.status(200).send(result);
    },

    async updateNote(request, reply) {
      const user = request.user!;
      const { noteId } = request.params;
      const body = request.body;

      const updated = await service.updateNote(
        database,
        noteId,
        user.id,
        body,
      );
      reply.status(200).send(updated);
    },

    async deleteNote(request, reply) {
      const user = request.user!;
      const { noteId } = request.params;

      await service.deleteNote(database, noteId, user.id);
      reply.status(200).send({ message: "Note deleted successfully." });
    },
  };
}
