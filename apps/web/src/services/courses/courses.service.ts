import { api } from "../../lib/api-client";
import type {
  Category,
  CourseSummary,
  CreateCategoryRequest,
  PublicCourse,
} from "@veolms/contracts";

export const coursesService = {
  list: (): Promise<{ courses: CourseSummary[] }> => {
    return api.get<{ courses: CourseSummary[] }>("/courses");
  },

  getBySlug: (slug: string): Promise<PublicCourse> => {
    return api.get<PublicCourse>(`/courses/${slug}`);
  },

  listCategories: (): Promise<Category[]> => {
    return api.get<Category[]>("/categories");
  },

  createCategory: (payload: CreateCategoryRequest): Promise<Category> => {
    return api.post<Category>("/categories", payload);
  },
};
