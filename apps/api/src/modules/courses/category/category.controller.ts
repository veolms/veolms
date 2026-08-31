import type { FastifyReply, FastifyRequest } from "fastify";
import type { CreateCategoryRequest } from "@veolms/contracts";
import type { CategoryService } from "./category.service.ts";

export function createCategoryController({
  service,
}: {
  service: CategoryService;
}) {
  async function listCategories() {
    return await service.listCategories();
  }

  async function createCategory(
    request: FastifyRequest,
    reply: FastifyReply,
  ) {
    const { name } = request.body as CreateCategoryRequest;
    const category = await service.createCategory(name);
    reply.code(201);
    return category;
  }

  async function deleteCategory(
    request: FastifyRequest,
  ) {
    const { categoryId } = request.params as { categoryId: string };
    return await service.deleteCategory(categoryId);
  }

  return {
    listCategories,
    createCategory,
    deleteCategory,
  };
}

export type CategoryController = ReturnType<typeof createCategoryController>;
