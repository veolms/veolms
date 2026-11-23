import {
  approveStorageRequestSchema,
  blockStorageRequestSchema,
  createStorageRequestSchema,
  declineStorageRequestSchema,
  deleteStorageFilesRequestSchema,
  deleteStorageFilesResponseSchema,
  storageFilesQuerySchema,
  storageFilesResponseSchema,
  myStorageResponseSchema,
  setStorageLimitRequestSchema,
  storageLearnerDetailResponseSchema,
  storageLearnerParamsSchema,
  storageLearnerResponseSchema,
  storageLearnersQuerySchema,
  storageLearnersResponseSchema,
  storageRequestParamsSchema,
  storageRequestResponseSchema,
  storageSettingsSchema,
  updateStorageSettingsRequestSchema,
} from "@veolms/contracts";
import { normalizeIP } from "@fastify/rate-limit";
import type { FastifyRequest } from "fastify";

import { errorResponse } from "../../lib/errors.ts";
import { jsonResponse } from "../../lib/responses.ts";
import type { RoutePlugin } from "../../lib/route-plugin.ts";
import { createPermissionPreHandlers } from "../authorization/index.ts";
import { createMyFilesService } from "./my-files.service.ts";
import { createStorageController } from "./storage.controller.ts";
import { createStorageService } from "./storage.service.ts";

const tags = ["Storage"];

/**
 * Learners' storage space. A learner sees their own space and asks for
 * more; admins (`storage.read`, `storage.manage`) see everyone's, answer
 * requests, set limits and block uploads (Settings > Student storage).
 * Uploads are refused in the chat, discussion and support modules through
 * `StorageService.assertCanStore`.
 */
