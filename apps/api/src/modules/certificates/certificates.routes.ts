import {
  certificateCandidatesQuerySchema,
  certificateCandidatesResponseSchema,
  issueCertificateRequestSchema,
  courseCertificateSettingsSchema,
  courseCertificatesQuerySchema,
  courseCertificatesResponseSchema,
  courseCertificateStatusSchema,
  myCertificateSchema,
  myCertificatesResponseSchema,
  publicCertificateSchema,
  revokeCertificateRequestSchema,
  staffCertificateSchema,
  updateCourseCertificateSettingsRequestSchema,
} from "@veolms/contracts";
import { z } from "zod";

import { config } from "../../config.ts";
import { errorResponse } from "../../lib/errors.ts";
import { jsonResponse } from "../../lib/responses.ts";
import type { RoutePlugin } from "../../lib/route-plugin.ts";
import { createPermissionPreHandlers } from "../authorization/index.ts";
import { createCertificatesController } from "./certificates.controller.ts";
import { createCertificatesService } from "./certificates.service.ts";
import { getCertificateRenderPool } from "./render/certificate-render-pool.ts";

/**
 * Course certificates (README.md next to this file). Learners see where
 * they stand, claim, list and download their own; anyone checks one by its
 * code; staff list a course's certificates, set the completion it asks for,
 * and revoke or restore.
 */
