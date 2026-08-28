import type { Course as ApiCourse } from "@veolms/contracts";
import type { Course, CourseLifecycleStatus } from "./catalogue";
import { getCourseThumbnail } from "../learning/courseMetadata";
import typescriptThumbnail from "../assets/course-thumbnails/typescript-960.webp";

/**
 * Adapts an API course from GET /api/v1/courses/mine into the frontend Course model
 * consumed by CourseCatalogue and CourseCard.
 */
export function adaptApiCourseToCatalogueCourse(apiCourse: ApiCourse): Course {
  const fallbackThumbnail = apiCourse.slug
    ? getCourseThumbnail(apiCourse.slug)
    : typescriptThumbnail;

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
    sections: 0,
    lectures: 0,
    progress: null,
    enrolled: false,
    duration: "Self-paced",
    students: 0,
    thumbnail: fallbackThumbnail,
    lifecycleStatus: validStatus,
    createdAt: apiCourse.createdAt,
    updatedAt: apiCourse.updatedAt,
  };
}
