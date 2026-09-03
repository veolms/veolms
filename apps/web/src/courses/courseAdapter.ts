import type {
  Course as ApiCourse,
  CourseSummary,
  CoursePricingSummary,
  DeletedCourse,
} from "@veolms/contracts";
import type {
  Course,
  CourseCategory,
  CourseLevel,
  CourseLifecycleStatus,
  CoursePricing,
} from "./catalogue";

export function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return "0h 0m";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0 && minutes > 0) return `${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h`;
  return `${minutes}m`;
}

export function formatCoursePricing(
  pricing?: CoursePricingSummary,
): CoursePricing | undefined {
  if (!pricing) return undefined;
  if (pricing.pricingType === "free") {
    return {
      price: "Free",
      originalPrice: "",
      discount: "",
    };
  }
  const currency = pricing.currency || "INR";
  const formatAmount = (amount: number) =>
    new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(amount);

  const formattedPrice = formatAmount(Number(pricing.price) / 100);

  if (
    pricing.salePrice !== null &&
    pricing.salePrice !== undefined &&
    pricing.salePrice < pricing.price
  ) {
    const formattedSalePrice = formatAmount(Number(pricing.salePrice) / 100);
    const discountPercent = Math.round(
      ((pricing.price - pricing.salePrice) / pricing.price) * 100,
    );
    return {
      price: formattedSalePrice,
      originalPrice: formattedPrice,
      discount: `${discountPercent}% off`,
    };
  }

  return {
    price: formattedPrice,
    originalPrice: "",
    discount: "",
  };
}

/**
 * Adapts an enriched CourseSummary from GET /api/v1/courses into the frontend Course model
 * consumed by CourseCatalogue and CourseCard for student exploration.
 */
export function adaptCourseSummaryToCatalogueCourse(
  summary: CourseSummary,
): Course {
  const validLevel: CourseLevel =
    summary.difficulty === "advanced" || summary.difficulty === "intermediate"
      ? "Intermediate"
      : "Beginner";

  const validCategory: CourseCategory =
    summary.categoryName === "Design" ||
    summary.categoryName === "Development" ||
    summary.categoryName === "Database" ||
    summary.categoryName === "Cloud"
      ? summary.categoryName
      : "Development";

  return {
    id: summary.id,
    slug: summary.slug,
    title: summary.title,
    description: summary.shortDescription || "",
    level: validLevel,
    category: validCategory,
    sections: summary.totalSections,
    lectures: summary.totalLessons,
    progress: null,
    enrolled: false,
    duration: formatDuration(summary.totalDurationSeconds),
    students: 0,
    thumbnail: summary.thumbnailUrl || "",
    lifecycleStatus: "published",
    pricing: formatCoursePricing(summary.pricing),
    certificateAvailable: summary.certificateEnabled,
    isApi: true,
  };
}

/**
 * Adapts an API course from GET /api/v1/courses/mine into the frontend Course model
 * consumed by CourseCatalogue and CourseCard.
 */
export function adaptApiCourseToCatalogueCourse(apiCourse: ApiCourse): Course {
  const thumbnail = apiCourse.thumbnailMediaId
    ? `/api/v1/media/${apiCourse.thumbnailMediaId}`
    : "";

  const validStatus: CourseLifecycleStatus =
    apiCourse.status === "published" ||
    apiCourse.status === "draft" ||
    apiCourse.status === "archived"
      ? apiCourse.status
      : "draft";

  return {
    id: apiCourse.id,
    slug: apiCourse.slug,
    title: apiCourse.title,
    description: apiCourse.shortDescription || apiCourse.description || "",
    level:
      apiCourse.difficulty === "advanced" ||
      apiCourse.difficulty === "intermediate"
        ? "Intermediate"
        : "Beginner",
    category: "Development",
    sections: apiCourse.totalSections ?? 0,
    lectures: apiCourse.totalLessons ?? 0,
    progress: null,
    enrolled: false,
    duration: formatDuration(apiCourse.totalDurationSeconds ?? 0),
    students: 0,
    thumbnail,
    lifecycleStatus: validStatus,
    createdAt: apiCourse.createdAt,
    updatedAt: apiCourse.updatedAt,
    isApi: true,
  };
}

/**
 * Adapts a deleted course from GET /api/v1/bin/courses into the frontend Course model
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
    purgeAt: deletedCourse.purgeAt,
    isApi: true,
  };
}
