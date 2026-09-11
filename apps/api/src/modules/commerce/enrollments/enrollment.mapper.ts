import type { EnrolledCourse } from "@veolms/contracts";

interface EnrolledCourseRow {
  enrollment_id: string;
  course_id: string;
  course_slug: string;
  course_title: string;
  course_description: string | null;
  course_thumbnail_url: string | null;
  total_sections: number;
  total_lessons: number;
  total_duration_seconds: number;
  enrolled_at: Date;
  enrollment_status: string;
  enrollment_source: string;
  access_expires_at: Date | null;
  lesson_number?: number | null;
  last_accessed_at?: Date | null;
}

export function toEnrolledCourseContract(
  row: EnrolledCourseRow,
): EnrolledCourse {
  const totalLessons = Number(row.total_lessons) || 0;
  let progress: number | null = null;
  if (row.lesson_number != null && row.lesson_number > 0) {
    const total = totalLessons > 0 ? totalLessons : 84;
    progress = Math.min(100, Math.max(1, Math.round((row.lesson_number / total) * 100)));
  } else {
    progress = 0;
  }

  return {
    enrollmentId: row.enrollment_id,
    courseId: row.course_id,
    courseSlug: row.course_slug,
    courseTitle: row.course_title,
    courseDescription: row.course_description,
    courseThumbnailUrl: row.course_thumbnail_url,
    totalSections: Number(row.total_sections) || 0,
    totalLessons,
    totalDurationSeconds: Number(row.total_duration_seconds) || 0,
    enrolledAt: row.enrolled_at,
    status: row.enrollment_status as EnrolledCourse["status"],
    source: row.enrollment_source as EnrolledCourse["source"],
    progress,
    lastAccessedAt: row.last_accessed_at ?? null,
    accessExpiresAt: row.access_expires_at,
  };
}
