import {
  chatCompleteUploadResponseSchema,
  chatCreateUploadRequestSchema,
  chatCreateUploadResponseSchema,
  chatOkResponseSchema,
  chatReadUploadQuerySchema,
  chatRoomIconQuerySchema,
  chatRoomParamsSchema,
  chatUploadParamsSchema,
} from "@veolms/contracts";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { Readable } from "node:stream";

import { errorResponse } from "../../../lib/errors.ts";
import { jsonResponse } from "../../../lib/responses.ts";
import type { RoutePlugin } from "../../../lib/route-plugin.ts";
import { createPermissionPreHandlers } from "../../authorization/index.ts";
import { createMessagesService } from "../messages/messages.service.ts";
import {
  chatTags as tags,
  perUser,
  requireChatEnabled,
} from "../shared/chat.http.ts";
import { getChatRuntime } from "../shared/chat.runtime.ts";
import { createUploadsService } from "./uploads.service.ts";

const uploadsRoutes: RoutePlugin = async (app, options) => {
  const { signedIn } = createPermissionPreHandlers(options.database);
  const runtime = getChatRuntime(app, options.database);
  const service = createUploadsService(
    runtime,
    createMessagesService(runtime),
    options.services.storage,
  );
  const preHandler = [...signedIn, requireChatEnabled];
  const common = {
    401: errorResponse("Authentication required"),
    403: errorResponse("Not allowed"),
    404: errorResponse("Not found"),
  };

  // Development uploads (no object storage) send raw bytes of any type.
  app.addContentTypeParser("*", (_request, payload, done) => {
    done(null, payload);
  });

  app.post(
    "/chat/rooms/:roomId/uploads",
    {
      config: { rateLimit: perUser(60, "1 hour") },
      preHandler: [...preHandler],
      schema: {
        operationId: "createChatUpload",
        tags,
        summary: "Start uploading a photo, video, voice message or document",
        description:
          "Answers where to PUT the file (a presigned storage URL, bound to its type and size). Then call POST /chat/uploads/:uploadId/complete and send the message with `attachmentIds`.",
        params: chatRoomParamsSchema,
        body: chatCreateUploadRequestSchema,
        response: {
          200: jsonResponse("Where to upload", chatCreateUploadResponseSchema),
          400: errorResponse("Type or size not allowed"),
          429: errorResponse("Daily upload allowance used"),
          ...common,
        },
      },
    },
    async (
      request: FastifyRequest<{
        Params: { roomId: string };
        Body: {
          kind: "image" | "video" | "audio" | "file";
          name: string;
          mimeType: string;
          size: number;
          width?: number;
          height?: number;
          durationMs?: number;
          waveform?: number[];
        };
      }>,
    ) => service.create(request.user!.id, request.params.roomId, request.body),
  );

  app.put(
    "/chat/uploads/:uploadId/content",
    {
      bodyLimit: 110 * 1024 * 1024,
      preHandler,
      schema: {
        operationId: "putChatUploadContent",
        tags,
        summary:
          "Development only: upload the bytes to the API (no object storage)",
        params: chatUploadParamsSchema,
        response: {
          200: jsonResponse("Stored", chatOkResponseSchema),
          ...common,
        },
      },
    },
    async (request: FastifyRequest<{ Params: { uploadId: string } }>) =>
      service.putContent(
        request.user!.id,
        request.params.uploadId,
        request.body as Readable,
      ),
  );

  app.post(
    "/chat/uploads/:uploadId/complete",
    {
      preHandler,
      schema: {
        operationId: "completeChatUpload",
        tags,
        summary: "Confirm an upload finished (checks the stored size and type)",
        params: chatUploadParamsSchema,
        response: {
          200: jsonResponse("Ready to send", chatCompleteUploadResponseSchema),
          400: errorResponse("The stored file does not match"),
          ...common,
        },
      },
    },
    async (request: FastifyRequest<{ Params: { uploadId: string } }>) =>
      service.complete(request.user!.id, request.params.uploadId),
  );

  app.get(
    "/chat/rooms/:roomId/icon",
    {
      preHandler,
      schema: {
        operationId: "readChatRoomIcon",
        tags,
        summary:
          "A group's picture: its icon, else its course's picture (redirects)",
        params: chatRoomParamsSchema,
        querystring: chatRoomIconQuerySchema,
        response: { ...common },
      },
    },
    async (
      request: FastifyRequest<{ Params: { roomId: string } }>,
      reply: FastifyReply,
    ) => {
      const result = await service.icon(
        request.user!.id,
        request.params.roomId,
      );
      reply.header("X-Content-Type-Options", "nosniff");
      if (result.kind === "redirect") {
        reply.header("Cache-Control", `private, max-age=${result.maxAge}`);
        return reply.redirect(result.url, 302);
      }
      reply
        .header("Content-Type", result.mimeType)
        .header("Content-Length", String(result.size))
        .header("Content-Disposition", result.disposition)
        .header("Cache-Control", "private, max-age=3600")
        .header("Content-Security-Policy", "default-src 'none'; sandbox");
      return reply.send(result.stream);
    },
  );

  app.get(
    "/chat/uploads/:uploadId",
    {
      preHandler,
      schema: {
        operationId: "readChatUpload",
        tags,
        summary: "Open a file sent in a chat (redirects to a short-lived link)",
        params: chatUploadParamsSchema,
        querystring: chatReadUploadQuerySchema,
        response: { ...common },
      },
    },
    async (
      request: FastifyRequest<{
        Params: { uploadId: string };
        Querystring: { download?: "1" | "0" };
      }>,
      reply: FastifyReply,
    ) => {
      const result = await service.read(
        request.user!.id,
        request.params.uploadId,
        request.query.download === "1",
      );
      reply.header("X-Content-Type-Options", "nosniff");
      if (result.kind === "redirect") {
        reply.header("Cache-Control", `private, max-age=${result.maxAge}`);
        return reply.redirect(result.url, 302);
      }
      reply
        .header("Content-Type", result.mimeType)
        .header("Content-Length", String(result.size))
        .header("Content-Disposition", result.disposition)
        .header("Cache-Control", "private, max-age=3600")
        .header("Content-Security-Policy", "default-src 'none'; sandbox");
      return reply.send(result.stream);
    },
  );
};

export default uploadsRoutes;
