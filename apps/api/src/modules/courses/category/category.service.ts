import crypto from "node:crypto";
import type { Kysely } from "kysely";
import type { Database } from "@veolms/database";
import { AppError } from "../../../lib/errors.ts";
import * as categoryRepo from "./category.repository.ts";
import { slugify } from "../shared/courses.utils.ts";

export interface CategoryServiceOptions {
  database: Kysely<Database>;
}

export function createCategoryService({ database }: CategoryServiceOptions) {
  async function listCategories() {
    return await categoryRepo.listCategories(database);
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

  async function findCategoryBySlug(slug: string) {
    return await categoryRepo.findCategoryBySlug(database, slug);
  }

  return {
    listCategories,
    createCategory,
    deleteCategory,
    findCategoryById,
    getCategoryById: findCategoryById,
    findCategoryBySlug,
  };
}

export type CategoryService = ReturnType<typeof createCategoryService>;
