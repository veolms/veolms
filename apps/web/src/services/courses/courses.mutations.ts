import { useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  Category,
  Course,
  CourseAccessRule,
  CourseEditorDataResponse,
  CoursePricing,
  CourseSettings,
  CourseIncludeItem,
  CreateCategoryRequest,
  CreateCourseIncludeRequest,
  CreateCourseLessonRequest,
  CreateCourseRequest,
  CreateCourseSectionRequest,
  ReorderCourseIncludesRequest,
  ReorderLessonsRequest,
  ReorderSectionsRequest,
  UpdateCourseAccessRuleRequest,
  UpdateCourseBasicsRequest,
  UpdateCourseIncludeRequest,
  UpdateCourseLessonRequest,
  UpdateCoursePricingRequest,
  UpdateCourseSectionRequest,
  UpdateCourseSettingsRequest,
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
      queryClient.invalidateQueries({
        queryKey: courseKeys.preview(variables.id),
      });
      queryClient.invalidateQueries({ queryKey: courseKeys.mine() });
      queryClient.invalidateQueries({ queryKey: courseKeys.lists() });
    },
  });
}

export function useDeleteCourse() {
  const queryClient = useQueryClient();

  return useMutation<{ success: boolean }, ApiError, string>({
    mutationFn: (courseId) => coursesService.deleteCourse(courseId),
    onSuccess: (_, courseId) => {
      queryClient.invalidateQueries({ queryKey: courseKeys.mine() });
      queryClient.invalidateQueries({ queryKey: courseKeys.lists() });
      queryClient.removeQueries({ queryKey: courseKeys.editor(courseId) });
      queryClient.removeQueries({ queryKey: courseKeys.preview(courseId) });
      queryClient.removeQueries({ queryKey: courseKeys.overview(courseId) });
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
      queryClient.invalidateQueries({
        queryKey: courseKeys.preview(variables.courseId),
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
      queryClient.invalidateQueries({
        queryKey: courseKeys.preview(variables.courseId),
      });
    },
  });
}
export const useUpdateSection = useUpdateCourseSection;

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
      queryClient.invalidateQueries({
        queryKey: courseKeys.preview(variables.courseId),
      });
    },
  });
}
export const useDeleteSection = useDeleteCourseSection;

export function useReorderCourseSections() {
  const queryClient = useQueryClient();

  return useMutation<
    { success: boolean },
    ApiError,
    { courseId: string; payload: ReorderSectionsRequest },
    { previousEditorData?: CourseEditorDataResponse }
  >({
    mutationFn: ({ courseId, payload }) =>
      coursesService.reorderSections(courseId, payload),
    onMutate: async ({ courseId, payload }) => {
      await queryClient.cancelQueries({
        queryKey: courseKeys.editor(courseId),
      });

      const previousEditorData =
        queryClient.getQueryData<CourseEditorDataResponse>(
          courseKeys.editor(courseId),
        );

      if (previousEditorData && previousEditorData.sections) {
        const sectionOrderMap = new Map(
          payload.orderedSectionIds.map((id, index) => [id, index]),
        );
        const sortedSections = [...previousEditorData.sections]
          .sort((a, b) => {
            const posA = sectionOrderMap.get(a.id) ?? a.position;
            const posB = sectionOrderMap.get(b.id) ?? b.position;
            return posA - posB;
          })
          .map((sec, idx) => ({
            ...sec,
            position: idx,
          }));

        queryClient.setQueryData<CourseEditorDataResponse>(
          courseKeys.editor(courseId),
          {
            ...previousEditorData,
            course: {
              ...previousEditorData.course,
              version: (previousEditorData.course.version || 1) + 1,
            },
            sections: sortedSections,
          },
        );
      }

      return { previousEditorData };
    },
    onError: (_err, variables, context) => {
      if (context?.previousEditorData) {
        queryClient.setQueryData(
          courseKeys.editor(variables.courseId),
          context.previousEditorData,
        );
      }
    },
    onSettled: (_, __, variables) => {
      queryClient.invalidateQueries({
        queryKey: courseKeys.editor(variables.courseId),
      });
      queryClient.invalidateQueries({
        queryKey: courseKeys.preview(variables.courseId),
      });
    },
  });
}
export const useReorderSections = useReorderCourseSections;

