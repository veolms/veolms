import {
  academyBrandResponseSchema,
  academyLogoCompleteRequestSchema,
  academyLogoPresignRequestSchema,
  academyLogoPresignResponseSchema,
  updateAcademyBrandRequestSchema,
  type AcademyLogoCompleteRequest,
  type AcademyLogoPresignRequest,
  type UpdateAcademyBrandRequest,
} from "@veolms/contracts";
import type { FastifyRequest } from "fastify";

import { errorResponse } from "../../lib/errors.ts";
import { jsonResponse } from "../../lib/responses.ts";
import type { RoutePlugin } from "../../lib/route-plugin.ts";
import { createPermissionPreHandlers } from "../authorization/index.ts";
import { createAcademyBrandService } from "./academy-brand.service.ts";

/**
 * The academy's name and logo, which its emails carry. Administrators only:
 * set during setup, changed here afterwards.
 */
const academyBrandRoutes: RoutePlugin = async (app, options) => {
  const { requires } = createPermissionPreHandlers(options.database);
  const service = createAcademyBrandService({
    database: options.database,
    storage: options.services.storage,
  });

  app.get(
    "/academy/brand",
    {
      preHandler: requires("platform.settings.read"),
      schema: {
        operationId: "getAcademyBrand",
        tags: ["Academy"],
        summary: "The academy's name and logo",
        response: {
          200: jsonResponse("The academy's brand.", academyBrandResponseSchema),
          401: errorResponse("Unauthorized"),
          403: errorResponse("Forbidden"),
        },
      },
    },
    async () => await service.readBrand(),
  );

  app.put(
    "/academy/brand",
    {
      preHandler: requires("platform.branding.update"),
      schema: {
        operationId: "updateAcademyBrand",
        tags: ["Academy"],
        summary: "Change the academy's name",
        body: updateAcademyBrandRequestSchema,
        response: {
          200: jsonResponse("The saved brand.", academyBrandResponseSchema),
          400: errorResponse("Invalid name"),
          401: errorResponse("Unauthorized"),
          403: errorResponse("Forbidden"),
          409: errorResponse("The academy has not been set up yet"),
        },
      },
    },
    async (request: FastifyRequest<{ Body: UpdateAcademyBrandRequest }>) =>
      await service.updateBrand(request.body),
  );

  app.post(
    "/academy/brand/logo/presign",
    {
      preHandler: requires("platform.branding.update"),
      schema: {
        operationId: "presignAcademyLogoUpload",
        tags: ["Academy"],
        summary: "Get an address to upload a new academy logo to",
        description:
          "The browser PUTs the PNG or JPEG straight to the returned address, then calls /academy/brand/logo/complete.",
        body: academyLogoPresignRequestSchema,
        response: {
          200: jsonResponse(
            "Where to upload the logo.",
            academyLogoPresignResponseSchema,
          ),
          400: errorResponse("Not a PNG or JPEG, or larger than 2 MB"),
          401: errorResponse("Unauthorized"),
          403: errorResponse("Forbidden"),
          409: errorResponse("The academy has not been set up yet"),
        },
      },
    },
    async (request: FastifyRequest<{ Body: AcademyLogoPresignRequest }>) =>
      await service.presignLogo(request.body),
  );

  app.post(
    "/academy/brand/logo/complete",
    {
      preHandler: requires("platform.branding.update"),
      schema: {
        operationId: "completeAcademyLogoUpload",
        tags: ["Academy"],
        summary: "Make an uploaded image the academy's logo",
        body: academyLogoCompleteRequestSchema,
        response: {
          200: jsonResponse("The saved brand.", academyBrandResponseSchema),
          400: errorResponse("The upload is missing or is not a PNG or JPEG"),
          401: errorResponse("Unauthorized"),
          403: errorResponse("Forbidden"),
          409: errorResponse("The academy has not been set up yet"),
        },
      },
    },
    async (request: FastifyRequest<{ Body: AcademyLogoCompleteRequest }>) =>
      await service.completeLogo(request.body),
  );

  app.delete(
    "/academy/brand/logo",
    {
      preHandler: requires("platform.branding.update"),
      schema: {
        operationId: "removeAcademyLogo",
        tags: ["Academy"],
        summary: "Remove the academy's logo",
        response: {
          200: jsonResponse("The saved brand.", academyBrandResponseSchema),
          401: errorResponse("Unauthorized"),
          403: errorResponse("Forbidden"),
          409: errorResponse("The academy has not been set up yet"),
        },
      },
    },
    async () => await service.removeLogo(),
  );
};

export default academyBrandRoutes;
