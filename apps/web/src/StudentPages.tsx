import type { EnrolledCourse } from "@veolms/contracts";
import { getCourseThumbnail, getCourseThumbnailSrcSet } from "./learning/courseMetadata";

export interface LearningCourse {
  id: string;
  slug?: string;
  title: string;
  sections: number;
  lectures: number;
  status: "in-progress" | "not-started" | "completed";
  progress: number;
  lastLesson?: string;
  accessed?: string;
  enrolledOn?: string;
  enrolledAt?: string | Date;
  lastAccessedAt?: string | Date | null;
  completedOn?: string;
  thumbnail: string;
  thumbnailSrcSet?: string;
}

export function adaptEnrolledCourseToLearningCourse(ec: EnrolledCourse): LearningCourse {
  const status: "in-progress" | "not-started" | "completed" =
    ec.progress === 100
      ? "completed"
      : ec.progress !== null && ec.progress > 0
        ? "in-progress"
        : "not-started";

  const enrolledDateStr = ec.enrolledAt
    ? new Date(ec.enrolledAt).toLocaleDateString("en-US", {
        month: "short",
        day: "2-digit",
        year: "numeric",
      })
    : undefined;

  return {
    id: ec.courseId,
    slug: ec.courseSlug,
    title: ec.courseTitle,
    sections: ec.totalSections,
    lectures: ec.totalLessons,
    status,
    progress: ec.progress ?? 0,
    enrolledAt: ec.enrolledAt,
    lastAccessedAt: ec.lastAccessedAt ?? null,
    enrolledOn: enrolledDateStr,
    thumbnail: ec.courseThumbnailUrl || getCourseThumbnail(ec.courseSlug),
    thumbnailSrcSet: ec.courseThumbnailUrl ? undefined : getCourseThumbnailSrcSet(ec.courseSlug),
  };
}
