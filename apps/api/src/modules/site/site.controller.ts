import type {
  CreateSitePageRequest,
  SaveSitePageDraftRequest,
  SiteLook,
  UpdateSitePageRequest,
} from "@veolms/contracts";
import { createHash } from "node:crypto";

import { MOTION_SCRIPT } from "@veolms/site-render";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { SiteService } from "./site.service.ts";

type PageRequest = FastifyRequest<{ Params: { pageId: string } }>;

/**
 * A live page may load nothing but its own inline styles and images, and
 * run only our motion script (allowed by its hash, so no other script can
 * run): no form posts, and other sites can't frame it.
 */
export const LIVE_PAGE_CSP = [
  "default-src 'none'",
  `script-src 'sha256-${createHash("sha256").update(MOTION_SCRIPT).digest("base64")}'`,
  "style-src 'unsafe-inline'",
  "img-src 'self' https: data:",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'self'",
].join("; ");

const NOT_FOUND_PAGE =
  '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Page not found</title><meta name="robots" content="noindex"></head><body style="font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0"><p>This page isn’t available.</p></body></html>';

export function createSiteController({ service }: { service: SiteService }) {
  return {
    getOverview: async () => await service.getOverview(),
    saveLook: async (request: FastifyRequest<{ Body: SiteLook }>) =>
      await service.saveLook(request.body, request.user?.id ?? null),
    listCourseCards: async () => await service.listCourseCards(),
    createPage: async (
      request: FastifyRequest<{ Body: CreateSitePageRequest }>,
      reply: FastifyReply,
    ) => {
      const page = await service.createPage(
        request.body,
        request.user?.id ?? null,
      );
      void reply.code(201);
      return page;
    },
    getPage: async (request: PageRequest) =>
      await service.getPage(request.params.pageId),
    updatePage: async (
      request: FastifyRequest<{
        Params: { pageId: string };
        Body: UpdateSitePageRequest;
      }>,
    ) => await service.updatePage(request.params.pageId, request.body),
    saveDraft: async (
      request: FastifyRequest<{
        Params: { pageId: string };
        Body: SaveSitePageDraftRequest;
      }>,
    ) => await service.saveDraft(request.params.pageId, request.body),
    publishPage: async (request: PageRequest) =>
      await service.publishPage(
        request.params.pageId,
        request.user?.id ?? null,
      ),
    restoreVersion: async (
      request: FastifyRequest<{
        Params: { pageId: string; versionId: string };
      }>,
    ) =>
      await service.restoreVersion(
        request.params.pageId,
        request.params.versionId,
      ),
    unpublishPage: async (request: PageRequest) =>
      await service.unpublishPage(request.params.pageId),
    deletePage: async (request: PageRequest) => {
      await service.deletePage(request.params.pageId);
      return { deleted: true as const };
    },
    showLivePage: async (
      request: FastifyRequest<{ Params: { slug: string } }>,
      reply: FastifyReply,
    ) => {
      const html = await service.getLiveHtml(request.params.slug);
      void reply
        .type("text/html; charset=utf-8")
        .header("Content-Security-Policy", LIVE_PAGE_CSP)
        .header("X-Content-Type-Options", "nosniff")
        .header("Referrer-Policy", "strict-origin-when-cross-origin");
      if (html === null) {
        return reply
          .code(404)
          .header("Cache-Control", "no-store")
          .send(NOT_FOUND_PAGE);
      }
      return reply
        .header(
          "Cache-Control",
          // Always revalidated, so a publish shows at once. A CDN in front
          // can cache and purge by URL instead (creator-features/40 §8).
          "public, no-cache",
        )
        .send(html);
    },
  };
}