export function useCreateLesson() {
  const queryClient = useQueryClient();

  return useMutation<
    { id: string; position: number },
    ApiError,
    {
      courseId: string;
      sectionId: string;
      payload: CreateCourseLessonRequest;
    }
  >({
    mutationFn: ({ courseId, sectionId, payload }) =>
      coursesService.createLesson(courseId, sectionId, payload),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: courseKeys.editor(variables.courseId),
      });
      queryClient.invalidateQueries({
        queryKey: courseKeys.preview(variables.courseId),
      });
    },
  });
}

export function useUpdateCourseLesson() {
  const queryClient = useQueryClient();

  return useMutation<
    { success: boolean; videoJobId?: string; processingStatus?: string },
    ApiError,
    {
      courseId: string;
      lessonId: string;
      payload: UpdateCourseLessonRequest;
    }
  >({
    mutationFn: ({ courseId, lessonId, payload }) =>
      coursesService.updateLesson(courseId, lessonId, payload),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: courseKeys.editor(variables.courseId),
      });
      queryClient.invalidateQueries({
        queryKey: courseKeys.preview(variables.courseId),
      });
    },
  });
}
export const useUpdateLesson = useUpdateCourseLesson;

export function useDeleteCourseLesson() {
  const queryClient = useQueryClient();

  return useMutation<
    { success: boolean },
    ApiError,
    { courseId: string; lessonId: string }
  >({
    mutationFn: ({ courseId, lessonId }) =>
      coursesService.deleteLesson(courseId, lessonId),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: courseKeys.editor(variables.courseId),
      });
      queryClient.invalidateQueries({
        queryKey: courseKeys.preview(variables.courseId),
      });
    },
  });
}
export const useDeleteLesson = useDeleteCourseLesson;

export function useReorderSectionLessons() {
  const queryClient = useQueryClient();

  return useMutation<
    { success: boolean },
    ApiError,
    {
      courseId: string;
      sectionId: string;
      payload: ReorderLessonsRequest;
    },
    { previousEditorData?: CourseEditorDataResponse }
  >({
    mutationFn: ({ courseId, sectionId, payload }) =>
      coursesService.reorderLessons(courseId, sectionId, payload),
    onMutate: async ({ courseId, sectionId, payload }) => {
      await queryClient.cancelQueries({
        queryKey: courseKeys.editor(courseId),
      });

      const previousEditorData =
        queryClient.getQueryData<CourseEditorDataResponse>(
          courseKeys.editor(courseId),
        );

      if (previousEditorData && previousEditorData.sections) {
        const lessonOrderMap = new Map(
          payload.orderedLessonIds.map((id, index) => [id, index]),
        );
        const updatedSections = previousEditorData.sections.map((sec) => {
          if (sec.id !== sectionId) return sec;
          const sortedLessons = [...(sec.lessons || [])].sort((a, b) => {
            const posA = lessonOrderMap.get(a.id) ?? a.position;
            const posB = lessonOrderMap.get(b.id) ?? b.position;
            return posA - posB;
          });
          return {
            ...sec,
            lessons: sortedLessons.map((les, idx) => ({
              ...les,
              position: idx,
            })),
          };
        });

        queryClient.setQueryData<CourseEditorDataResponse>(
          courseKeys.editor(courseId),
          {
            ...previousEditorData,
            course: {
              ...previousEditorData.course,
              version: (previousEditorData.course.version || 1) + 1,
            },
            sections: updatedSections,
          },
        );
      }

      return { previousEditorData };
    },
    onError: (_err, variables, context) => {
      if (context?.previousEditorData) {
        queryClient.setQueryData(
          courseKeys.editor(variables.courseId),
          context.previousEditorData,
        );
      }
    },
    onSettled: (_, __, variables) => {
      queryClient.invalidateQueries({
        queryKey: courseKeys.editor(variables.courseId),
      });
      queryClient.invalidateQueries({
        queryKey: courseKeys.preview(variables.courseId),
      });
    },
  });
}
export const useReorderLessons = useReorderSectionLessons;

export function useUpsertAccessRules() {
  const queryClient = useQueryClient();

  return useMutation<
    CourseAccessRule,
    ApiError,
    { courseId: string; payload: UpdateCourseAccessRuleRequest }
  >({
    mutationFn: ({ courseId, payload }) =>
      coursesService.upsertAccessRules(courseId, payload),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: courseKeys.editor(variables.courseId),
      });
      queryClient.invalidateQueries({
        queryKey: courseKeys.preview(variables.courseId),
      });
    },
  });
}
export const useUpsertCourseAccessRules = useUpsertAccessRules;

