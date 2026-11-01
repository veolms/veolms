import type { IncludedWithCourse } from "@veolms/contracts";
import { fuzzyMatches } from "../lib/fuzzySearch";
export type CourseLevel = "Beginner" | "Intermediate";
export type CourseCategory = "Design" | "Development" | "Database" | "Cloud";
export type CourseRole = "student" | "creator";
export type CourseEnrollmentFilter =
  | "all"
  | "enrolled"
  | "not-enrolled"
  | "free"
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
  /** The lesson to open, rather than the one the course's address picks. */
  lessonNumber?: number;
  /** Pressed to watch: the lesson opens playing (see lessonOpenIntent). */
  autoplay?: boolean;
}

export interface CoursePricing {
  price: string;
  originalPrice: string;
  discount: string;
  /**
   * Show `discount` as a badge on the card: the creator's choice for a paid
   * course, always on for a free course that names its original price.
   */
  showDiscountBadge?: boolean;
  /** The course costs nothing to enroll in. */
  free?: boolean;
  /**
   * The same line at the course's price for buyers outside India, when it
   * has one; the page shows whichever the visitor's region calls for (see
   * `priceRegion.ts`).
   */
  international?: Pick<CoursePricing, "price" | "originalPrice" | "discount">;
}

export interface Course {
  id: string;
  title: string;
  description: string;
  level: CourseLevel;
  category: CourseCategory;
  sections: number;
  lectures: number;
  /** Percent watched, with up to two decimals (0.42). */
  progress: number | null;
  /**
   * The learner has watched some of it, which a long course can show as
   * 0.00% for a while (see `hasStartedCourse`).
   */
  started?: boolean;
  enrolled: boolean;
  /**
   * Whether this viewer holds the course is not known yet (the prerendered
   * page, or a signed-in browser before its enrolments arrive). The card
   * then shows neither a price nor progress: either could be wrong.
   */
  viewerStatePending?: boolean;
  /**
   * A signed-in viewer's courses could not be loaded: whether this one is
   * theirs is not known, so the card offers it neither way and says so.
   */
  viewerStateFailed?: boolean;
  /**
   * The price in force is not known yet ("pending": the card shimmers) or
   * could not be loaded ("failed"): `pricing` is then the course list's,
   * which says whether the course is free but is never shown as its price
   * (see `liveCoursePrices.ts`). Absent when `pricing` is the price in force.
   */
  priceStatus?: "pending" | "failed";
  duration: string;
  students: number;
  thumbnail: string;
  thumbnailSrcSet?: readonly { url: string; width: number }[];
  /** The wide picture behind the overview hero on desktop, when one is set. */
  banner?: string;
  bannerSrcSet?: readonly { url: string; width: number }[];
  lifecycleStatus: CourseLifecycleStatus;
  pricing?: CoursePricing;
  certificateAvailable?: boolean;
  slug?: string;
  createdAt?: string;
  updatedAt?: string;
  deletedAt?: string;
  isApi?: boolean;
  creatorId?: string | null;
  /**
   * The course list's `canSelfEnroll`: false for a course nobody may enrol
   * in themselves (access-restricted, with no price). Absent for a course
   * that did not come from that list.
   */
  canSelfEnroll?: boolean;
  /**
   * The course list's `includedWith`: for a linked-only course, the courses
   * it comes free with. Its card shows "Free with" the first of them in
   * place of a price, and "Enroll Now" opens that course.
   */
  includedWith?: readonly IncludedWithCourse[];
}

/**
 * Free for anyone to start: a linked-only course (`includedWith`) costs
 * nothing too, but comes only with the course it is part of.
 */
export function isOpenlyFree(
  course: Pick<Course, "pricing" | "includedWith">,
): boolean {
  return Boolean(course.pricing?.free) && !course.includedWith?.length;
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

/**
 * Whether the course belongs on the wish list as the learner sees it: one
 * they marked and have not enrolled in. A wish list is for courses still to
 * be taken, so a course leaves it the moment the learner enrols; the mark
 * itself is kept, and nothing has to be cleaned up when that happens.
 */
export function courseIsOnWishlist(
  course: Pick<Course, "id" | "slug" | "enrolled">,
  wishlisted: ReadonlySet<string>,
): boolean {
  return !course.enrolled && courseMatchesWishlist(course, wishlisted);
}

function matchesCourseSearch(
  course: Course,
  normalizedSearch: string,
): boolean {
  return (
    !normalizedSearch ||
    fuzzyMatches(normalizedSearch, course.title, course.description)
  );
}

/** Whether an enrolled learner has begun the course at all. */
export function hasBegunCourse(course: Pick<Course, "progress" | "started">) {
  return Boolean(course.started) || (course.progress ?? 0) > 0;
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
    (!course.enrolled || !hasBegunCourse(course) || progress >= 100)
  )
    return false;
  if (
    statusFilter === "not-started" &&
    (!course.enrolled || hasBegunCourse(course))
  )
    return false;
  if (statusFilter === "completed" && (!course.enrolled || progress < 100))
    return false;
  return true;
}

export interface CourseQuickFilterCounts {
  all: number;
  enrolled: number;
  "not-enrolled": number;
  free: number;
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
    courseIsOnWishlist(course, wishlisted),
  );

  if (role === "student") {
    const enrolled = pool.filter((course) => course.enrolled).length;
    return {
      all: pool.length,
      enrolled,
      "not-enrolled": pool.length - enrolled,
      free: pool.filter(isOpenlyFree).length,
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
    free: 0,
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
      !courseIsOnWishlist(course, wishlisted)
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
      role === "student" &&
      enrollmentFilter === "free" &&
      !isOpenlyFree(course)
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
        (!course.enrolled || !hasBegunCourse(course) || progress >= 100)
      )
        return false;
      if (
        statusFilter === "not-started" &&
        (!course.enrolled || hasBegunCourse(course))
      )
        return false;
      if (statusFilter === "completed" && (!course.enrolled || progress < 100))
        return false;
    }
    return (
      !normalizedSearch ||
      fuzzyMatches(normalizedSearch, course.title, course.description)
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
