import type {
  CreateShortLinkRequest,
  ShortLinkPathCheckQuery,
  UpdateShortLinkRequest,
} from "@veolms/contracts";
import type { FastifyReply, FastifyRequest } from "fastify";

import type { LinksService } from "./links.service.ts";

export function createLinksController({ service }: { service: LinksService }) {
  return {
    async list() {
      return { links: await service.list() };
    },

    async check(
      request: FastifyRequest<{ Querystring: ShortLinkPathCheckQuery }>,
    ) {
      return await service.check(request.query.path, request.query.linkId);
    },

    async create(request: FastifyRequest<{ Body: CreateShortLinkRequest }>) {
      return await service.create(request.body, request.user?.id ?? null);
    },

    async update(
      request: FastifyRequest<{
        Params: { linkId: string };
        Body: UpdateShortLinkRequest;
      }>,
    ) {
      return await service.update(request.params.linkId, request.body);
    },

    async remove(request: FastifyRequest<{ Params: { linkId: string } }>) {
      await service.remove(request.params.linkId);
      return { deleted: true as const };
    },

    /**
     * The website Worker's lookup. Cached at the edge (the answer is the
     * same for everyone), "no link" included, so an unknown path does not
     * reach the API again until the cache is purged or expires.
     */
    async resolve(
      request: FastifyRequest<{ Querystring: { path: string } }>,
      reply: FastifyReply,
    ) {
      const link = await service.resolve(request.query.path);
      reply.header(
        "Cache-Control",
        `public, max-age=0, s-maxage=${service.edgeCacheSeconds}`,
      );
      return { link };
    },

    async visit(request: FastifyRequest<{ Body: { id: string } }>) {
      await service.recordVisit(request.body.id);
      return { counted: true as const };
    },
  };
}
