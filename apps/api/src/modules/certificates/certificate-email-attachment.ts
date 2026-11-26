import type { NotificationAttachmentResolver } from "../notifications/notifications.types.ts";
import type { CertificatesService } from "./certificates.service.ts";

/**
 * The "certificate ready" email's attachment: the certificate's PDF, drawn
 * when the email goes out (never stored). A failure is thrown, and the
 * email is tried again later.
 */
export function createCertificateAttachmentResolver(
  certificates: Pick<CertificatesService, "pdfForEmail">,
): NotificationAttachmentResolver {
  return {
    async resolve(attachment) {
      if (attachment.kind !== "certificate-pdf") {
        throw new Error(`Not a certificate attachment: ${attachment.kind}`);
      }
      const { pdf, fileName } = await certificates.pdfForEmail(
        attachment.certificateId,
      );
      return {
        filename: fileName.replace(/[\/:*?"<>|]+/gu, ""),
        content: pdf,
        contentType: "application/pdf",
      };
    },
  };
}
