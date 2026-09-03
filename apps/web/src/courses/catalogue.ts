export type CourseLevel = "Beginner" | "Intermediate";
export type CourseCategory = "Design" | "Development" | "Database" | "Cloud";
export type CourseRole = "student" | "creator";
export type CourseEnrollmentFilter =
  | "all"
  | "enrolled"
  | "not-enrolled"
  | "published"
  | "draft"
  | "bin";
export type CourseSort = "latest" | "title" | "progress";
export type CourseStatusFilter =
  | "all"
  | "in-progress"
  | "not-started"
  | "completed"
  | "published"
  | "draft"
  | "bin";
export type CourseLifecycleStatus = "published" | "draft" | "archived";

export interface CourseOpenOptions {
  preview?: boolean;
}

export interface CoursePricing {
  price: string;
  originalPrice: string;
  discount: string;
}

export interface Course {
  id: string;
  title: string;
  description: string;
  level: CourseLevel;
  category: CourseCategory;
  sections: number;
  lectures: number;
  progress: number | null;
  enrolled: boolean;
  duration: string;
  students: number;
  thumbnail: string;
  lifecycleStatus: CourseLifecycleStatus;
  pricing?: CoursePricing;
  certificateAvailable?: boolean;
  slug?: string;
  createdAt?: string;
  updatedAt?: string;
  deletedAt?: string;
  purgeAt?: string;
  isApi?: boolean;
}

/**
 * Learner-facing links should use the readable public slug. The ID fallback
 * keeps local/demo courses and older records working.
 */
export function getCourseRouteKey(course: Pick<Course, "id" | "slug">): string {
  return course.slug?.trim() || course.id;
}

export interface CourseCatalogueFilters {
  activeSection: string;
  wishlisted: ReadonlySet<string>;
  role: CourseRole;
  enrollmentFilter: CourseEnrollmentFilter;
  statusFilter: CourseStatusFilter;
  search: string;
  sort: CourseSort;
}

export function getVisibleCourses(
  catalogue: readonly Course[],
  {
    activeSection,
    wishlisted,
    role,
    enrollmentFilter,
    statusFilter,
    search,
    sort,
  }: CourseCatalogueFilters,
): Course[] {
  const normalizedSearch = search.trim().toLowerCase();
  let result = catalogue.filter((course) => {
    if (activeSection === "Wishlist" && !wishlisted.has(course.id))
      return false;
    if (
      role === "student" &&
      enrollmentFilter === "enrolled" &&
      !course.enrolled
    )
      return false;
    if (
      role === "student" &&
      enrollmentFilter === "not-enrolled" &&
      course.enrolled
    )
      return false;
    if (
      role === "creator" &&
      enrollmentFilter !== "all" &&
      enrollmentFilter !== "bin" &&
      course.lifecycleStatus !== enrollmentFilter
    )
      return false;
    if (statusFilter !== "all" && role === "student") {
      const progress = course.progress ?? 0;
      if (
        statusFilter === "in-progress" &&
        (!course.enrolled || progress <= 0 || progress >= 100)
      )
        return false;
      if (
        statusFilter === "not-started" &&
        (!course.enrolled || progress !== 0)
      )
        return false;
      if (statusFilter === "completed" && (!course.enrolled || progress < 100))
        return false;
    }
    return (
      !normalizedSearch ||
      `${course.title} ${course.description}`
        .toLowerCase()
        .includes(normalizedSearch)
    );
  });
  if (
    role === "student" &&
    enrollmentFilter === "all" &&
    sort === "latest" &&
    result.length > 1
  ) {
    const contrastingCourseIndex = result.findIndex(
      (course, index) => index > 0 && course.enrolled !== result[0]?.enrolled,
    );
    if (contrastingCourseIndex > 1) {
      const firstCourse = result[0]!;
      const contrastingCourse = result[contrastingCourseIndex]!;
      result = [
        firstCourse,
        contrastingCourse,
        ...result.slice(1, contrastingCourseIndex),
        ...result.slice(contrastingCourseIndex + 1),
      ];
    }
  }
  if (role === "creator" && sort === "latest") {
    result = [...result].sort((a, b) => {
      const dateA = a.updatedAt || a.createdAt;
      const dateB = b.updatedAt || b.createdAt;
      const timeA = dateA ? new Date(dateA).getTime() : 0;
      const timeB = dateB ? new Date(dateB).getTime() : 0;
      if (timeA !== timeB) return timeB - timeA;
      return 0;
    });
  }
  if (sort === "title")
    result = [...result].sort((a, b) => a.title.localeCompare(b.title));
  if (sort === "progress")
    result = [...result].sort((a, b) => (b.progress || 0) - (a.progress || 0));
  return result;
}
