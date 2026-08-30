import type { FastifyReply, FastifyRequest } from "fastify";
import type {
  CreateBundleRequest,
  UpdateBundleRequest,
} from "@veolms/contracts";
import type { BundleService } from "./bundle.service.ts";

export function createBundleController({
  service,
}: {
  service: BundleService;
}) {
  async function listPublishedBundles(
    request: FastifyRequest,
    reply: FastifyReply,
  ) {
    const bundles = await service.listPublishedBundles();
    return bundles;
  }

  async function getBundleBySlug(
    request: FastifyRequest<{ Params: { slug: string } }>,
    reply: FastifyReply,
  ) {
    const bundle = await service.getBundleBySlug(request.params.slug);
    return bundle;
  }

  async function listAllBundles(
    request: FastifyRequest,
    reply: FastifyReply,
  ) {
    const bundles = await service.listAllBundles();
    return bundles;
  }

  async function getBundleById(
    request: FastifyRequest<{ Params: { bundleId: string } }>,
    reply: FastifyReply,
  ) {
    const bundle = await service.getBundleById(request.params.bundleId);
    return bundle;
  }

  async function createBundle(
    request: FastifyRequest<{ Body: CreateBundleRequest }>,
    reply: FastifyReply,
  ) {
    const bundle = await service.createBundle(request.body);
    return bundle;
  }

  async function updateBundle(
    request: FastifyRequest<{
      Params: { bundleId: string };
      Body: UpdateBundleRequest;
    }>,
    reply: FastifyReply,
  ) {
    const bundle = await service.updateBundle(
      request.params.bundleId,
      request.body,
    );
    return bundle;
  }

  async function deleteBundle(
    request: FastifyRequest<{ Params: { bundleId: string } }>,
    reply: FastifyReply,
  ) {
    await service.deleteBundle(request.params.bundleId);
    return { message: "Bundle deleted successfully." };
  }

  return {
    listPublishedBundles,
    getBundleBySlug,
    listAllBundles,
    getBundleById,
    createBundle,
    updateBundle,
    deleteBundle,
  };
}
