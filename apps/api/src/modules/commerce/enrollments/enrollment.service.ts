import type {
  AcademyEnrollmentListItem,
  EnrolledCourse,
} from "@veolms/contracts";
import type { Executor } from "../shared/repository.types.ts";
import { toEnrolledCourseContract } from "./enrollment.mapper.ts";
import * as enrollmentRepo from "./enrollment.repository.ts";
import * as orderRepo from "../orders/order.repository.ts";
import * as courseConfigRepo from "../../courses/configuration/configuration.repository.ts";
import { CommerceErrors } from "../shared/commerce.errors.ts";
import {
  createCourseAccessService,
  type CourseAccessService,
} from "../shared/course-access.service.ts";
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
  /**
   * Removes the learner from a free course they joined at no cost. Their
   * progress is kept, so enrolling again picks up where they left off.
   */
  unenrollFromFreeCourse(userId: string, courseId: string): Promise<void>;
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
  courseAccessService = createCourseAccessService(),
}: {
  database: Executor;
  courseService: Pick<CourseService, "resolveCourseThumbnailUrls">;
  studentsService?: Pick<StudentsService, "resolveStudentAvatars">;
  courseAccessService?: Pick<CourseAccessService, "withdrawCourseFromOrder">;
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

  async function unenrollFromFreeCourse(
    userId: string,
    courseId: string,
  ): Promise<void> {
    await database.transaction().execute(async (trx) => {
      const enrollment = await enrollmentRepo.findEnrollment(
        trx,
        userId,
        courseId,
      );
      if (!enrollment || enrollment.status !== "active") {
        throw CommerceErrors.ENROLLMENT_NOT_FOUND();
      }

      // Only an enrollment that cost nothing, in a course that is still
      // free, can be left: the learner can come back whenever they like.
      // Anything bought (on its own or in a bundle) or granted by staff
      // stays, so a paid place is never given up by accident.
      const orderId = enrollment.order_id;
      if (!orderId || enrollment.source !== "direct_purchase") {
        throw CommerceErrors.UNENROLL_NOT_ALLOWED();
      }
      const [[pricing], orderItems] = await Promise.all([
        courseConfigRepo.findPricingByCourseIds(trx, [courseId]),
        orderRepo.listOrderItems(trx, orderId),
      ]);
      const orderItem = orderItems.find(
        (item) => item.item_type === "course" && item.course_id === courseId,
      );
      if (
        pricing?.pricing_type !== "free" ||
        !orderItem ||
        orderItem.final_amount !== 0
      ) {
        throw CommerceErrors.UNENROLL_NOT_ALLOWED();
      }

      await courseAccessService.withdrawCourseFromOrder(
        trx,
        { id: orderId, user_id: userId },
        courseId,
      );

      // An order with nothing left on it is closed. One that still holds
      // another course (several free courses enrolled together) stays paid.
      const remainingCourseIds =
        await enrollmentRepo.listActiveEnrollmentCourseIdsByOrderId(
          trx,
          orderId,
        );
      if (remainingCourseIds.length === 0) {
        await orderRepo.cancelFreeOrder(trx, orderId);
      }
    });
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
    unenrollFromFreeCourse,
    getEnrollmentStats,
    getEnrollmentActivityBuckets,
    listTopCoursesByEnrollment,
    listEnrollmentCountsByCourse,
  };
}
