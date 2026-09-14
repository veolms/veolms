import { z } from "zod";
import type { FastifyReply } from "fastify";
import { errorResponse } from "../../lib/errors.ts";
import type { RoutePlugin } from "../../lib/route-plugin.ts";
import { avatarKey, legacyAvatarKey } from "./avatar-storage.ts";

/**
 * Serves stored avatars publicly (no auth): a profile photo needs to render
 * for anyone viewing a public profile, including signed-out visitors, so
 * this intentionally does not use the auth module's session middleware.
 */
const avatarRoutes: RoutePlugin = async (app, options) => {
  app.get(
    "/avatars/:userId",
    {
      schema: {
        operationId: "getAvatar",
        tags: ["Profile"],
        summary: "Serve a stored profile avatar",
        params: z.object({ userId: z.uuid() }),
        response: {
          404: errorResponse("Avatar not found"),
        },
      },
    },
    async (request, reply) => {
      const object =
        (await options.services.storage.getObject(
          avatarKey(request.params.userId),
        )) ??
        (await options.services.storage.getObject(
          legacyAvatarKey(request.params.userId),
        ));
      if (!object) {
        return reply.code(404).send({
          success: false,
          statusCode: 404,
          error: "Not Found",
          message: "Avatar not found.",
        });
      }

      return (reply as FastifyReply)
        .header(
          "Content-Type",
          object.contentType ?? "application/octet-stream",
        )
        .header("Cache-Control", "public, max-age=300")
        .send(object.body);
    },
  );
};

export default avatarRoutes;
