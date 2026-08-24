import { api } from "../../lib/api-client";
import type {
  Category,
  Course,
  CourseEditorDataResponse,
  CourseSummary,
  CreateCategoryRequest,
  CreateCourseRequest,
  CreateCourseSectionRequest,
  MyCoursesListResponse,
  PublicCourse,
  UpdateCourseBasicsRequest,
} from "@veolms/contracts";

export const coursesService = {
  list: (): Promise<{ courses: CourseSummary[] }> => {
    return api.get<{ courses: CourseSummary[] }>("/courses");
  },

  getBySlug: (slug: string): Promise<PublicCourse> => {
    return api.get<PublicCourse>(`/courses/${slug}`);
  },

  listMyCourses: (): Promise<MyCoursesListResponse> => {
    return api.get<MyCoursesListResponse>("/courses/mine");
  },

  createCourse: (payload: CreateCourseRequest): Promise<Course> => {
    return api.post<Course>("/courses", payload);
  },

  getCourseEditor: (id: string): Promise<CourseEditorDataResponse> => {
    return api.get<CourseEditorDataResponse>(`/courses/${id}/editor`);
  },

  updateCourseBasics: (
    id: string,
    payload: UpdateCourseBasicsRequest,
  ): Promise<Course> => {
    return api.patch<Course>(`/courses/${id}/basics`, payload);
  },

  createSection: (
    courseId: string,
    payload: CreateCourseSectionRequest,
  ): Promise<{
    id: string;
    courseId: string;
    title: string;
    position: number;
  }> => {
    return api.post<{
      id: string;
      courseId: string;
      title: string;
      position: number;
    }>(`/courses/${courseId}/sections`, payload);
  },

  listCategories: (): Promise<Category[]> => {
    return api.get<Category[]>("/categories");
  },

  createCategory: (payload: CreateCategoryRequest): Promise<Category> => {
    return api.post<Category>("/categories", payload);
  },

  deleteCategory: (categoryId: string): Promise<{ success: boolean }> => {
    return api.delete<{ success: boolean }>(`/categories/${categoryId}`);
  },
};
