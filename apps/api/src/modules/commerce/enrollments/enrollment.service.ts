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
import { hasAcademyPermission } from "../../authorization/index.ts";
import { createAccessService, type AccessService } from "../../access/index.ts";
import {
  createLessonProgressResetService,
  type LessonProgressResetService,
} from "../../learning-progress/index.ts";

export interface EnrollmentService {
  listEnrolledCourses(
    userId: string,
    userRoles?: readonly string[],
  ): Promise<EnrolledCourse[]>;
  /**
   * The learner's active enrolments with their progress, as
   * `listEnrolledCourses` reports it, without the card details (no
   * thumbnails are resolved).
   */
  listEnrollmentProgress(userId: string): Promise<
    Array<{
      courseId: string;
      progress: number;
      lastAccessedAt: Date | null;
      /** When the learner's access ends; null for access that does not. */
      accessExpiresAt: Date | null;
    }>
  >;
  /**
   * Removes the learner from a course.
   *
   * A learner may leave only a free course they joined at no cost; their
   * progress is kept, so enrolling again picks up where they left off.
   *
   * An admin may leave any course they are enrolled in, however they got
   * it (they enroll to try the academy as a learner would). No money is
   * returned and the order is left as it is, and their progress in the
   * course is cleared, so the next enrollment starts from nothing.
   */
  unenrollFromCourse(
    actor: { id: string; roles: readonly string[] },
    courseId: string,
  ): Promise<void>;
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
  accessService = createAccessService(),
  progressResetService = createLessonProgressResetService({ database }),
}: {
  database: Executor;
  courseService: Pick<CourseService, "resolveCourseThumbnailUrls">;
  studentsService?: Pick<StudentsService, "resolveStudentAvatars">;
  courseAccessService?: Pick<CourseAccessService, "withdrawCourseFromOrder">;
  accessService?: Pick<AccessService, "revokeCourseAccess">;
  progressResetService?: Pick<
    LessonProgressResetService,
    "clearCourseProgressForLearner"
  >;
}): EnrollmentService {
  async function listAcademyEnrollments(
    limit: number,
    actor: { id: string; roles: readonly string[] },
  ): Promise<AcademyEnrollmentListItem[]> {
    // Enrolment access through a role that reaches every course sees the
    // whole academy; an instructor sees only their own courses.
    const creatorId = (await hasAcademyPermission(
      database,
      actor.id,
      "enrollment.read",
    ))
      ? undefined
      : actor.id;
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

  async function listEnrollmentProgress(userId: string) {
    const rows = await enrollmentRepo.listEnrolledCoursesForUser(
      database,
      userId,
    );
    return rows.map((row) => {
      const { courseId, progress, lastAccessedAt } = toEnrolledCourseContract({
        ...row,
        course_thumbnail_url: null,
        total_sections: Number(row.total_sections) || 0,
        total_lessons: Number(row.total_lessons) || 0,
        total_duration_seconds: Number(row.total_duration_seconds) || 0,
      });
      return {
        courseId,
        progress: progress ?? 0,
        lastAccessedAt: lastAccessedAt ? new Date(lastAccessedAt) : null,
        accessExpiresAt: row.access_expires_at
          ? new Date(row.access_expires_at)
          : null,
      };
    });
  }

  async function unenrollFromCourse(
    actor: { id: string; roles: readonly string[] },
    courseId: string,
  ): Promise<void> {
    const userId = actor.id;
    const isAdmin = actor.roles.includes(ADMIN_ROLE);
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
      // free, can be left by a learner: they can come back whenever they
      // like. Anything bought (on its own or in a bundle) or granted by
      // staff stays, so a paid place is never given up by accident.
      const orderId = enrollment.order_id;
      let freeOrderId: string | null = null;
      if (orderId && enrollment.source === "direct_purchase") {
        const [[pricing], orderItems] = await Promise.all([
          courseConfigRepo.findPricingByCourseIds(trx, [courseId]),
          orderRepo.listOrderItems(trx, orderId),
        ]);
        const orderItem = orderItems.find(
          (item) => item.item_type === "course" && item.course_id === courseId,
        );
        if (
          pricing?.pricing_type === "free" &&
          orderItem &&
          orderItem.final_amount === 0
        ) {
          freeOrderId = orderId;
        }
      }
      if (!freeOrderId && !isAdmin) {
        throw CommerceErrors.UNENROLL_NOT_ALLOWED();
      }

      if (freeOrderId) {
        await courseAccessService.withdrawCourseFromOrder(
          trx,
          { id: freeOrderId, user_id: userId },
          courseId,
        );

        // An order with nothing left on it is closed. One that still holds
        // another course (several free courses enrolled together) stays
        // paid.
        const remainingCourseIds =
          await enrollmentRepo.listActiveEnrollmentCourseIdsByOrderId(
            trx,
            freeOrderId,
          );
        if (remainingCourseIds.length === 0) {
          await orderRepo.cancelFreeOrder(trx, freeOrderId);
        }
      } else {
        // An admin leaving a course that was bought, came in a bundle or
        // was granted: the access goes, the order behind it is not touched.
        await accessService.revokeCourseAccess(trx, userId, courseId);
      }

      if (isAdmin) {
        await progressResetService.clearCourseProgressForLearner(
          trx,
          userId,
          courseId,
        );
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
    listEnrollmentProgress,
    unenrollFromCourse,
    getEnrollmentStats,
    getEnrollmentActivityBuckets,
    listTopCoursesByEnrollment,
    listEnrollmentCountsByCourse,
  };
}
