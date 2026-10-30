import type { EnrolledCourse } from "@veolms/contracts";

interface EnrolledCourseRow {
  course_id: string;
  course_slug: string;
  course_title: string;
  course_thumbnail_url: string | null;
  course_thumbnail_media_id: string | null;
  total_sections: number;
  total_lessons: number;
  total_duration_seconds: number;
  enrolled_at: Date;
  progress_percent?: number | string | null;
  last_accessed_at?: Date | null;
}

export function toEnrolledCourseContract(
  row: EnrolledCourseRow,
): EnrolledCourse {
  const progressValue = Number(row.progress_percent);
  const progress =
    row.progress_percent == null || !Number.isFinite(progressValue)
      ? 0
      : // Two decimals, so a few minutes of a long course show as more
        // than nothing (0.42%), and a course is only 100 when it is.
        Math.min(100, Math.max(0, Math.round(progressValue * 100) / 100));

  return {
    courseId: row.course_id,
    courseSlug: row.course_slug,
    courseTitle: row.course_title,
    courseThumbnailUrl: row.course_thumbnail_url,
    courseThumbnailMediaId: row.course_thumbnail_media_id,
    totalSections: Number(row.total_sections) || 0,
    totalLessons: Number(row.total_lessons) || 0,
    totalDurationSeconds: Number(row.total_duration_seconds) || 0,
    enrolledAt: row.enrolled_at,
    progress,
    lastAccessedAt: row.last_accessed_at ?? null,
  };
}
