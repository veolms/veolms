import { useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  Category,
  Course,
  CreateCategoryRequest,
  CreateCourseRequest,
  CreateCourseSectionRequest,
  ReorderSectionsRequest,
  UpdateCourseBasicsRequest,
  UpdateCourseSectionRequest,
} from "@veolms/contracts";
import type { ApiError } from "../../lib/api-error";
import { courseKeys } from "./courses.keys";
import { coursesService } from "./courses.service";

export function useCreateCourse() {
  const queryClient = useQueryClient();

  return useMutation<Course, ApiError, CreateCourseRequest>({
    mutationFn: (payload) => coursesService.createCourse(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: courseKeys.mine() });
      queryClient.invalidateQueries({ queryKey: courseKeys.lists() });
    },
  });
}

export function useUpdateCourseBasics() {
  const queryClient = useQueryClient();

  return useMutation<
    Course,
    ApiError,
    { id: string; payload: UpdateCourseBasicsRequest }
  >({
    mutationFn: ({ id, payload }) =>
      coursesService.updateCourseBasics(id, payload),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: courseKeys.editor(variables.id),
      });
      queryClient.invalidateQueries({ queryKey: courseKeys.mine() });
      queryClient.invalidateQueries({ queryKey: courseKeys.lists() });
    },
  });
}

export function useCreateCategory() {
  const queryClient = useQueryClient();

  return useMutation<Category, ApiError, CreateCategoryRequest>({
    mutationFn: (payload) => coursesService.createCategory(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: courseKeys.categories() });
    },
  });
}

export function useDeleteCategory() {
  const queryClient = useQueryClient();

  return useMutation<{ success: boolean }, ApiError, string>({
    mutationFn: (categoryId) => coursesService.deleteCategory(categoryId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: courseKeys.categories() });
    },
  });
}

export function useCreateSection() {
  const queryClient = useQueryClient();

  return useMutation<
    { id: string; courseId: string; title: string; position: number },
    ApiError,
    { courseId: string; payload: CreateCourseSectionRequest }
  >({
    mutationFn: ({ courseId, payload }) =>
      coursesService.createSection(courseId, payload),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: courseKeys.editor(variables.courseId),
      });
    },
  });
}

export function useUpdateCourseSection() {
  const queryClient = useQueryClient();

  return useMutation<
    { success: boolean },
    ApiError,
    {
      courseId: string;
      sectionId: string;
      payload: UpdateCourseSectionRequest;
    }
  >({
    mutationFn: ({ courseId, sectionId, payload }) =>
      coursesService.updateSection(courseId, sectionId, payload),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: courseKeys.editor(variables.courseId),
      });
    },
  });
}

export function useDeleteCourseSection() {
  const queryClient = useQueryClient();

  return useMutation<
    { success: boolean },
    ApiError,
    { courseId: string; sectionId: string }
  >({
    mutationFn: ({ courseId, sectionId }) =>
      coursesService.deleteSection(courseId, sectionId),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: courseKeys.editor(variables.courseId),
      });
    },
  });
}

export function useReorderCourseSections() {
  const queryClient = useQueryClient();

  return useMutation<
    { success: boolean },
    ApiError,
    { courseId: string; payload: ReorderSectionsRequest }
  >({
    mutationFn: ({ courseId, payload }) =>
      coursesService.reorderSections(courseId, payload),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: courseKeys.editor(variables.courseId),
      });
    },
  });
}
