import {
  certificateDesignPresignRequestSchema,
  certificateDesignPresignResponseSchema,
  certificateDesignSchema,
  certificateDesignsResponseSchema,
  createCertificateDesignRequestSchema,
  previewCertificateDesignRequestSchema,
  updateCertificateDesignRequestSchema,
} from "@veolms/contracts";
import { z } from "zod";

import { errorResponse } from "../../lib/errors.ts";
import { jsonResponse } from "../../lib/responses.ts";
import type { RoutePlugin } from "../../lib/route-plugin.ts";
import { createPermissionPreHandlers } from "../authorization/index.ts";
import { createCertificateDesignsController } from "./certificate-designs.controller.ts";
import { createCertificateDesignsService } from "./certificate-designs.service.ts";
import { createCertificateSettingsService } from "./certificate-settings.service.ts";
import { getCertificateRenderPool } from "./render/certificate-render-pool.ts";

/**
 * Certificate designs (Platform > Certificates): blank sheets staff upload,
 * where the details go on each, and which one certificates are drawn on.
 * For staff with `certificate.issue` (administrators and instructors).
 */
const certificateDesignsRoutes: RoutePlugin = async (app, options) => {
  const { requires } = createPermissionPreHandlers(options.database);
  const settings = createCertificateSettingsService({
    database: options.database,
    storage: options.services.storage,
    logger: app.log,
  });
  const service = createCertificateDesignsService({
    database: options.database,
    storage: options.services.storage,
    renderPool: getCertificateRenderPool(),
    logger: app.log,
    signatureBytes: settings.signatureBytes,
  });
  const manage = requires("certificate.issue", "platform");
  const tags = ["Certificates"];
  const designParams = z.object({
    designId: z.union([z.uuid(), z.literal("builtin")]),
  });
  const controller = createCertificateDesignsController({ service });

  app.get(
    "/certificates/designs",
    {
      preHandler: manage,
      schema: {
        operationId: "listCertificateDesigns",
        tags,
        summary: "The certificate designs, the built-in one first",
        response: {
          200: jsonResponse("Every design.", certificateDesignsResponseSchema),
          401: errorResponse("Unauthorized"),
          403: errorResponse("Forbidden"),
        },
      },
    },
    controller.list,
  );

  app.post(
    "/certificates/designs/presign",
    {
      preHandler: manage,
      config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
      schema: {
        operationId: "presignCertificateDesign",
        tags,
        summary: "Get an address to upload a design's sheet to",
        description:
          "The browser PUTs the PDF, PNG or JPEG (15 MB at most) straight to the address, then calls POST /certificates/designs.",
        body: certificateDesignPresignRequestSchema,
        response: {
          200: jsonResponse(
            "Where to upload.",
            certificateDesignPresignResponseSchema,
          ),
          401: errorResponse("Unauthorized"),
          403: errorResponse("Forbidden"),
        },
      },
    },
    controller.presign,
  );

  app.post(
    "/certificates/designs",
    {
      preHandler: manage,
      config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
      schema: {
        operationId: "createCertificateDesign",
        tags,
        summary: "Save an uploaded sheet as a design",
        description:
          "Checks the file (type, size, readable, a certificate can be drawn on it) and saves it, not finalised. A file that fails is deleted.",
        body: createCertificateDesignRequestSchema,
        response: {
          200: jsonResponse("The new design.", certificateDesignSchema),
          400: errorResponse("The file cannot carry certificates"),
          401: errorResponse("Unauthorized"),
          403: errorResponse("Forbidden"),
        },
      },
    },
    controller.create,
  );

  app.patch(
    "/certificates/designs/:designId",
    {
      preHandler: manage,
      schema: {
        operationId: "updateCertificateDesign",
        tags,
        summary: "Rename a design, or move its details",
        params: designParams,
        body: updateCertificateDesignRequestSchema,
        response: {
          200: jsonResponse("The design as saved.", certificateDesignSchema),
          401: errorResponse("Unauthorized"),
          403: errorResponse("Forbidden"),
          404: errorResponse("Design not found"),
          409: errorResponse("The built-in design cannot be changed"),
        },
      },
    },
    controller.update,
  );

  app.post(
    "/certificates/designs/:designId/activate",
    {
      preHandler: manage,
      schema: {
        operationId: "activateCertificateDesign",
        tags,
        summary: "Finalise a design: certificates are drawn on it from now on",
        params: designParams,
        response: {
          200: jsonResponse("Every design.", certificateDesignsResponseSchema),
          401: errorResponse("Unauthorized"),
          403: errorResponse("Forbidden"),
          404: errorResponse("Design not found"),
          503: errorResponse("The design's file could not be read"),
        },
      },
    },
    controller.activate,
  );

  app.delete(
    "/certificates/designs/:designId",
    {
      preHandler: manage,
      schema: {
        operationId: "deleteCertificateDesign",
        tags,
        summary: "Delete a design that is not finalised",
        params: designParams,
        response: {
          200: jsonResponse("Deleted.", z.object({ deleted: z.literal(true) })),
          401: errorResponse("Unauthorized"),
          403: errorResponse("Forbidden"),
          404: errorResponse("Design not found"),
          409: errorResponse("Finalised, or the built-in design"),
        },
      },
    },
    controller.remove,
  );

  app.get(
    "/certificates/designs/:designId/file",
    {
      preHandler: manage,
      schema: {
        operationId: "readCertificateDesignFile",
        tags,
        summary: "The design's uploaded sheet, for the editor",
        params: designParams,
        response: {
          401: errorResponse("Unauthorized"),
          403: errorResponse("Forbidden"),
          404: errorResponse("Design not found"),
        },
      },
    },
    controller.file,
  );

  app.post(
    "/certificates/designs/:designId/preview",
    {
      preHandler: manage,
      config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
      schema: {
        operationId: "previewCertificateDesign",
        tags,
        summary: "A sample certificate on a design",
        description:
          "Made-up learner and course, with the given (unsaved) layout or the saved one.",
        params: designParams,
        body: previewCertificateDesignRequestSchema,
        response: {
          401: errorResponse("Unauthorized"),
          403: errorResponse("Forbidden"),
          404: errorResponse("Design not found"),
        },
      },
    },
    controller.preview,
  );
};

export default certificateDesignsRoutes;
