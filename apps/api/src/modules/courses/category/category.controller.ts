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
    request: FastifyRequest<{ Body: CreateCategoryRequest }>,
    reply: FastifyReply,
  ) {
    const { name } = request.body;
    const category = await service.createCategory(name);
    reply.code(201);
    return category;
  }

  async function deleteCategory(
    request: FastifyRequest<{ Params: { categoryId: string } }>,
  ) {
    const { categoryId } = request.params;
    return await service.deleteCategory(categoryId);
  }

  return {
    listCategories,
    createCategory,
    deleteCategory,
  };
}

export type CategoryController = ReturnType<typeof createCategoryController>;