const certificatesRoutes: RoutePlugin = async (app, options) => {
  const { signedIn, requires } = createPermissionPreHandlers(options.database);
  const service = createCertificatesService({
    database: options.database,
    services: options.services,
    config,
    renderPool: getCertificateRenderPool(),
    logger: app.log,
  });
  const controller = createCertificatesController({ service });
  const tags = ["Certificates"];
  const courseParams = z.object({ courseId: z.string().min(1).max(200) });
  const codeParams = z.object({ code: z.string().min(1).max(64) });
  const certificateParams = z.object({ certificateId: z.uuid() });

  app.get(
    "/certificates/courses/:courseId",
    {
      preHandler: signedIn,
      schema: {
        operationId: "getCourseCertificateStatus",
        tags,
        summary: "Where the learner stands with a course's certificate",
        description:
          "Disabled, locked (with the progress so far), unlocked (ready to claim) or issued. Records the unlock the first time the learner is at or above the threshold.",
        params: courseParams,
        response: {
          200: jsonResponse(
            "The learner's state.",
            courseCertificateStatusSchema,
          ),
          401: errorResponse("Unauthorized"),
          404: errorResponse("Course not found"),
        },
      },
    },
    controller.courseStatus,
  );

  app.post(
    "/certificates/courses/:courseId/claim",
    {
      preHandler: signedIn,
      config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
      schema: {
        operationId: "claimCourseCertificate",
        tags,
        summary: "Claim the course's certificate",
        description:
          "Issues the certificate once, to the learner's profile name (nothing is typed). Claiming again returns the same certificate (200 instead of 201).",
        params: courseParams,
        response: {
          200: jsonResponse("Already issued.", myCertificateSchema),
          201: jsonResponse("Issued.", myCertificateSchema),
          401: errorResponse("Unauthorized"),
          404: errorResponse("Course not found"),
          409: errorResponse("Not unlocked yet, or the course gives none"),
          422: errorResponse("The profile name cannot be printed"),
        },
      },
    },
    controller.claim,
  );

  app.get(
    "/certificates/mine",
    {
      preHandler: signedIn,
      schema: {
        operationId: "listMyCertificates",
        tags,
        summary: "The signed-in learner's certificates",
        response: {
          200: jsonResponse("Newest first.", myCertificatesResponseSchema),
          401: errorResponse("Unauthorized"),
        },
      },
    },
    controller.mine,
  );

  app.patch(
    "/certificates/:code/name",
    {
      preHandler: signedIn,
      config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
      schema: {
        operationId: "correctCertificateName",
        tags,
        summary: "Put one's current profile name on one's certificate",
        description:
          "After correcting the name in the profile. Allowed twice. The code stays the same; the revision goes up.",
        params: codeParams,
        response: {
          200: jsonResponse("The certificate as saved.", myCertificateSchema),
          401: errorResponse("Unauthorized"),
          404: errorResponse("Certificate not found"),
          409: errorResponse("Revoked, or no corrections left"),
          422: errorResponse("The profile name cannot be printed"),
        },
      },
    },
    controller.correctName,
  );

  app.get(
    "/certificates/:code/download",
    {
      preHandler: signedIn,
      config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
      schema: {
        operationId: "downloadCertificatePdf",
        tags,
        summary: "Download a certificate as PDF",
        description:
          "Drawn now from the certificate's snapshot (nothing is stored). For its owner while it is active, and for staff who may see the course's certificates.",
        params: codeParams,
        response: {
          401: errorResponse("Unauthorized"),
          404: errorResponse("Certificate not found"),
          410: errorResponse("Revoked"),
          503: errorResponse("Too many certificates being prepared"),
        },
      },
    },
    controller.download,
  );

  app.get(
    "/certificates/public/:code",
    {
      config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
      schema: {
        operationId: "verifyCertificate",
        tags,
        summary: "Check a certificate by its code",
        description:
          "Public. Name, course, academy, date and whether it is valid or revoked; never the learner's email, progress or payment. Dashes and case in the code do not matter.",
        params: codeParams,
        response: {
          200: jsonResponse("The certificate.", publicCertificateSchema),
          404: errorResponse("No certificate has this code"),
        },
      },
    },
    controller.publicCertificate,
  );

  app.get(
    "/certificates/admin/courses/:courseId",
    {
      preHandler: requires("certificate.issue", "platform"),
      schema: {
        operationId: "listCourseCertificates",
        tags,
        summary: "A course's certificates, newest first",
        params: courseParams,
        querystring: courseCertificatesQuerySchema,
        response: {
          200: jsonResponse(
            "One page, with the cursor of the next.",
            courseCertificatesResponseSchema,
          ),
          401: errorResponse("Unauthorized"),
          403: errorResponse("Forbidden"),
          404: errorResponse("Course not found"),
        },
      },
    },
    controller.courseCertificates,
  );

  app.get(
    "/certificates/admin/courses/:courseId/candidates",
    {
      preHandler: requires("certificate.issue", "platform"),
      schema: {
        operationId: "listCertificateCandidates",
        tags,
        summary: "Learners in a course, to issue a certificate to by hand",
        description:
          "The 30 enrolled learners that best match q (name, username or email), with their progress, whether they hold the certificate, and whether their profile name can be printed.",
        params: courseParams,
        querystring: certificateCandidatesQuerySchema,
        response: {
          200: jsonResponse("Learners.", certificateCandidatesResponseSchema),
          401: errorResponse("Unauthorized"),
          403: errorResponse("Forbidden"),
          404: errorResponse("Course not found"),
        },
      },
    },
    controller.candidates,
  );

  app.post(
    "/certificates/admin/courses/:courseId/issue",
    {
      preHandler: requires("certificate.issue", "platform"),
      config: { rateLimit: { max: 60, timeWindow: "1 minute" } },
      schema: {
        operationId: "issueCertificateManually",
        tags,
        summary:
          "Issue a learner's certificate by hand, whatever their progress",
        description:
          "For administrators, and instructors on their own courses. Issued to the learner's profile name; the learner is notified and emailed. A learner who holds one already gets the same certificate back.",
        params: courseParams,
        body: issueCertificateRequestSchema,
        response: {
          200: jsonResponse("The certificate.", staffCertificateSchema),
          401: errorResponse("Unauthorized"),
          403: errorResponse("Forbidden"),
          404: errorResponse("Course or learner not found"),
          422: errorResponse("The learner's profile name cannot be printed"),
        },
      },
    },
    controller.manualIssue,
  );

  app.put(
    "/certificates/admin/courses/:courseId/settings",
    {
      preHandler: requires("course.details.update", "platform"),
      schema: {
        operationId: "updateCourseCertificateSettings",
        tags,
        summary: "Set the share of lessons a course's certificate asks for",
        params: courseParams,
        body: updateCourseCertificateSettingsRequestSchema,
        response: {
          200: jsonResponse("Saved.", courseCertificateSettingsSchema),
          401: errorResponse("Unauthorized"),
          403: errorResponse("Forbidden"),
          404: errorResponse("Course not found"),
        },
      },
    },
    controller.updateSettings,
  );

  app.post(
    "/certificates/admin/:certificateId/revoke",
    {
      preHandler: requires("certificate.revoke", "platform"),
      schema: {
        operationId: "revokeCertificate",
        tags,
        summary: "Revoke a certificate",
        description:
          "Its page then says it was revoked (never why) and its owner can no longer download it.",
        params: certificateParams,
        body: revokeCertificateRequestSchema,
        response: {
          200: jsonResponse("The certificate.", staffCertificateSchema),
          401: errorResponse("Unauthorized"),
          403: errorResponse("Forbidden"),
          404: errorResponse("Certificate not found"),
        },
      },
    },
    controller.revoke,
  );

  app.post(
    "/certificates/admin/:certificateId/restore",
    {
      preHandler: requires("certificate.revoke", "platform"),
      schema: {
        operationId: "restoreCertificate",
        tags,
        summary: "Restore a revoked certificate",
        params: certificateParams,
        response: {
          200: jsonResponse("The certificate.", staffCertificateSchema),
          401: errorResponse("Unauthorized"),
          403: errorResponse("Forbidden"),
          404: errorResponse("Certificate not found"),
          409: errorResponse("The learner holds another active one"),
        },
      },
    },
    controller.restore,
  );
};

export default certificatesRoutes;
