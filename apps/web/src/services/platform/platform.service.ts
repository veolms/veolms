import type {
  AcademyLogoContentType,
  AcademyLogoPresignResponse,
  PlatformSettingsResponse,
  PublicPlatformSettingsResponse,
  StaticSiteRebuildStatus,
  UpdatePlatformSettingsRequest,
} from "@veolms/contracts";
import { api } from "../../lib/api-client";
import { mediaService } from "../media";

export const platformService = {
  /** The settings in force, saved or default (administrators only). */
  getSettings(): Promise<PlatformSettingsResponse> {
    return api.get<PlatformSettingsResponse>("/platform/settings");
  },
  /** The same settings, as every visitor's browser reads them. */
  getPublicSettings(): Promise<PublicPlatformSettingsResponse> {
    return api.get<PublicPlatformSettingsResponse>("/platform/public-settings");
  },
  updateSettings(
    changes: UpdatePlatformSettingsRequest,
  ): Promise<PlatformSettingsResponse> {
    return api.patch<PlatformSettingsResponse>("/platform/settings", changes);
  },
  /**
   * Uploads the file straight to storage, then makes it the logo printed on
   * invoices. The file's type must already be checked as PNG or JPEG.
   */
  async uploadInvoiceLogo(file: File): Promise<PlatformSettingsResponse> {
    const contentType = file.type as AcademyLogoContentType;
    const { uploadId, uploadUrl } = await api.post<AcademyLogoPresignResponse>(
      "/platform/settings/invoice-logo/presign",
      { contentType, fileSize: file.size },
    );
    await mediaService.uploadFileToPresignedUrl(uploadUrl, file);
    return await api.post<PlatformSettingsResponse>(
      "/platform/settings/invoice-logo/complete",
      { uploadId, contentType },
    );
  },
  removeInvoiceLogo(): Promise<PlatformSettingsResponse> {
    return api.delete<PlatformSettingsResponse>(
      "/platform/settings/invoice-logo",
    );
  },
  /** The last rebuild of every public page (administrators only). */
  getStaticSiteRebuildStatus(): Promise<StaticSiteRebuildStatus> {
    return api.get<StaticSiteRebuildStatus>("/platform/static-pages");
  },
  rebuildStaticSite(): Promise<StaticSiteRebuildStatus> {
    return api.post<StaticSiteRebuildStatus>("/platform/static-pages/rebuild");
  },
};
