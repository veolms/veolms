import crypto from "node:crypto";
import type { Kysely } from "kysely";
import type { Database } from "@veolms/database";
import { cacheTags, createCache } from "@veolms/api-core";
import { AppError } from "../../../lib/errors.ts";
import * as categoryRepo from "./category.repository.ts";
import { slugify } from "../shared/courses.utils.ts";

/**
 * The category list. A category write is a site-wide change (api-core's
 * site-content-changes), which clears it in every process.
 */
const categoryLists = createCache<
  Awaited<ReturnType<typeof categoryRepo.listCategories>>
>({
  name: "courses.categories",
  ttlMs: 10 * 60_000,
  maxBytes: 1024 * 1024,
});

export interface CategoryServiceOptions {
  database: Kysely<Database>;
}

export function createCategoryService({ database }: CategoryServiceOptions) {
  async function listCategories() {
    return await categoryLists.fetch(
      "all",
      () => categoryRepo.listCategories(database),
      { tags: [cacheTags.site] },
    );
  }

  async function createCategory(name: string) {
    const slug = slugify(name);
    if (!slug) {
      throw new AppError(400, "INVALID_SLUG", "Category slug cannot be empty.");
    }
    const existing = await categoryRepo.findCategoryBySlug(database, slug);
    if (existing) {
      throw new AppError(
        400,
        "DUPLICATE_CATEGORY",
        `Category slug "${slug}" already exists.`,
      );
    }
    const id = crypto.randomUUID();
    const now = new Date();
    try {
      await categoryRepo.insertCategory(database, {
        id,
        name,
        slug,
        created_at: now,
        updated_at: now,
      });
    } catch (error: unknown) {
      if ((error as { code?: string })?.code === "23505") {
        throw new AppError(
          400,
          "DUPLICATE_CATEGORY",
          `Category slug "${slug}" already exists.`,
        );
      }
      throw error;
    }
    return { id, name, slug };
  }

  async function deleteCategory(categoryId: string) {
    const category = await categoryRepo.findCategoryById(database, categoryId);
    if (!category) {
      throw new AppError(404, "CATEGORY_NOT_FOUND", "Category not found.");
    }
    await categoryRepo.softDeleteCategory(database, categoryId);
    return { success: true };
  }

  async function findCategoryById(categoryId: string) {
    return await categoryRepo.findCategoryById(database, categoryId);
  }

  return {
    listCategories,
    createCategory,
    deleteCategory,
    findCategoryById,
  };
}

export type CategoryService = ReturnType<typeof createCategoryService>;
