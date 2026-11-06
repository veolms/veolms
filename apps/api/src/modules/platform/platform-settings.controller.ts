import type {
  AcademyLogoCompleteRequest,
  AcademyLogoPresignRequest,
  StaticSiteRebuildStatus,
  UpdatePlatformSettingsRequest,
} from "@veolms/contracts";
import type { CourseStaticPageRefreshService } from "@veolms/services/course-static-pages";
import type { FastifyRequest } from "fastify";
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
  staticPages,
}: {
  service: PlatformSettingsService;
  invoiceLogo: PlatformInvoiceLogoService;
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
    getStaticSiteRebuildStatus,
    rebuildStaticSite,
  };
}
