import {
  contactChangeCodeRequestSchema,
  contactChangeCompletedResponseSchema,
  contactChangeConfirmRequestSchema,
  contactChangeNewValueRequestSchema,
  contactChangeResponseSchema,
  contactChangeStartRequestSchema,
} from "@veolms/contracts";
import { z } from "zod";

import { createAcademyBrandService } from "../../academy/academy-brand.service.ts";
import { errorResponse } from "../../../lib/errors.ts";
import { jsonResponse } from "../../../lib/responses.ts";
import type { RoutePlugin } from "../../../lib/route-plugin.ts";
import { createAuthContext } from "../shared/auth.context.ts";
import { createContactChangeController } from "./contact-change.controller.ts";
import { createContactChangeService } from "./contact-change.service.ts";

const params = z.object({ changeId: z.uuid() });
const tags = ["Auth"];

/**
 * Changing one's own email address or mobile number: the current value is
 * proven with a code, then the new one (contact-change.rules.ts). Behind
 * two-factor verification, like every other change to the account.
 */
const contactChangeRoutes: RoutePlugin = async (app, options) => {
  const context = createAuthContext(options);
  const academyBrand = createAcademyBrandService({
    database: options.database,
  });
  const controller = createContactChangeController(
    createContactChangeService({
      database: options.database,
      otpService: context.otpService,
      sessionService: context.sessionService,
      services: options.services,
      getAcademyBrand: academyBrand.getBrand,
      log: app.log,
    }),
  );
  // Each one may send a code or check one: held to the code routes' limits.
  const sends = { rateLimit: { max: 5, timeWindow: "1 minute" } };
  const checks = { rateLimit: { max: 10, timeWindow: "1 minute" } };

  app.post(
    "/auth/me/contact-changes",
    {
      config: sends,
      schema: {
        operationId: "startContactChange",
        tags,
        summary: "Start changing your email address or mobile number",
        description:
          "Sends a code to the account's current, confirmed value. A value never confirmed needs no code: the change goes straight to the new value.",
        body: contactChangeStartRequestSchema,
        response: {
          200: jsonResponse(
            "The change, and its next step.",
            contactChangeResponseSchema,
          ),
          429: errorResponse("Rate limit exceeded."),
          503: errorResponse("Verification code could not be delivered."),
        },
      },
      preHandler: context.mfaVerified,
    },
    controller.start,
  );

  app.post(
    "/auth/me/contact-changes/:changeId/current",
    {
      config: checks,
      schema: {
        operationId: "proveCurrentContact",
        tags,
        summary: "Prove the current email address or mobile number",
        params,
        body: contactChangeCodeRequestSchema,
        response: {
          200: jsonResponse(
            "Proven: the new value is next.",
            contactChangeResponseSchema,
          ),
          400: errorResponse("Wrong or expired code, or the change is over."),
          404: errorResponse("Change not found."),
          409: errorResponse("The account's value changed in the meantime."),
        },
      },
      preHandler: context.mfaVerified,
    },
    controller.proveCurrent,
  );

  app.post(
    "/auth/me/contact-changes/:changeId/new",
    {
      config: sends,
      schema: {
        operationId: "sendNewContactCode",
        tags,
        summary: "Send a code to the new email address or mobile number",
        params,
        body: contactChangeNewValueRequestSchema,
        response: {
          200: jsonResponse(
            "Code sent to the new value.",
            contactChangeResponseSchema,
          ),
          400: errorResponse(
            "Not a valid value, the same one, or a step out of turn.",
          ),
          404: errorResponse("Change not found."),
          409: errorResponse("Already linked to another account."),
          429: errorResponse("Rate limit exceeded."),
          503: errorResponse("Verification code could not be delivered."),
        },
      },
      preHandler: context.mfaVerified,
    },
    controller.sendToNew,
  );

  app.post(
    "/auth/me/contact-changes/:changeId/confirm",
    {
      config: checks,
      schema: {
        operationId: "confirmNewContact",
        tags,
        summary: "Confirm the new email address or mobile number",
        description:
          "Puts the confirmed value on the account, signs out the account's other devices, and tells its email address.",
        params,
        body: contactChangeConfirmRequestSchema,
        response: {
          200: jsonResponse("Changed.", contactChangeCompletedResponseSchema),
          400: errorResponse("Wrong or expired code, or the change is over."),
          404: errorResponse("Change not found."),
          409: errorResponse("Already linked to another account."),
        },
      },
      preHandler: context.mfaVerified,
    },
    controller.confirmNew,
  );
};

export default contactChangeRoutes;
