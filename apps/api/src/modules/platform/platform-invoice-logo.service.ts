import type {
  AcademyLogoCompleteRequest,
  AcademyLogoPresignRequest,
  AcademyLogoPresignResponse,
  PlatformSettingsResponse,
} from "@veolms/contracts";

import type { AcademyBrandService } from "../academy/academy-brand.service.ts";
import type { PlatformSettingsService } from "./platform-settings.service.ts";

/**
 * The invoice-only logo (Platform > Invoice): uploaded, checked and stored
 * exactly as the academy's logo is, then saved in the invoice settings. The
 * emails are dark and the invoice is white, so one logo rarely suits both.
 */
export function createPlatformInvoiceLogoService({
  settings,
  brand,
}: {
  settings: PlatformSettingsService;
  brand: AcademyBrandService;
}) {
  return {
    presign: (
      input: AcademyLogoPresignRequest,
    ): Promise<AcademyLogoPresignResponse> => brand.presignLogo(input),

    async complete(
      input: AcademyLogoCompleteRequest,
      updatedBy: string | null,
    ): Promise<PlatformSettingsResponse> {
      const logoUrl = await brand.verifyUploadedLogo(input);
      return await settings.setInvoiceLogo(logoUrl, updatedBy);
    },

    /** Invoices go back to printing the General tab's logo. */
    remove: (updatedBy: string | null): Promise<PlatformSettingsResponse> =>
      settings.setInvoiceLogo(null, updatedBy),
  };
}

export type PlatformInvoiceLogoService = ReturnType<
  typeof createPlatformInvoiceLogoService
>;
