import { api } from "../../lib/api-client";
import type {
  Category,
  CourseAccessRule,
  CourseBasicsResponse,
  CourseCreatedResponse,
  CourseDeleteResponse,
  CourseEditorDataResponse,
  CourseOverviewResponse,
  CourseStaticPageRefreshStatusResponse,
  CourseStatusResponse,
  CourseListResponse,
  CourseListQuery,
  CourseOptionsResponse,
  CoursePricing,
  CourseSettings,
  CourseSummary,
  CourseValidationResponse,
  CourseIncludeItem,
  CourseIncludesListResponse,
  CreateCategoryRequest,
  CreateCourseIncludeRequest,
  CreateCourseLessonRequest,
  CreateLessonResourceRequest,
  CreateCourseRequest,
  CreateCourseSectionRequest,
  DeletedCoursesListResponse,
  DeletedCoursesQuery,
  MyCoursesListResponse,
  PublicCourse,
  LessonResource,
  LessonResourceDownloadResponse,
  ReorderCourseIncludesRequest,
  ReorderLessonsRequest,
  ReorderSectionsRequest,
  RestoreCourseResponse,
  UpdateCourseAccessRuleRequest,
  UpdateCourseBasicsRequest,
  UpdateCourseIncludeRequest,
  UpdateCourseLessonRequest,
  UpdateCoursePricingRequest,
  UpdateCourseSectionRequest,
  UpdateCourseSettingsRequest,
} from "@veolms/contracts";

/** The most courses the API returns in one catalogue request. */
const COURSE_LIST_PAGE_SIZE = 60;
/** Far more pages than any catalogue has; only guards against a cursor that never ends. */
const MAX_COURSE_LIST_PAGES = 50;

