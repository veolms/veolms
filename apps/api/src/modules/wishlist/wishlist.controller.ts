import type {
  ImportWishlistRequest,
  WishlistCourseParams,
} from "@veolms/contracts";
import type { FastifyRequest } from "fastify";

import type { WishlistService } from "./wishlist.service.ts";

export function createWishlistController({
  service,
}: {
  service: WishlistService;
}) {
  async function list(request: FastifyRequest) {
    return await service.list(request.user!.id);
  }

  async function add(
    request: FastifyRequest<{ Params: WishlistCourseParams }>,
  ) {
    return await service.add(request.user!.id, request.params.courseId);
  }

  async function remove(
    request: FastifyRequest<{ Params: WishlistCourseParams }>,
  ) {
    return await service.remove(request.user!.id, request.params.courseId);
  }

  async function importFromBrowser(
    request: FastifyRequest<{ Body: ImportWishlistRequest }>,
  ) {
    return await service.importFromBrowser(request.user!.id, request.body);
  }

  return { list, add, remove, importFromBrowser };
}

export type WishlistController = ReturnType<typeof createWishlistController>;
