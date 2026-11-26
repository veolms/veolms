import {
  certificateAcademySettingsSchema,
  certificateImageKindSchema,
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
 * the signature, badge and background. For staff with `certificate.issue` (administrators and
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

  // The images: /certificates/settings/{signature,badge,background}.
  const kindParams = z.strictObject({ kind: certificateImageKindSchema });

  app.post(
    "/certificates/settings/:kind/presign",
    {
      preHandler: manage,
      config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
      schema: {
        operationId: "presignCertificateImage",
        tags,
        summary: "Get an address to upload a signature, badge or background to",
        description:
          "The browser PUTs the PNG or JPEG straight there (signature 2 MB, badge 5 MB, background 10 MB at most), then calls POST /certificates/settings/{kind}.",
        params: kindParams,
        body: certificateSignaturePresignRequestSchema,
        response: {
          200: jsonResponse(
            "Where to upload.",
            z.strictObject({ uploadId: z.uuid(), uploadUrl: z.string() }),
          ),
          400: errorResponse("The file is too large"),
          ...common,
        },
      },
    },
    controller.presignImage,
  );

  app.post(
    "/certificates/settings/:kind",
    {
      preHandler: manage,
      config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
      schema: {
        operationId: "saveCertificateImage",
        tags,
        summary:
          "Print an uploaded signature, badge or background on certificates",
        params: kindParams,
        body: certificateSignatureCompleteRequestSchema,
        response: {
          200: saved,
          400: errorResponse("The image cannot be printed"),
          ...common,
        },
      },
    },
    controller.completeImage,
  );

  app.delete(
    "/certificates/settings/:kind",
    {
      preHandler: manage,
      schema: {
        operationId: "removeCertificateImage",
        tags,
        summary: "Go back to the design's own signature, badge or background",
        params: kindParams,
        response: { 200: saved, ...common },
      },
    },
    controller.removeImage,
  );

  app.get(
    "/certificates/settings/:kind/file",
    {
      preHandler: manage,
      schema: {
        operationId: "readCertificateImage",
        tags,
        summary: "An uploaded signature, badge or background image",
        params: kindParams,
        response: { ...common, 404: errorResponse("Nothing uploaded") },
      },
    },
    controller.imageFile,
  );
};

export default certificateSettingsRoutes;
