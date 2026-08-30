import { z } from "zod";
import {
  createLearningNoteRequestSchema,
  learningNoteSchema,
  learningNotesListResponseSchema,
  listLearningNotesQuerySchema,
  updateLearningNoteRequestSchema,
} from "@veolms/contracts";
import { errorResponse } from "../../../lib/errors.ts";
import { jsonResponse } from "../../../lib/responses.ts";
import type { RoutePlugin } from "../../../lib/route-plugin.ts";
import { createLearningInteractionsContext } from "../shared/learning-interactions.context.ts";
import { createNotesController } from "./notes.controller.ts";
import { createNotesRepository } from "./notes.repository.ts";
import { createNotesService } from "./notes.service.ts";

const notesRoutes: RoutePlugin = async (app, options) => {
  const ctx = createLearningInteractionsContext(options);
  const repo = createNotesRepository();
  const service = createNotesService(repo);
  const controller = createNotesController({
    database: options.database,
    service,
  });

  // 1. GET /learning-notes - List user's notes
  app.get(
    "/learning-notes",
    {
      preHandler: [ctx.authenticate, ctx.requireAuthenticated],
      schema: {
        operationId: "listLearningNotes",
        tags: ["Learning Notes"],
        summary: "List private and lecture-linked notes with search",
        querystring: listLearningNotesQuerySchema,
        response: {
          200: jsonResponse(
            "List of user notes",
            learningNotesListResponseSchema,
          ),
          401: errorResponse("Unauthorized"),
        },
      },
    },
    controller.listNotes,
  );

  // 2. POST /learning-notes - Create a new note
  app.post(
    "/learning-notes",
    {
      preHandler: [ctx.authenticate, ctx.requireAuthenticated],
      schema: {
        operationId: "createLearningNote",
        tags: ["Learning Notes"],
        summary: "Create a private, timestamped, lecture-linked note",
        body: createLearningNoteRequestSchema,
        response: {
          201: jsonResponse("Note created", learningNoteSchema),
          400: errorResponse("Invalid input"),
          401: errorResponse("Unauthorized"),
        },
      },
    },
    controller.createNote,
  );

  // 3. GET /learning-notes/:noteId - Get note
  app.get(
    "/learning-notes/:noteId",
    {
      preHandler: [ctx.authenticate, ctx.requireAuthenticated],
      schema: {
        operationId: "getLearningNote",
        tags: ["Learning Notes"],
        summary: "Get note details",
        params: z.object({ noteId: z.uuid() }),
        response: {
          200: jsonResponse("Note details", learningNoteSchema),
          401: errorResponse("Unauthorized"),
          403: errorResponse("Forbidden"),
          404: errorResponse("Note not found"),
        },
      },
    },
    controller.getNote,
  );

  // 4. PATCH /learning-notes/:noteId - Update note
  app.patch(
    "/learning-notes/:noteId",
    {
      preHandler: [ctx.authenticate, ctx.requireAuthenticated],
      schema: {
        operationId: "updateLearningNote",
        tags: ["Learning Notes"],
        summary: "Update note content or timestamp",
        params: z.object({ noteId: z.uuid() }),
        body: updateLearningNoteRequestSchema,
        response: {
          200: jsonResponse("Note updated", learningNoteSchema),
          401: errorResponse("Unauthorized"),
          403: errorResponse("Forbidden"),
          404: errorResponse("Note not found"),
        },
      },
    },
    controller.updateNote,
  );

  // 5. DELETE /learning-notes/:noteId - Delete note
  app.delete(
    "/learning-notes/:noteId",
    {
      preHandler: [ctx.authenticate, ctx.requireAuthenticated],
      schema: {
        operationId: "deleteLearningNote",
        tags: ["Learning Notes"],
        summary: "Delete a note",
        params: z.object({ noteId: z.uuid() }),
        response: {
          200: jsonResponse("Note deleted", z.object({ message: z.string() })),
          401: errorResponse("Unauthorized"),
          403: errorResponse("Forbidden"),
          404: errorResponse("Note not found"),
        },
      },
    },
    controller.deleteNote,
  );
};

export default notesRoutes;
