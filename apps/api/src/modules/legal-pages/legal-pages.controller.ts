import type { UpdateLegalPageRequest } from "@veolms/contracts";
import type { FastifyRequest } from "fastify";
import type { LegalPagesService } from "./legal-pages.service.ts";

type SlugRequest = FastifyRequest<{ Params: { slug: string } }>;

export function createLegalPagesController({
  service,
}: {
  service: LegalPagesService;
}) {
  return {
    getPublicPage: async (request: SlugRequest) =>
      await service.getPublicPage(request.params.slug),
    listAdminPages: async () => await service.listAdminPages(),
    getAdminPage: async (request: SlugRequest) =>
      await service.getAdminPage(request.params.slug),
    savePage: async (
      request: FastifyRequest<{
        Params: { slug: string };
        Body: UpdateLegalPageRequest;
      }>,
    ) =>
      await service.savePage(
        request.params.slug,
        request.body,
        request.user?.id ?? null,
      ),
    resetPage: async (request: SlugRequest) =>
      await service.resetPage(request.params.slug),
  };
}