export const coursesService = {
  list: (params?: CourseListQuery): Promise<CourseListResponse> => {
    return api.get<CourseListResponse>("/courses", {
      params,
      // Keep an unavailable API from leaving the catalogue skeleton mounted
      // indefinitely. The local API responds in well under a second.
      timeout: 5_000,
    });
  },

  /**
   * The whole published catalogue. One request returns at most 60 courses
   * and a cursor for the rest. Screens that filter the catalogue in the
   * browser used to read that first page only, so in an academy with more
   * than 60 courses the newer ones never appeared in them.
   */
  listAll: async (): Promise<{ courses: CourseSummary[] }> => {
    const courses: CourseSummary[] = [];
    const followedCursors = new Set<string>();
    let cursor: string | undefined;
    for (let page = 0; page < MAX_COURSE_LIST_PAGES; page += 1) {
      const response = await coursesService.list({
        limit: COURSE_LIST_PAGE_SIZE,
        ...(cursor ? { cursor } : {}),
      });
      courses.push(...response.courses);
      cursor = response.nextCursor;
      if (!cursor || followedCursors.has(cursor)) break;
      followedCursors.add(cursor);
    }
    return { courses };
  },

  listOptions: (): Promise<CourseOptionsResponse> =>
    api.get<CourseOptionsResponse>("/courses/options"),

  getBySlug: (slug: string): Promise<PublicCourse> => {
    return api.get<PublicCourse>(`/courses/${encodeURIComponent(slug)}`);
  },

  getOverview: (idOrSlug: string): Promise<CourseOverviewResponse> => {
    return api.get<CourseOverviewResponse>(
      `/courses/${encodeURIComponent(idOrSlug)}/overview`,
    );
  },

  getStaticPageRefreshStatus: (
    courseId: string,
  ): Promise<CourseStaticPageRefreshStatusResponse> =>
    api.get<CourseStaticPageRefreshStatusResponse>(
      `/courses/${courseId}/static-page-refresh`,
    ),

  retryStaticPageRefresh: (
    courseId: string,
  ): Promise<CourseStaticPageRefreshStatusResponse> =>
    api.post<CourseStaticPageRefreshStatusResponse>(
      `/courses/${courseId}/static-page-refresh/retry`,
    ),

  listMyCourses: (): Promise<MyCoursesListResponse> => {
    return api.get<MyCoursesListResponse>("/courses/mine");
  },

  listDeletedCourses: (
    params?: DeletedCoursesQuery,
  ): Promise<DeletedCoursesListResponse> => {
    return api.get<DeletedCoursesListResponse>("/bin/courses", { params });
  },

  restoreCourse: (id: string): Promise<RestoreCourseResponse> => {
    return api.post<RestoreCourseResponse>(`/bin/courses/${id}/restore`);
  },

  getCourseEditor: (courseId: string): Promise<CourseEditorDataResponse> => {
    return api.get<CourseEditorDataResponse>(`/courses/${courseId}/editor`);
  },

  getPreview: (courseId: string): Promise<CourseEditorDataResponse> => {
    return api.get<CourseEditorDataResponse>(`/courses/${courseId}/preview`);
  },

  getValidation: (courseId: string): Promise<CourseValidationResponse> => {
    return api.get<CourseValidationResponse>(`/courses/${courseId}/validation`);
  },

  publishCourse: (courseId: string): Promise<CourseStatusResponse> => {
    return api.post<CourseStatusResponse>(`/courses/${courseId}/publish`);
  },

  unpublishCourse: (courseId: string): Promise<CourseStatusResponse> => {
    return api.post<CourseStatusResponse>(`/courses/${courseId}/unpublish`);
  },

  createCourse: (
    payload: CreateCourseRequest,
  ): Promise<CourseCreatedResponse> => {
    return api.post<CourseCreatedResponse>("/courses", payload);
  },

  updateCourseBasics: (
    id: string,
    payload: UpdateCourseBasicsRequest,
  ): Promise<CourseBasicsResponse> => {
    return api.patch<CourseBasicsResponse>(`/courses/${id}/basics`, payload);
  },

  deleteCourse: (id: string): Promise<CourseDeleteResponse> => {
    return api.delete<CourseDeleteResponse>(`/courses/${id}`);
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
  ): Promise<{ id: string; title: string }> => {
    return api.post<{ id: string; title: string }>(
      `/courses/${courseId}/sections`,
      payload,
    );
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
  ): Promise<{ id: string }> => {
    return api.post<{ id: string }>(
      `/courses/${courseId}/sections/${sectionId}/lessons`,
      payload,
    );
  },

  updateLesson: (
    courseId: string,
    lessonId: string,
    payload: UpdateCourseLessonRequest,
  ): Promise<{ success: boolean }> => {
    return api.patch<{ success: boolean }>(
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

  createLessonResource: (
    courseId: string,
    lessonId: string,
    payload: CreateLessonResourceRequest,
  ): Promise<LessonResource> => {
    return api.post<LessonResource>(
      `/courses/${courseId}/lessons/${lessonId}/resources`,
      payload,
    );
  },

  deleteLessonResource: (
    courseId: string,
    resourceId: string,
  ): Promise<{ success: boolean }> => {
    return api.delete<{ success: boolean }>(
      `/courses/${courseId}/resources/${resourceId}`,
    );
  },

  /**
   * Resolves the short-lived link that downloads one resource of a lesson.
   * `courseKey` is the course slug or id; the lesson is its public number.
   */
  getLessonResourceDownload: (
    courseKey: string,
    lessonNumber: number,
    resourceId: string,
  ): Promise<LessonResourceDownloadResponse> => {
    return api.get<LessonResourceDownloadResponse>(
      `/courses/${encodeURIComponent(courseKey)}/lessons/${lessonNumber}/resources/${resourceId}/download`,
    );
  },

  upsertAccessRules: (
    courseId: string,
    payload: UpdateCourseAccessRuleRequest,
  ): Promise<CourseAccessRule> => {
    return api.put<CourseAccessRule>(
      `/courses/${courseId}/access-rules`,
      payload,
    );
  },

  upsertSettings: (
    courseId: string,
    payload: UpdateCourseSettingsRequest,
  ): Promise<CourseSettings> => {
    return api.put<CourseSettings>(`/courses/${courseId}/settings`, payload);
  },

  upsertPricing: (
    courseId: string,
    payload: UpdateCoursePricingRequest,
  ): Promise<CoursePricing> => {
    return api.put<CoursePricing>(`/courses/${courseId}/pricing`, payload);
  },

  listIncludes: (courseId: string): Promise<CourseIncludesListResponse> => {
    return api.get<CourseIncludesListResponse>(`/courses/${courseId}/includes`);
  },

  createInclude: (
    courseId: string,
    payload: CreateCourseIncludeRequest,
  ): Promise<CourseIncludeItem> => {
    return api.post<CourseIncludeItem>(
      `/courses/${courseId}/includes`,
      payload,
    );
  },

  updateInclude: (
    courseId: string,
    includeId: string,
    payload: UpdateCourseIncludeRequest,
  ): Promise<CourseIncludeItem> => {
    return api.patch<CourseIncludeItem>(
      `/courses/${courseId}/includes/${includeId}`,
      payload,
    );
  },

  deleteInclude: (
    courseId: string,
    includeId: string,
  ): Promise<{ success: boolean }> => {
    return api.delete<{ success: boolean }>(
      `/courses/${courseId}/includes/${includeId}`,
    );
  },

  reorderIncludes: (
    courseId: string,
    payload: ReorderCourseIncludesRequest,
  ): Promise<{ success: boolean }> => {
    return api.post<{ success: boolean }>(
      `/courses/${courseId}/includes/reorder`,
      payload,
    );
  },
};
