export type CourseLevel = "Beginner" | "Intermediate";
export type CourseCategory = "Design" | "Development" | "Database" | "Cloud";
export type CourseRole = "student" | "creator";
export type CourseEnrollmentFilter =
  | "all"
  | "enrolled"
  | "not-enrolled"
  | "wishlist"
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
  thumbnailSrcSet?: readonly { url: string; width: number; height: number }[];
  lifecycleStatus: CourseLifecycleStatus;
  pricing?: CoursePricing;
  certificateAvailable?: boolean;
  slug?: string;
  createdAt?: string;
  updatedAt?: string;
  deletedAt?: string;
  purgeAt?: string;
  isApi?: boolean;
  creatorId?: string | null;
}

/**
 * Learner-facing links should use the readable public slug. The ID fallback
 * keeps local/demo courses and older records working.
 */
export function getCourseRouteKey(course: Pick<Course, "id" | "slug">): string {
  return course.slug?.trim() || course.id;
}

/**
 * The local catalogue predates the API catalogue and some of its IDs are
 * still used by saved links and browser session state. Keep those IDs valid
 * at the API boundary without changing the public routes used by the demo UI.
 */
const LEGACY_API_COURSE_SLUGS: Readonly<Record<string, string>> = {
  "backend-nodejs": "complete-backend-development-with-nodejs",
  "typescript-course": "ultimate-typescript-course",
};

export function getApiCourseSlugForLegacyKey(
  courseKey: string | undefined,
): string | undefined {
  return courseKey ? LEGACY_API_COURSE_SLUGS[courseKey] : undefined;
}

export interface CourseCatalogueFilters {
  wishlisted: ReadonlySet<string>;
  role: CourseRole;
  enrollmentFilter: CourseEnrollmentFilter;
  statusFilter: CourseStatusFilter;
  search: string;
  sort: CourseSort;
  /**
   * The "contrasting enrollment" promotion moves one card to position 1,
   * shifting every already-painted card below it. When enrollment data
   * arrives only after the prerendered grid has painted, the caller passes
   * false so the visible order stays stable (the promotion applies again on
   * the next catalogue visit). Defaults to true.
   */
  enrollmentPromotionAllowed?: boolean;
}

export function courseMatchesWishlist(
  course: Pick<Course, "id" | "slug">,
  wishlisted: ReadonlySet<string>,
): boolean {
  if (wishlisted.has(course.id)) return true;
  const slug = course.slug?.trim();
  return Boolean(slug && wishlisted.has(slug));
}

function matchesCourseSearch(
  course: Course,
  normalizedSearch: string,
): boolean {
  return (
    !normalizedSearch ||
    `${course.title} ${course.description}`
      .toLowerCase()
      .includes(normalizedSearch)
  );
}

function matchesCourseStatusFilter(
  course: Course,
  role: CourseRole,
  statusFilter: CourseStatusFilter,
): boolean {
  if (statusFilter === "all" || role !== "student") return true;
  const progress = course.progress ?? 0;
  if (
    statusFilter === "in-progress" &&
    (!course.enrolled || progress <= 0 || progress >= 100)
  )
    return false;
  if (statusFilter === "not-started" && (!course.enrolled || progress !== 0))
    return false;
  if (statusFilter === "completed" && (!course.enrolled || progress < 100))
    return false;
  return true;
}

export interface CourseQuickFilterCounts {
  all: number;
  enrolled: number;
  "not-enrolled": number;
  published: number;
  draft: number;
  bin: number;
  wishlist: number;
}

export function getCourseQuickFilterCounts(
  catalogue: readonly Course[],
  {
    wishlisted,
    role,
    statusFilter,
    search,
  }: Pick<
    CourseCatalogueFilters,
    "wishlisted" | "role" | "statusFilter" | "search"
  >,
): CourseQuickFilterCounts {
  const normalizedSearch = search.trim().toLowerCase();
  const pool = catalogue.filter((course) => {
    if (!matchesCourseSearch(course, normalizedSearch)) return false;
    return matchesCourseStatusFilter(course, role, statusFilter);
  });

  const wishlistPool = pool.filter((course) =>
    courseMatchesWishlist(course, wishlisted),
  );

  if (role === "student") {
    const enrolled = pool.filter((course) => course.enrolled).length;
    return {
      all: pool.length,
      enrolled,
      "not-enrolled": pool.length - enrolled,
      published: 0,
      draft: 0,
      bin: 0,
      wishlist: wishlistPool.length,
    };
  }

  const published = pool.filter(
    (course) => course.lifecycleStatus === "published",
  ).length;
  const draft = pool.filter(
    (course) => course.lifecycleStatus === "draft",
  ).length;

  return {
    all: pool.length,
    enrolled: 0,
    "not-enrolled": 0,
    published,
    draft,
    bin: 0,
    wishlist: wishlistPool.length,
  };
}

export function getVisibleCourses(
  catalogue: readonly Course[],
  {
    wishlisted,
    role,
    enrollmentFilter,
    statusFilter,
    search,
    sort,
    enrollmentPromotionAllowed = true,
  }: CourseCatalogueFilters,
): Course[] {
  const normalizedSearch = search.trim().toLowerCase();
  let result = catalogue.filter((course) => {
    if (
      role === "student" &&
      enrollmentFilter === "wishlist" &&
      !courseMatchesWishlist(course, wishlisted)
    )
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
    enrollmentPromotionAllowed &&
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