export function useUpsertSettings() {
  const queryClient = useQueryClient();

  return useMutation<
    CourseSettings,
    ApiError,
    { courseId: string; payload: UpdateCourseSettingsRequest }
  >({
    mutationFn: ({ courseId, payload }) =>
      coursesService.upsertSettings(courseId, payload),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: courseKeys.editor(variables.courseId),
      });
      queryClient.invalidateQueries({
        queryKey: courseKeys.preview(variables.courseId),
      });
    },
  });
}
export const useUpsertCourseSettings = useUpsertSettings;

export function useUpsertPricing() {
  const queryClient = useQueryClient();

  return useMutation<
    CoursePricing,
    ApiError,
    { courseId: string; payload: UpdateCoursePricingRequest }
  >({
    mutationFn: ({ courseId, payload }) =>
      coursesService.upsertPricing(courseId, payload),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: courseKeys.editor(variables.courseId),
      });
      queryClient.invalidateQueries({
        queryKey: courseKeys.preview(variables.courseId),
      });
    },
  });
}
export const useUpsertCoursePricing = useUpsertPricing;

export function usePublishCourse() {
  const queryClient = useQueryClient();

  return useMutation<Course, ApiError, string>({
    mutationFn: (courseId) => coursesService.publishCourse(courseId),
    onSuccess: (updatedCourse) => {
      queryClient.invalidateQueries({
        queryKey: courseKeys.editor(updatedCourse.id),
      });
      queryClient.invalidateQueries({
        queryKey: courseKeys.preview(updatedCourse.id),
      });
      queryClient.invalidateQueries({ queryKey: courseKeys.mine() });
      queryClient.invalidateQueries({ queryKey: courseKeys.lists() });
      queryClient.invalidateQueries({
        queryKey: courseKeys.validation(updatedCourse.id),
      });
    },
  });
}

export function useUnpublishCourse() {
  const queryClient = useQueryClient();

  return useMutation<Course, ApiError, string>({
    mutationFn: (courseId) => coursesService.unpublishCourse(courseId),
    onSuccess: (updatedCourse) => {
      queryClient.invalidateQueries({
        queryKey: courseKeys.editor(updatedCourse.id),
      });
      queryClient.invalidateQueries({
        queryKey: courseKeys.preview(updatedCourse.id),
      });
      queryClient.invalidateQueries({ queryKey: courseKeys.mine() });
      queryClient.invalidateQueries({ queryKey: courseKeys.lists() });
      queryClient.invalidateQueries({
        queryKey: courseKeys.validation(updatedCourse.id),
      });
    },
  });
}

export function useCreateCourseInclude() {
  const queryClient = useQueryClient();

  return useMutation<
    CourseIncludeItem,
    ApiError,
    { courseId: string; payload: CreateCourseIncludeRequest }
  >({
    mutationFn: ({ courseId, payload }) =>
      coursesService.createInclude(courseId, payload),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: courseKeys.editor(variables.courseId),
      });
      queryClient.invalidateQueries({
        queryKey: courseKeys.preview(variables.courseId),
      });
    },
  });
}

export function useUpdateCourseInclude() {
  const queryClient = useQueryClient();

  return useMutation<
    CourseIncludeItem,
    ApiError,
    { courseId: string; includeId: string; payload: UpdateCourseIncludeRequest }
  >({
    mutationFn: ({ courseId, includeId, payload }) =>
      coursesService.updateInclude(courseId, includeId, payload),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: courseKeys.editor(variables.courseId),
      });
      queryClient.invalidateQueries({
        queryKey: courseKeys.preview(variables.courseId),
      });
    },
  });
}

export function useDeleteCourseInclude() {
  const queryClient = useQueryClient();

  return useMutation<
    { success: boolean },
    ApiError,
    { courseId: string; includeId: string }
  >({
    mutationFn: ({ courseId, includeId }) =>
      coursesService.deleteInclude(courseId, includeId),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: courseKeys.editor(variables.courseId),
      });
      queryClient.invalidateQueries({
        queryKey: courseKeys.preview(variables.courseId),
      });
    },
  });
}

export function useReorderCourseIncludes() {
  const queryClient = useQueryClient();

  return useMutation<
    { success: boolean },
    ApiError,
    { courseId: string; payload: ReorderCourseIncludesRequest }
  >({
    mutationFn: ({ courseId, payload }) =>
      coursesService.reorderIncludes(courseId, payload),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: courseKeys.editor(variables.courseId),
      });
      queryClient.invalidateQueries({
        queryKey: courseKeys.preview(variables.courseId),
      });
    },
  });
}
