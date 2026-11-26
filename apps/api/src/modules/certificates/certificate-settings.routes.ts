import {
  certificateAcademySettingsSchema,
  certificateSignatureCompleteRequestSchema,
  certificateSignaturePresignRequestSchema,
  updateCertificateAcademySettingsRequestSchema,
} from "@veolms/contracts";
import { z } from "zod";

import { errorResponse } from "../../lib/errors.ts";
import { jsonResponse } from "../../lib/responses.ts";
import type { RoutePlugin } from "../../lib/route-plugin.ts";
import { createPermissionPreHandlers } from "../authorization/index.ts";
import { createCertificateSettingsController } from "./certificate-settings.controller.ts";
import { createCertificateSettingsService } from "./certificate-settings.service.ts";

/**
 * The academy's certificate settings (Platform > Certificates): the share
 * of lessons courses ask for by default, automatic issue and email, and
 * the signature. For staff with `certificate.issue` (administrators and
 * instructors).
 */
const certificateSettingsRoutes: RoutePlugin = async (app, options) => {
  const { requires } = createPermissionPreHandlers(options.database);
  const service = createCertificateSettingsService({
    database: options.database,
    storage: options.services.storage,
    logger: app.log,
  });
  const controller = createCertificateSettingsController({ service });
  const manage = requires("certificate.issue", "platform");
  const tags = ["Certificates"];
  const common = {
    401: errorResponse("Unauthorized"),
    403: errorResponse("Forbidden"),
  };
  const saved = jsonResponse(
    "The settings as saved.",
    certificateAcademySettingsSchema,
  );

  app.get(
    "/certificates/settings",
    {
      preHandler: manage,
      schema: {
        operationId: "getCertificateSettings",
        tags,
        summary: "The academy's certificate settings",
        response: { 200: saved, ...common },
      },
    },
    controller.get,
  );

  app.put(
    "/certificates/settings",
    {
      preHandler: manage,
      schema: {
        operationId: "updateCertificateSettings",
        tags,
        summary: "Change the default share of lessons, or automatic issue",
        body: updateCertificateAcademySettingsRequestSchema,
        response: { 200: saved, ...common },
      },
    },
    controller.update,
  );

  app.post(
    "/certificates/settings/signature/presign",
    {
      preHandler: manage,
      config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
      schema: {
        operationId: "presignCertificateSignature",
        tags,
        summary: "Get an address to upload a signature to",
        description:
          "The browser PUTs the PNG or JPEG (2 MB at most) straight there, then calls POST /certificates/settings/signature.",
        body: certificateSignaturePresignRequestSchema,
        response: {
          200: jsonResponse(
            "Where to upload.",
            z.strictObject({ uploadId: z.uuid(), uploadUrl: z.string() }),
          ),
          ...common,
        },
      },
    },
    controller.presignSignature,
  );

  app.post(
    "/certificates/settings/signature",
    {
      preHandler: manage,
      config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
      schema: {
        operationId: "saveCertificateSignature",
        tags,
        summary: "Make an uploaded image the signature on certificates",
        body: certificateSignatureCompleteRequestSchema,
        response: {
          200: saved,
          400: errorResponse("The image cannot be printed"),
          ...common,
        },
      },
    },
    controller.completeSignature,
  );

  app.delete(
    "/certificates/settings/signature",
    {
      preHandler: manage,
      schema: {
        operationId: "removeCertificateSignature",
        tags,
        summary: "Stop printing the uploaded signature",
        response: { 200: saved, ...common },
      },
    },
    controller.removeSignature,
  );

  app.get(
    "/certificates/settings/signature/file",
    {
      preHandler: manage,
      schema: {
        operationId: "readCertificateSignature",
        tags,
        summary: "The uploaded signature image",
        response: { ...common, 404: errorResponse("No signature uploaded") },
      },
    },
    controller.signatureFile,
  );
};

export default certificateSettingsRoutes;
