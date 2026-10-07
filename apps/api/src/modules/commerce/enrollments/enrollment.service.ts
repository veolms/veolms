import type {
  AcademyEnrollmentListItem,
  EnrolledCourse,
} from "@veolms/contracts";
import type { Executor } from "../shared/repository.types.ts";
import { toEnrolledCourseContract } from "./enrollment.mapper.ts";
import * as enrollmentRepo from "./enrollment.repository.ts";
import {
  createStudentsService,
  type StudentsService,
} from "../../students/index.ts";
import type { CourseService } from "../../courses/index.ts";
import { ADMIN_ROLE } from "../../auth/index.ts";

export interface EnrollmentService {
  listEnrolledCourses(
    userId: string,
    userRoles?: readonly string[],
  ): Promise<EnrolledCourse[]>;
  listAcademyEnrollments(
    limit: number,
    actor: { id: string; roles: readonly string[] },
  ): Promise<AcademyEnrollmentListItem[]>;
  getEnrollmentStats(
    filters: enrollmentRepo.EnrollmentAnalyticsFilters,
  ): Promise<{ totalEnrollments: number }>;
  getEnrollmentActivityBuckets(
    filters: enrollmentRepo.EnrollmentAnalyticsFilters,
  ): Promise<Array<{ start: Date; value: number }>>;
  listTopCoursesByEnrollment(options: {
    limit: number;
    from?: Date;
    to?: Date;
    courseId?: string | string[];
  }): Promise<Array<{ courseId: string; enrollmentCount: number }>>;
  listEnrollmentCountsByCourse(options?: {
    courseId?: string | string[];
  }): Promise<Array<{ courseId: string; enrollmentCount: number }>>;
}

export function createEnrollmentService({
  database,
  courseService,
  studentsService = createStudentsService({ database }),
}: {
  database: Executor;
  courseService: Pick<CourseService, "resolveCourseThumbnailUrls">;
  studentsService?: Pick<StudentsService, "resolveStudentAvatars">;
}): EnrollmentService {
  async function listAcademyEnrollments(
    limit: number,
    actor: { id: string; roles: readonly string[] },
  ): Promise<AcademyEnrollmentListItem[]> {
    // Admins see the whole academy; other staff see only their own courses.
    const creatorId = actor.roles.includes(ADMIN_ROLE) ? undefined : actor.id;
    const rows = await enrollmentRepo.listAcademyEnrollments(
      database,
      limit,
      creatorId,
    );
    const avatarUrls = await studentsService.resolveStudentAvatars(
      rows.map((row) => ({
        id: row.student_id,
        avatarDataUrl: row.student_avatar_data_url,
      })),
    );

    return rows.map((row) => ({
      enrollmentId: row.enrollment_id,
      student: {
        username: row.student_username,
        displayName: row.student_display_name,
        avatarUrl: avatarUrls.get(row.student_id) ?? null,
      },
      course: {
        title: row.course_title,
      },
      averageProgressPercent:
        row.average_progress_percent === null
          ? null
          : Number(row.average_progress_percent),
      enrolledAt: row.enrolled_at,
    }));
  }

  async function listEnrolledCourses(
    userId: string,
    userRoles?: readonly string[],
  ): Promise<EnrolledCourse[]> {
    const rows = await enrollmentRepo.listEnrolledCoursesForUser(
      database,
      userId,
    );

    const resolvedThumbnails = await Promise.all(
      rows.map((row) =>
        courseService.resolveCourseThumbnailUrls(
          row.course_thumbnail_media_id,
          row.course_creator_id ?? undefined,
          userRoles,
        ),
      ),
    );

    return rows.map((row, index) =>
      toEnrolledCourseContract({
        course_id: row.course_id,
        course_slug: row.course_slug,
        course_title: row.course_title,
        course_thumbnail_url: resolvedThumbnails[index]?.thumbnailUrl ?? null,
        course_thumbnail_media_id: row.course_thumbnail_media_id,
        total_sections: Number(row.total_sections) || 0,
        total_lessons: Number(row.total_lessons) || 0,
        total_duration_seconds: Number(row.total_duration_seconds) || 0,
        enrolled_at: row.enrolled_at,
        progress_percent: row.progress_percent,
        last_accessed_at: row.last_accessed_at,
      }),
    );
  }

  async function getEnrollmentStats(
    filters: enrollmentRepo.EnrollmentAnalyticsFilters,
  ) {
    return await enrollmentRepo.getEnrollmentStats(database, filters);
  }

  async function getEnrollmentActivityBuckets(
    filters: enrollmentRepo.EnrollmentAnalyticsFilters,
  ) {
    return await enrollmentRepo.getEnrollmentActivityBuckets(database, filters);
  }

  async function listTopCoursesByEnrollment(options: {
    limit: number;
    from?: Date;
    to?: Date;
    courseId?: string | string[];
  }) {
    return await enrollmentRepo.listTopCoursesByEnrollment(database, options);
  }

  async function listEnrollmentCountsByCourse(
    options: {
      courseId?: string | string[];
    } = {},
  ) {
    return await enrollmentRepo.listEnrollmentCountsByCourse(database, options);
  }

  return {
    listAcademyEnrollments,
    listEnrolledCourses,
    getEnrollmentStats,
    getEnrollmentActivityBuckets,
    listTopCoursesByEnrollment,
    listEnrollmentCountsByCourse,
  };
}
