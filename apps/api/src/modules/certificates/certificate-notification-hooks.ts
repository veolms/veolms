import type { Database } from "@veolms/database";
import type { FastifyBaseLogger } from "fastify";
import type { Kysely } from "kysely";

import { config } from "../../config.ts";
import type { AppServices } from "../../services/index.ts";
import type { NotificationAttachmentResolver } from "../notifications/notifications.types.ts";
import { createCertificateAttachmentResolver } from "./certificate-email-attachment.ts";
import { createCertificatesService } from "./certificates.service.ts";
import { getCertificateRenderPool } from "./render/certificate-render-pool.ts";

/**
 * What the notification worker needs from certificates: issuing one
 * automatically when a finished lesson completes a course's share, and
 * drawing the PDF the "certificate ready" email carries. `invoices` is the
 * resolver for the other attachment kind; one resolver answers both.
 */
export function createCertificateNotificationHooks({
  database,
  services,
  logger,
  invoices,
}: {
  database: Kysely<Database>;
  services: AppServices;
  logger?: FastifyBaseLogger;
  invoices: NotificationAttachmentResolver;
}) {
  const certificates = createCertificatesService({
    database,
    services,
    config,
    renderPool: getCertificateRenderPool(),
    ...(logger ? { logger } : {}),
  });
  const certificatePdfs = createCertificateAttachmentResolver(certificates);
  const attachments: NotificationAttachmentResolver = {
    resolve: (attachment) =>
      attachment.kind === "certificate-pdf"
        ? certificatePdfs.resolve(attachment)
        : invoices.resolve(attachment),
  };
  return {
    attachments,
    autoIssueCertificate: (userId: string, courseId: string) =>
      certificates.autoIssue(userId, courseId),
  };
}
