import type { Database } from "@veolms/database";
import type { Kysely } from "kysely";
import type {
  CourseAccessEnrollment,
  CourseAccessListResponse,
  CourseAccessProgress,
  CourseAccessResponse,
  CourseAccessResume,
  CourseAccessSummary,
} from "@veolms/contracts";

import { AppError } from "../../lib/errors.ts";
import {
  createAccessService,
  type AccessService,
  type CourseAccessScope,
} from "../access/index.ts";
import { hasAcademyPermission } from "../authorization/index.ts";
import type { EnrollmentService } from "../commerce/index.ts";
import { toOrderPaymentMethod } from "../commerce/orders/order.mapper.ts";
import {
  resolveOverviewVisibility,
  type CourseAccessFacts,
  type CourseService,
} from "../courses/index.ts";
import type { LearningProgressService } from "../learning-progress/learning-progress.service.ts";
import { decidePace, PACE_WINDOW_DAYS } from "./viewer-access.pace.ts";
import {
  findCourseActivity,
  findEnrollmentOrder,
  findLinkingCourseOrder,
} from "./viewer-access.repository.ts";
import {
  decideCourseAccess,
  type AccessViewer,
} from "./viewer-access.rules.ts";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-9a-f][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

/** A curriculum version for a course that has no public curriculum. */
const NO_PUBLIC_CURRICULUM = "none";

export interface ViewerAccessUser {
  id: string;
  roles: readonly string[];
  learnerView: boolean;
}

export interface ViewerAccessService {
  listCourseAccess(
    user: ViewerAccessUser | undefined,
  ): Promise<CourseAccessListResponse>;
  getCourseAccess(
    courseIdOrSlug: string,
    user: ViewerAccessUser | undefined,
  ): Promise<CourseAccessResponse>;
}

/**
 * What each viewer may do with courses, kept apart from what courses are.
 * The course pages are the same for everyone and built ahead of time; these
 * answers carry the rest: whether the viewer may open every lesson, what
 * they must do to open the others, the price in force and their progress.
 * They are asked of the server every time and never kept by a cache.
 */
export function createViewerAccessService({
  database,
  courseService,
  enrollmentService,
  learningProgressService,
  accessService = createAccessService(),
}: {
  database: Kysely<Database>;
  courseService: Pick<
    CourseService,
    | "findCourseById"
    | "findCourseBySlug"
    | "listCourseAccessFacts"
    | "getPublicCurriculumVersion"
  >;
  enrollmentService: Pick<EnrollmentService, "listEnrollmentProgress">;
  learningProgressService: Pick<LearningProgressService, "getResumeContext">;
  accessService?: Pick<
    AccessService,
    "getAccessScope" | "isCourseOpenToLearner" | "listAccessScopes"
  >;
}): ViewerAccessService {
  async function toAccessViewer(
    user: ViewerAccessUser | undefined,
  ): Promise<AccessViewer | undefined> {
    if (!user) return undefined;
    return {
      ...user,
      previewsEveryCourse: await hasAcademyPermission(
        database,
        user.id,
        "course.preview",
      ),
    };
  }

  /** The learner's enrolments: progress in each, and when access ends. */
  async function listProgressByCourse(
    user: ViewerAccessUser | undefined,
  ): Promise<
    Map<
      string,
      { progress: CourseAccessProgress; accessExpiresAt: Date | null }
    >
  > {
    if (!user) return new Map();
    const rows = await enrollmentService.listEnrollmentProgress(user.id);
    return new Map(
      rows.map((row) => [
        row.courseId,
        {
          progress: {
            percent: Math.min(100, Math.max(0, Math.round(row.progress))),
            started: row.progress > 0 || row.lastAccessedAt !== null,
            lastAccessedAt: row.lastAccessedAt?.toISOString() ?? null,
          },
          accessExpiresAt: row.accessExpiresAt,
        },
      ]),
    );
  }

  function summarize(
    course: CourseAccessFacts,
    viewer: AccessViewer | undefined,
    scope: CourseAccessScope | null,
    progress: CourseAccessProgress | undefined,
  ): CourseAccessSummary {
    return {
      courseId: course.id,
      slug: course.slug,
      ...decideCourseAccess({
        course,
        viewer,
        holdsGrant: scope !== null,
        grantSectionIds: scope?.sectionIds,
      }),
      enrolled: progress !== undefined,
      canSelfEnroll: course.canSelfEnroll,
      pricing: {
        ...course.pricing,
        showDiscountBadge: course.pricing.showDiscountBadge === true,
      },
      progress: progress ?? null,
    };
  }

  async function listCourseAccess(
    user: ViewerAccessUser | undefined,
  ): Promise<CourseAccessListResponse> {
    const [courses, viewer, scopes, progressByCourse] = await Promise.all([
      courseService.listCourseAccessFacts({ published: true }),
      toAccessViewer(user),
      user
        ? accessService.listAccessScopes(database, user.id)
        : new Map<string, CourseAccessScope>(),
      listProgressByCourse(user),
    ]);
    return {
      courses: courses.map((course) =>
        summarize(
          course,
          viewer,
          scopes.get(course.id) ?? null,
          progressByCourse.get(course.id)?.progress,
        ),
      ),
    };
  }

  async function getResume(
    user: ViewerAccessUser,
    courseId: string,
  ): Promise<CourseAccessResume | null> {
    try {
      const context = await learningProgressService.getResumeContext(
        user,
        courseId,
      );
      return {
        totalLessons: context.totalLessons,
        completedLessons: context.completedLessons,
        resumeLesson: context.resumeLesson,
      };
    } catch (error) {
      // Refused for a course the learner may not record progress in.
      if (error instanceof AppError) return null;
      throw error;
    }
  }

  /**
   * The learner's enrolment for the course page: when it began, the order
   * that gave it, and their pace. Undefined when they hold no active one.
   */
  async function getEnrollment(
    user: ViewerAccessUser,
    courseId: string,
    lessonsLeft: number,
  ): Promise<CourseAccessEnrollment | undefined> {
    const now = new Date();
    const since = new Date(now.getTime() - PACE_WINDOW_DAYS * 86_400_000);
    const [enrolment, activity] = await Promise.all([
      findEnrollmentOrder(database, user.id, courseId),
      findCourseActivity(database, user.id, courseId, since),
    ]);
    if (!enrolment) return undefined;
    // A course that came with another is told by that course's purchase.
    const parent =
      enrolment.source === "linked_course"
        ? await findLinkingCourseOrder(database, user.id, courseId)
        : undefined;
    const row = parent ?? enrolment;
    const startedAt = parent ? parent.valid_from : enrolment.access_starts_at;
    return {
      enrolledAt: (row.paid_at ?? startedAt).toISOString(),
      order:
        row.order_id && row.order_number && row.currency
          ? {
              id: row.order_id,
              orderNumber: row.order_number,
              totalAmount: row.total_amount ?? 0,
              currency: row.currency,
              paymentMethod:
                toOrderPaymentMethod(row.payment_method)?.method ?? null,
              hasInvoice: row.invoice_number !== null,
            }
          : null,
      ...(parent ? { includedWith: parent.course_title } : {}),
      pace: decidePace({ now, ...activity, lessonsLeft }),
    };
  }

  /**
   * The rule the discussions apply to posting
   * (`assertCanParticipateInCourse`): whoever reads every course's
   * discussions (admins, through their role), the course's creator, and
   * learners holding a grant.
   */
  async function mayJoinCourseDiscussions(
    user: ViewerAccessUser | undefined,
    creatorId: string | null,
    holdsGrant: boolean,
  ): Promise<boolean> {
    if (!user) return false;
    if (holdsGrant || creatorId === user.id) return true;
    return await hasAcademyPermission(database, user.id, "discussion.read");
  }

  async function getCourseAccess(
    courseIdOrSlug: string,
    user: ViewerAccessUser | undefined,
  ): Promise<CourseAccessResponse> {
    const course = UUID_PATTERN.test(courseIdOrSlug)
      ? await courseService.findCourseById(courseIdOrSlug)
      : await courseService.findCourseBySlug(courseIdOrSlug);
    if (!course) {
      throw new AppError(404, "COURSE_NOT_FOUND", "Course not found.");
    }

    const viewer = await toAccessViewer(user);
    // Found for exactly the viewers its overview is found for.
    if (
      !resolveOverviewVisibility(course, viewer).mayOpen &&
      !(await accessService.isCourseOpenToLearner(database, user?.id, course))
    ) {
      throw new AppError(404, "COURSE_NOT_FOUND", "Course not published.");
    }

    const [[facts], scope, progressByCourse, curriculumVersion] =
      await Promise.all([
        courseService.listCourseAccessFacts({ courseIds: [course.id] }),
        user
          ? accessService.getAccessScope(database, user.id, course.id)
          : null,
        listProgressByCourse(user),
        courseService.getPublicCurriculumVersion(course.id),
      ]);
    if (!facts) {
      throw new AppError(404, "COURSE_NOT_FOUND", "Course not found.");
    }

    const enrollment = progressByCourse.get(course.id);
    const summary = summarize(facts, viewer, scope, enrollment?.progress);
    const [resume, mayJoinDiscussions] = await Promise.all([
      user && (summary.access === "full" || summary.openSectionIds)
        ? getResume(user, course.id)
        : Promise.resolve(null),
      mayJoinCourseDiscussions(user, course.creator_id, scope !== null),
    ]);

    const enrollmentDetails =
      user && enrollment
        ? await getEnrollment(
            user,
            course.id,
            resume ? resume.totalLessons - resume.completedLessons : 0,
          )
        : undefined;

    return {
      ...summary,
      mayJoinDiscussions,
      resume,
      accessExpiresAt: enrollment?.accessExpiresAt?.toISOString() ?? null,
      enrollment: enrollmentDetails ?? null,
      curriculumVersion: curriculumVersion ?? NO_PUBLIC_CURRICULUM,
    };
  }

  return { listCourseAccess, getCourseAccess };
}