const storageRoutes: RoutePlugin = async (app, options) => {
  const { signedIn, requires } = createPermissionPreHandlers(options.database);
  const service = createStorageService({ database: options.database });
  const controller = createStorageController({ service });
  const myFiles = createMyFilesService({
    app,
    database: options.database,
    services: options.services,
  });
  const read = requires("storage.read");
  const manage = requires("storage.manage");
  const common = {
    401: errorResponse("Unauthorized"),
    403: errorResponse("Forbidden"),
  };

  app.get(
    "/storage/me",
    {
      preHandler: signedIn,
      schema: {
        operationId: "getMyStorage",
        tags,
        summary: "My storage space: used, limit, and my request for more",
        response: {
          200: jsonResponse("My space", myStorageResponseSchema),
          ...common,
        },
      },
    },
    controller.mine,
  );

  app.post(
    "/storage/me/requests",
    {
      preHandler: signedIn,
      config: {
        rateLimit: {
          max: 20,
          timeWindow: "1 hour",
          hook: "preHandler",
          keyGenerator: (request: FastifyRequest) =>
            request.user?.id ?? normalizeIP(request.ip),
        },
      },
      schema: {
        operationId: "requestMoreStorage",
        tags,
        summary: "Ask an admin for more space",
        description:
          "One open request at a time: asking again returns the open one.",
        body: createStorageRequestSchema,
        response: {
          200: jsonResponse("The open request", storageRequestResponseSchema),
          400: errorResponse("This account has no limit"),
          ...common,
        },
      },
    },
    controller.requestMore,
  );

  app.post(
    "/storage/me/requests/cancel",
    {
      preHandler: signedIn,
      schema: {
        operationId: "cancelMyStorageRequest",
        tags,
        summary: "Withdraw my open request for more space",
        response: {
          200: jsonResponse(
            "The withdrawn request",
            storageRequestResponseSchema,
          ),
          404: errorResponse("No open request"),
          ...common,
        },
      },
    },
    controller.cancelRequest,
  );

  app.get(
    "/storage/me/files",
    {
      preHandler: signedIn,
      schema: {
        operationId: "listMyStorageFiles",
        tags,
        summary: "My files that take space, a page at a time",
        querystring: storageFilesQuerySchema,
        response: {
          200: jsonResponse(
            "One page, with totals",
            storageFilesResponseSchema,
          ),
          ...common,
        },
      },
    },
    async (request) =>
      myFiles.list(request.user!.id, {
        sort: request.query.sort,
        kind: request.query.kind,
        offset: request.query.offset,
        limit: request.query.limit,
      }),
  );

  app.post(
    "/storage/me/files/delete",
    {
      preHandler: signedIn,
      config: {
        rateLimit: {
          max: 120,
          timeWindow: "1 hour",
          hook: "preHandler",
          keyGenerator: (request: FastifyRequest) =>
            request.user?.id ?? normalizeIP(request.ip),
        },
      },
      schema: {
        operationId: "deleteMyStorageFiles",
        tags,
        summary: "Delete some of my files to free space",
        description:
          "Only the caller's own files are deleted. A chat file's message stays and shows that the file was deleted.",
        body: deleteStorageFilesRequestSchema,
        response: {
          200: jsonResponse("What was freed", deleteStorageFilesResponseSchema),
          ...common,
        },
      },
    },
    async (request) => myFiles.remove(request.user!.id, request.body.files),
  );

  app.get(
    "/storage/learners",
    {
      preHandler: read,
      schema: {
        operationId: "listStorageLearners",
        tags,
        summary: "Every student's space, a page at a time",
        querystring: storageLearnersQuerySchema,
        response: {
          200: jsonResponse(
            "One page, with totals",
            storageLearnersResponseSchema,
          ),
          ...common,
        },
      },
    },
    controller.listLearners,
  );

  app.get(
    "/storage/learners/:userId",
    {
      preHandler: read,
      schema: {
        operationId: "getStorageLearner",
        tags,
        summary: "One student's space, requests and history of changes",
        params: storageLearnerParamsSchema,
        response: {
          200: jsonResponse("The student", storageLearnerDetailResponseSchema),
          404: errorResponse("Not a student"),
          ...common,
        },
      },
    },
    controller.learnerDetail,
  );

  app.put(
    "/storage/learners/:userId/limit",
    {
      preHandler: manage,
      schema: {
        operationId: "setStorageLimit",
        tags,
        summary: "Set a student's limit, or back to the default (null)",
        description:
          "An open request the new limit answers (more than they had) is marked approved.",
        params: storageLearnerParamsSchema,
        body: setStorageLimitRequestSchema,
        response: {
          200: jsonResponse("The student", storageLearnerResponseSchema),
          404: errorResponse("Not a student"),
          ...common,
        },
      },
    },
    controller.setLimit,
  );

  app.post(
    "/storage/learners/:userId/block",
    {
      preHandler: manage,
      schema: {
        operationId: "blockStorageUploads",
        tags,
        summary:
          "Stop a student uploading any file (the reason is shown to them)",
        params: storageLearnerParamsSchema,
        body: blockStorageRequestSchema,
        response: {
          200: jsonResponse("The student", storageLearnerResponseSchema),
          404: errorResponse("Not a student"),
          ...common,
        },
      },
    },
    controller.block,
  );

  app.post(
    "/storage/learners/:userId/unblock",
    {
      preHandler: manage,
      schema: {
        operationId: "unblockStorageUploads",
        tags,
        summary: "Let a blocked student upload again",
        params: storageLearnerParamsSchema,
        response: {
          200: jsonResponse("The student", storageLearnerResponseSchema),
          404: errorResponse("Not a student"),
          ...common,
        },
      },
    },
    controller.unblock,
  );

  app.post(
    "/storage/learners/:userId/recount",
    {
      preHandler: manage,
      schema: {
        operationId: "recountStorage",
        tags,
        summary: "Recompute a student's space from their files",
        params: storageLearnerParamsSchema,
        response: {
          200: jsonResponse("The student", storageLearnerResponseSchema),
          404: errorResponse("Not a student"),
          ...common,
        },
      },
    },
    controller.recount,
  );

  app.post(
    "/storage/requests/:requestId/approve",
    {
      preHandler: manage,
      schema: {
        operationId: "approveStorageRequest",
        tags,
        summary: "Give the student the space asked for (their new limit)",
        params: storageRequestParamsSchema,
        body: approveStorageRequestSchema,
        response: {
          200: jsonResponse("The student", storageLearnerResponseSchema),
          404: errorResponse("No such request"),
          409: errorResponse("Already answered"),
          ...common,
        },
      },
    },
    controller.approve,
  );

  app.post(
    "/storage/requests/:requestId/decline",
    {
      preHandler: manage,
      schema: {
        operationId: "declineStorageRequest",
        tags,
        summary: "Turn down a request (the note is shown to the student)",
        params: storageRequestParamsSchema,
        body: declineStorageRequestSchema,
        response: {
          200: jsonResponse("The student", storageLearnerResponseSchema),
          404: errorResponse("No such request"),
          409: errorResponse("Already answered"),
          ...common,
        },
      },
    },
    controller.decline,
  );

  app.get(
    "/storage/settings",
    {
      preHandler: read,
      schema: {
        operationId: "getStorageSettings",
        tags,
        summary: "The default space every student has",
        response: {
          200: jsonResponse("The settings", storageSettingsSchema),
          ...common,
        },
      },
    },
    controller.settings,
  );

  app.put(
    "/storage/settings",
    {
      preHandler: manage,
      schema: {
        operationId: "updateStorageSettings",
        tags,
        summary: "Change the default space every student has",
        body: updateStorageSettingsRequestSchema,
        response: {
          200: jsonResponse("The settings", storageSettingsSchema),
          ...common,
        },
      },
    },
    controller.updateSettings,
  );
};

export default storageRoutes;
