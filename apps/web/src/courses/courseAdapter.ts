import type {
  CourseSummary,
  CoursePricingSummary,
  DeletedCourse,
  ManagedCourseSummary,
} from "@veolms/contracts";
import type { Course, CourseLifecycleStatus, CoursePricing } from "./catalogue";
import {
  getCourseThumbnailCdnSrcSet,
  getCourseThumbnailCdnUrl,
} from "./courseMedia";

export function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return "0h 0m";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0 && minutes > 0) return `${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h`;
  return `${minutes}m`;
}

export function resolveCourseDurationSeconds(
  durationSeconds?: number | null,
  estimatedDurationMinutes?: number | null,
): number {
  if (durationSeconds && durationSeconds > 0) return durationSeconds;
  if (estimatedDurationMinutes && estimatedDurationMinutes > 0) {
    return estimatedDurationMinutes * 60;
  }
  return 0;
}

export function formatCoursePricing(
  pricing?: CoursePricingSummary,
): CoursePricing | undefined {
  if (!pricing) return undefined;
  const currency = pricing.currency || "INR";
  const formatAmount = (amount: number) =>
    new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(amount);

  if (pricing.pricingType === "free") {
    // A free course that names what it would otherwise cost shows that
    // price struck through beside a price of zero, and always carries the
    // "Free" badge so the zero is not read as a typo.
    if (pricing.price > 0) {
      return {
        price: formatAmount(0),
        originalPrice: formatAmount(Number(pricing.price)),
        discount: "Free",
        showDiscountBadge: true,
        free: true,
      };
    }
    return {
      price: "Free",
      originalPrice: "",
      discount: "",
      free: true,
    };
  }

  const formattedPrice = formatAmount(Number(pricing.price));

  if (
    pricing.salePrice !== null &&
    pricing.salePrice !== undefined &&
    pricing.salePrice < pricing.price
  ) {
    const formattedSalePrice = formatAmount(Number(pricing.salePrice));
    const discountPercent = Math.round(
      ((pricing.price - pricing.salePrice) / pricing.price) * 100,
    );
    return {
      price: formattedSalePrice,
      originalPrice: formattedPrice,
      discount: `${discountPercent}% off`,
      showDiscountBadge: pricing.showDiscountBadge === true,
    };
  }

  return {
    price: formattedPrice,
    originalPrice: "",
    discount: "",
  };
}

/**
 * Adapts an enriched CourseSummary from GET /v1/courses into the frontend Course model
 * consumed by CourseCatalogue and CourseCard for student exploration.
 */
export function adaptCourseSummaryToCatalogueCourse(
  summary: CourseSummary,
  enrolled?: ReadonlySet<string> | boolean | number,
  progressMap?: ReadonlyMap<string, number | null> | unknown,
): Course {
  const isEnrolled =
    typeof enrolled === "boolean"
      ? enrolled
      : typeof enrolled === "number" || !enrolled
        ? false
        : enrolled.has(summary.id) ||
          (summary.slug ? enrolled.has(summary.slug) : false);

  const validProgressMap =
    progressMap &&
    typeof (progressMap as ReadonlyMap<string, number | null>).get ===
      "function"
      ? (progressMap as ReadonlyMap<string, number | null>)
      : null;

  const courseProgress = validProgressMap
    ? (validProgressMap.get(summary.id) ??
      (summary.slug ? validProgressMap.get(summary.slug) : null) ??
      null)
    : null;

  return {
    id: summary.id,
    slug: summary.slug,
    title: summary.title,
    description: summary.shortDescription || "",
    // Catalogue cards show neither; the course overview loads its own.
    level: "Beginner",
    category: "Development",
    sections: summary.totalSections,
    lectures: summary.totalLessons,
    progress: courseProgress,
    enrolled: isEnrolled,
    duration: formatDuration(summary.totalDurationSeconds),
    students: 0,
    thumbnail: summary.thumbnailUrl || "",
    thumbnailSrcSet: summary.thumbnailSrcSet,
    lifecycleStatus: "published",
    pricing: formatCoursePricing(summary.pricing),
    certificateAvailable: summary.certificateEnabled,
    isApi: true,
  };
}

/**
 * Adapts an API course from GET /v1/courses/mine into the frontend Course model
 * consumed by CourseCatalogue and CourseCard.
 */
export function adaptApiCourseToCatalogueCourse(
  apiCourse: ManagedCourseSummary,
  enrolled?: ReadonlySet<string> | boolean | number,
  progressMap?: ReadonlyMap<string, number | null> | unknown,
): Course {
  const thumbnail =
    apiCourse.thumbnailUrl ||
    getCourseThumbnailCdnUrl(apiCourse.thumbnailMediaId) ||
    "";

  const validStatus: CourseLifecycleStatus =
    apiCourse.status === "published" ||
    apiCourse.status === "draft" ||
    apiCourse.status === "archived"
      ? apiCourse.status
      : "draft";

  const isEnrolled =
    typeof enrolled === "boolean"
      ? enrolled
      : typeof enrolled === "number" || !enrolled
        ? false
        : enrolled.has(apiCourse.id) ||
          (apiCourse.slug ? enrolled.has(apiCourse.slug) : false);

  const validProgressMap =
    progressMap &&
    typeof (progressMap as ReadonlyMap<string, number | null>).get ===
      "function"
      ? (progressMap as ReadonlyMap<string, number | null>)
      : null;

  const courseProgress = validProgressMap
    ? (validProgressMap.get(apiCourse.id) ??
      (apiCourse.slug ? validProgressMap.get(apiCourse.slug) : null) ??
      null)
    : null;

  return {
    id: apiCourse.id,
    slug: apiCourse.slug,
    title: apiCourse.title,
    // The list sends the short description, or the opening of the full one
    // when a course has none.
    description: apiCourse.shortDescription || "",
    level:
      apiCourse.difficulty === "advanced" ||
      apiCourse.difficulty === "intermediate"
        ? "Intermediate"
        : "Beginner",
    category: "Development",
    sections: apiCourse.totalSections,
    lectures: apiCourse.totalLessons,
    progress: courseProgress,
    enrolled: isEnrolled,
    duration: formatDuration(apiCourse.totalDurationSeconds),
    students: 0,
    thumbnail,
    thumbnailSrcSet:
      apiCourse.thumbnailSrcSet ||
      getCourseThumbnailCdnSrcSet(apiCourse.thumbnailMediaId),
    lifecycleStatus: validStatus,
    createdAt: apiCourse.createdAt,
    updatedAt: apiCourse.updatedAt,
    creatorId: apiCourse.creatorId,
    isApi: true,
  };
}

/**
 * Adapts a deleted course from GET /v1/bin/courses into the frontend Course model
 * consumed by CourseCatalogue and CourseCard when viewing the Bin.
 */
export function adaptDeletedCourseToCatalogueCourse(
  deletedCourse: DeletedCourse,
): Course {
  const validStatus: CourseLifecycleStatus =
    deletedCourse.status === "published" ||
    deletedCourse.status === "draft" ||
    deletedCourse.status === "archived"
      ? deletedCourse.status
      : "draft";

  return {
    id: deletedCourse.id,
    slug: deletedCourse.slug,
    title: deletedCourse.title,
    description: "",
    level: "Beginner",
    category: "Development",
    sections: 0,
    lectures: 0,
    progress: null,
    enrolled: false,
    duration: "0h 0m",
    students: 0,
    thumbnail: "",
    lifecycleStatus: validStatus,
    deletedAt: deletedCourse.deletedAt,
    creatorId: deletedCourse.creatorId,
    isApi: true,
  };
}
