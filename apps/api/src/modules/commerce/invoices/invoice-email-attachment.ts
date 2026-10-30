import type { NotificationAttachmentResolver } from "../../notifications/notifications.types.ts";
import type { InvoiceService } from "./invoice.service.ts";

/**
 * Supplies the files notification emails carry: an order's invoice PDF for
 * the purchase email. It is the same file a download serves.
 */
export function createInvoiceAttachmentResolver(
  invoices: Pick<InvoiceService, "getOrderInvoicePdf">,
): NotificationAttachmentResolver {
  return {
    async resolve(attachment) {
      const { fileName, pdf } = await invoices.getOrderInvoicePdf(
        attachment.orderId,
      );
      return {
        filename: fileName,
        content: pdf,
        contentType: "application/pdf",
      };
    },
  };
}
