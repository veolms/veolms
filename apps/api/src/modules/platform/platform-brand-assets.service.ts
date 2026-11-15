import {
  PLATFORM_ICON_MIN_SIDE,
  type AcademyLogoCompleteRequest,
  type AcademyLogoPresignRequest,
  type AcademyLogoPresignResponse,
  type PlatformBrandAsset,
  type PlatformSettingsResponse,
} from "@veolms/contracts";

import type { AcademyBrandService } from "../academy/academy-brand.service.ts";
import type { PlatformSettingsService } from "./platform-settings.service.ts";

/**
 * The website's artwork (Platform > General): a logo for light pages, one
 * for dark pages and a square icon. Each is uploaded, checked and stored
 * exactly as the academy's email logo is, then saved in the platform
 * settings, which every visitor's browser reads.
 */
export function createPlatformBrandAssetsService({
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
      asset: PlatformBrandAsset,
      input: AcademyLogoCompleteRequest,
      updatedBy: string | null,
    ): Promise<PlatformSettingsResponse> {
      const url = await brand.verifyUploadedLogo(
        input,
        asset === "icon" ? { squareMinSide: PLATFORM_ICON_MIN_SIDE } : {},
      );
      return await settings.setBrandAsset(asset, url, updatedBy);
    },

    /** The site goes back to its built-in artwork for this piece. */
    remove: (
      asset: PlatformBrandAsset,
      updatedBy: string | null,
    ): Promise<PlatformSettingsResponse> =>
      settings.setBrandAsset(asset, null, updatedBy),
  };
}

export type PlatformBrandAssetsService = ReturnType<
  typeof createPlatformBrandAssetsService
>;
