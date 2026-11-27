import type { LegalPageSlug, SaveLegalPageRequest } from "@veolms/contracts";
import type { FastifyRequest } from "fastify";
import type { LegalPagesService } from "./legal-pages.service.ts";

type SlugRequest = FastifyRequest<{ Params: { slug: LegalPageSlug } }>;

export function createLegalPagesController({
  service,
}: {
  service: LegalPagesService;
}) {
  async function getPublicPage(request: SlugRequest) {
    return { page: await service.getPage(request.params.slug) };
  }

  async function listPages() {
    return { pages: await service.listPages() };
  }

  async function savePage(
    request: FastifyRequest<{
      Params: { slug: LegalPageSlug };
      Body: SaveLegalPageRequest;
    }>,
  ) {
    return await service.savePage(
      request.params.slug,
      request.body,
      request.user?.id ?? null,
    );
  }

  async function resetPage(request: SlugRequest) {
    return await service.resetPage(request.params.slug);
  }

  return { getPublicPage, listPages, savePage, resetPage };
}
