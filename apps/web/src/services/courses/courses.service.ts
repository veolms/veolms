import { api } from "../../lib/api-client";
import type {
  Category,
  Course,
  CourseEditorDataResponse,
  CourseOverviewResponse,
  CourseSummary,
  CreateCategoryRequest,
  CreateCourseLessonRequest,
  CreateCourseRequest,
  CreateCourseSectionRequest,
  MyCoursesListResponse,
  PublicCourse,
  ReorderLessonsRequest,
  ReorderSectionsRequest,
  UpdateCourseBasicsRequest,
  UpdateCourseLessonRequest,
  UpdateCourseSectionRequest,
} from "@veolms/contracts";

export const coursesService = {
  list: (creatorId?: string): Promise<{ courses: CourseSummary[] }> => {
    return api.get<{ courses: CourseSummary[] }>("/courses", {
      params: creatorId ? { creatorId } : undefined,
    });
  },

  getBySlug: (slug: string): Promise<PublicCourse> => {
    return api.get<PublicCourse>(`/courses/${slug}`);
  },

  getOverview: (idOrSlug: string): Promise<CourseOverviewResponse> => {
    return api.get<CourseOverviewResponse>(`/courses/${idOrSlug}/overview`);
  },

  listMyCourses: (): Promise<MyCoursesListResponse> => {
    return api.get<MyCoursesListResponse>("/courses/mine");
  },

  getCourseEditor: (courseId: string): Promise<CourseEditorDataResponse> => {
    return api.get<CourseEditorDataResponse>(`/courses/${courseId}/editor`);
  },

  createCourse: (payload: CreateCourseRequest): Promise<Course> => {
    return api.post<Course>("/courses", payload);
  },

  updateCourseBasics: (
    id: string,
    payload: UpdateCourseBasicsRequest,
  ): Promise<Course> => {
    return api.patch<Course>(`/courses/${id}/basics`, payload);
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

  createSection: (
    courseId: string,
    payload: CreateCourseSectionRequest,
  ): Promise<{ id: string; courseId: string; title: string; position: number }> => {
    return api.post<{
      id: string;
      courseId: string;
      title: string;
      position: number;
    }>(`/courses/${courseId}/sections`, payload);
  },

  updateSection: (
    courseId: string,
    sectionId: string,
    payload: UpdateCourseSectionRequest,
  ): Promise<{ success: boolean }> => {
    return api.patch<{ success: boolean }>(
      `/courses/${courseId}/sections/${sectionId}`,
      payload,
    );
  },

  deleteSection: (
    courseId: string,
    sectionId: string,
  ): Promise<{ success: boolean }> => {
    return api.delete<{ success: boolean }>(
      `/courses/${courseId}/sections/${sectionId}`,
    );
  },

  reorderSections: (
    courseId: string,
    payload: ReorderSectionsRequest,
  ): Promise<{ success: boolean }> => {
    return api.post<{ success: boolean }>(
      `/courses/${courseId}/sections/reorder`,
      payload,
    );
  },

  createLesson: (
    courseId: string,
    sectionId: string,
    payload: CreateCourseLessonRequest,
  ): Promise<{ id: string; position: number }> => {
    return api.post<{ id: string; position: number }>(
      `/courses/${courseId}/sections/${sectionId}/lessons`,
      payload,
    );
  },

  updateLesson: (
    courseId: string,
    lessonId: string,
    payload: UpdateCourseLessonRequest,
  ): Promise<{ success: boolean; videoJobId?: string; processingStatus?: string }> => {
    return api.patch<{ success: boolean; videoJobId?: string; processingStatus?: string }>(
      `/courses/${courseId}/lessons/${lessonId}`,
      payload,
    );
  },

  deleteLesson: (
    courseId: string,
    lessonId: string,
  ): Promise<{ success: boolean }> => {
    return api.delete<{ success: boolean }>(
      `/courses/${courseId}/lessons/${lessonId}`,
    );
  },

  reorderLessons: (
    courseId: string,
    sectionId: string,
    payload: ReorderLessonsRequest,
  ): Promise<{ success: boolean }> => {
    return api.post<{ success: boolean }>(
      `/courses/${courseId}/sections/${sectionId}/lessons/reorder`,
      payload,
    );
  },
};
