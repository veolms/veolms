import type {
  AcademyLogoCompleteRequest,
  AcademyLogoPresignRequest,
  PlatformBrandAssetParams,
  StaticSiteRebuildStatus,
  UpdatePlatformSettingsRequest,
} from "@veolms/contracts";
import type { CourseStaticPageRefreshService } from "@veolms/services/course-static-pages";
import type { FastifyRequest } from "fastify";
import type { PlatformBrandAssetsService } from "./platform-brand-assets.service.ts";
import type { PlatformInvoiceLogoService } from "./platform-invoice-logo.service.ts";
import type { PlatformSettingsService } from "./platform-settings.service.ts";

const NOT_CONFIGURED: StaticSiteRebuildStatus = {
  status: "failed",
  message: "Public page rebuilds are not configured on this server.",
  updatedAt: new Date(0).toISOString(),
  runUrl: null,
};

export function createPlatformSettingsController({
  service,
  invoiceLogo,
  brandAssets,
  staticPages,
}: {
  service: PlatformSettingsService;
  invoiceLogo: PlatformInvoiceLogoService;
  brandAssets: PlatformBrandAssetsService;
  staticPages?: CourseStaticPageRefreshService;
}) {
  async function presignInvoiceLogo(
    request: FastifyRequest<{ Body: AcademyLogoPresignRequest }>,
  ) {
    return await invoiceLogo.presign(request.body);
  }

  async function completeInvoiceLogo(
    request: FastifyRequest<{ Body: AcademyLogoCompleteRequest }>,
  ) {
    return await invoiceLogo.complete(request.body, request.user?.id ?? null);
  }

  async function removeInvoiceLogo(request: FastifyRequest) {
    return await invoiceLogo.remove(request.user?.id ?? null);
  }

  async function presignBrandAsset(
    request: FastifyRequest<{
      Params: PlatformBrandAssetParams;
      Body: AcademyLogoPresignRequest;
    }>,
  ) {
    return await brandAssets.presign(request.body);
  }

  async function completeBrandAsset(
    request: FastifyRequest<{
      Params: PlatformBrandAssetParams;
      Body: AcademyLogoCompleteRequest;
    }>,
  ) {
    return await brandAssets.complete(
      request.params.asset,
      request.body,
      request.user?.id ?? null,
    );
  }

  async function removeBrandAsset(
    request: FastifyRequest<{ Params: PlatformBrandAssetParams }>,
  ) {
    return await brandAssets.remove(
      request.params.asset,
      request.user?.id ?? null,
    );
  }

  async function getSettings() {
    return await service.getSettings();
  }

  async function getPublicSettings() {
    return await service.getPublicSettings();
  }

  async function updateSettings(
    request: FastifyRequest<{ Body: UpdatePlatformSettingsRequest }>,
  ) {
    return await service.updateSettings(request.body, request.user?.id ?? null);
  }

  async function getStaticSiteRebuildStatus() {
    return staticPages?.getFullRebuildStatus() ?? NOT_CONFIGURED;
  }

  async function rebuildStaticSite() {
    return staticPages?.requestFullRebuild() ?? NOT_CONFIGURED;
  }

  return {
    getSettings,
    getPublicSettings,
    updateSettings,
    presignInvoiceLogo,
    completeInvoiceLogo,
    removeInvoiceLogo,
    presignBrandAsset,
    completeBrandAsset,
    removeBrandAsset,
    getStaticSiteRebuildStatus,
    rebuildStaticSite,
  };
}
