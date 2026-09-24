import type { Kysely } from "kysely";
import type { Database } from "@veolms/database";
import type {
  AnalyticsFilterQuery,
  AnalyticsKpi,
  AnalyticsOverviewResponse,
  CoursePerformanceRow,
} from "@veolms/contracts";
import type { OrderScope } from "@veolms/contracts";
import type { OrderService } from "../commerce/orders/order.service.ts";
import type { EnrollmentService } from "../commerce/enrollments/enrollment.service.ts";
import type { StudentsService } from "../students/students.service.ts";
import type { CourseService } from "../courses/course/course.service.ts";
import type { LearningProgressService } from "../learning-progress/learning-progress.service.ts";
import type { AnalyticsActor } from "./analytics.types.ts";
import { isAdmin } from "./analytics.types.ts";

export interface AnalyticsServiceOptions {
  database: Kysely<Database>;
  orderService: OrderService;
  enrollmentService: EnrollmentService;
  studentsService: StudentsService;
  courseService: CourseService;
  learningProgressService: LearningProgressService;
}

interface ScopedCourse {
  id: string;
  title: string;
  status: string;
  createdAt: string;
  publishedAt: string | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_RANGE_DAYS = 30;
const TOP_COURSES_LIMIT = 8;

function kpi(value: number, previousValue: number): AnalyticsKpi {
  let changePercent: number | null;
  if (previousValue === 0) {
    changePercent = value === 0 ? 0 : null;
  } else {
    changePercent = ((value - previousValue) / Math.abs(previousValue)) * 100;
  }
  return { value, previousValue, changePercent };
}

function resolveDateRange(query: AnalyticsFilterQuery) {
  const to = query.to ?? new Date();
  const from = query.from ?? new Date(to.getTime() - DEFAULT_RANGE_DAYS * DAY_MS);
  const spanMs = Math.max(to.getTime() - from.getTime(), DAY_MS);
  const prevTo = from;
  const prevFrom = new Date(from.getTime() - spanMs);
  return { from, to, prevFrom, prevTo };
}

export function createAnalyticsService(options: AnalyticsServiceOptions) {
  const { orderService, enrollmentService, studentsService, courseService, learningProgressService } =
    options;

  /**
   * A single `courseId` is ownership-checked for instructors (strict
   * creator-or-admin, no userRoles bypass — see
   * courses/shared/courses.utils.ts). With none given: an admin sees every
   * course on the platform (isPlatformWide), an instructor sees their own.
   */
  async function resolveCoursesInScope(
    actor: AnalyticsActor,
    courseId: string | undefined,
  ): Promise<{
    courseIds: string[];
    courses: ScopedCourse[];
    isPlatformWide: boolean;
  }> {
    if (courseId) {
      if (!isAdmin(actor)) {
        await courseService.getCourseAndVerifyOwner(courseId, actor.id);
      }
      const course = await courseService.findCourseById(courseId);
      if (!course) {
        return { courseIds: [], courses: [], isPlatformWide: false };
      }
      return {
        courseIds: [courseId],
        courses: [
          {
            id: course.id,
            title: course.title,
            status: course.status,
            createdAt: course.created_at.toISOString(),
            publishedAt: course.published_at
              ? course.published_at.toISOString()
              : null,
          },
        ],
        isPlatformWide: false,
      };
    }

    if (isAdmin(actor)) {
      const mine = await courseService.listMyCourses(actor.id, actor.roles);
      return {
        courseIds: mine.courses.map((course) => course.id),
        courses: mine.courses.map((course) => ({
          id: course.id,
          title: course.title,
          status: course.status,
          createdAt: course.createdAt,
          publishedAt: course.publishedAt,
        })),
        isPlatformWide: true,
      };
    }

    const mine = await courseService.listAvailableCoursesByCreator(actor.id);
    return {
      courseIds: mine.courses.map((course) => course.id),
      courses: mine.courses.map((course) => ({
        id: course.id,
        title: course.title,
        status: course.status,
        createdAt: course.createdAt,
        publishedAt: course.publishedAt,
      })),
      isPlatformWide: false,
    };
  }

  async function buildCoursePerformance(
    scope: OrderScope,
    courses: ScopedCourse[],
    courseIdFilter: string | string[] | undefined,
    from: Date,
    to: Date,
    currency: string,
  ): Promise<CoursePerformanceRow[]> {
    const topByEnrollment = await enrollmentService.listTopCoursesByEnrollment({
      limit: TOP_COURSES_LIMIT,
      from,
      to,
      courseId: courseIdFilter,
    });
    const enrollmentByCourse = new Map(
      topByEnrollment.map((row) => [row.courseId, row.enrollmentCount]),
    );
    const titleById = new Map(courses.map((course) => [course.id, course.title]));
    const targetIds =
      topByEnrollment.length > 0
        ? topByEnrollment.map((row) => row.courseId)
        : courses.map((course) => course.id).slice(0, TOP_COURSES_LIMIT);

    return await Promise.all(
      targetIds.map(async (courseId) => {
        const [orderStats, progress] = await Promise.all([
          // `currency` pinned so every row in the table is expressed in the
          // same currency as the headline totals — without it, each course
          // would independently resolve to whichever currency it sells the
          // most in, and a mixed-currency deployment would show inconsistent
          // per-course revenue next to a single-currency column header.
          orderService.getRawStatsForCourses(scope, { courseId, from, to, currency }),
          learningProgressService.getAverageProgressAndCompletionRate({
            courseId,
          }),
        ]);
        return {
          courseId,
          title: titleById.get(courseId) ?? "Untitled course",
          enrollments: enrollmentByCourse.get(courseId) ?? 0,
          netRevenue: orderStats.grossPaid - orderStats.refundedAmount,
          completionRate: progress.completionRate,
          averageProgressPercent: progress.averageProgressPercent,
        };
      }),
    );
  }

  async function buildOverview(
    actor: AnalyticsActor,
    query: AnalyticsFilterQuery,
  ): Promise<AnalyticsOverviewResponse> {
    const { courseIds, courses, isPlatformWide } = await resolveCoursesInScope(
      actor,
      query.courseId,
    );
    const { from, to, prevFrom, prevTo } = resolveDateRange(query);

    if (!isPlatformWide && courseIds.length === 0) {
      return buildEmptyResponse(query);
    }

    const courseIdFilter: string | string[] | undefined = isPlatformWide
      ? undefined
      : courseIds.length === 1
        ? courseIds[0]
        : courseIds;

    const scope = await orderService.getAcademyScope();

    const [
      rawStatsCurrent,
      rawStatsPrev,
      enrollmentStatsCurrent,
      enrollmentStatsPrev,
      activeLearnersCurrent,
      activeLearnersPrev,
      estWatchHoursCurrent,
      estWatchHoursPrev,
      startedCompletedCurrent,
      progressCompletionCurrent,
      progressCompletionPrev,
      orderFunnel,
    ] = await Promise.all([
      orderService.getRawStatsForCourses(scope, { courseId: courseIdFilter, from, to }),
      orderService.getRawStatsForCourses(scope, {
        courseId: courseIdFilter,
        from: prevFrom,
        to: prevTo,
      }),
      enrollmentService.getEnrollmentStats({ courseId: courseIdFilter, from, to }),
      enrollmentService.getEnrollmentStats({
        courseId: courseIdFilter,
        from: prevFrom,
        to: prevTo,
      }),
      studentsService.getActiveLearnerCount({ courseId: courseIdFilter, from, to }),
      studentsService.getActiveLearnerCount({
        courseId: courseIdFilter,
        from: prevFrom,
        to: prevTo,
      }),
      learningProgressService.getEstimatedWatchHours({
        courseId: courseIdFilter,
        from,
        to,
      }),
      learningProgressService.getEstimatedWatchHours({
        courseId: courseIdFilter,
        from: prevFrom,
        to: prevTo,
      }),
      learningProgressService.getStartedAndCompletedCounts({
        courseId: courseIdFilter,
        from,
        to,
      }),
      learningProgressService.getAverageProgressAndCompletionRate({
        courseId: courseIdFilter,
        asOf: to,
      }),
      learningProgressService.getAverageProgressAndCompletionRate({
        courseId: courseIdFilter,
        asOf: prevTo,
      }),
      orderService.getOrderStatusFunnel(scope, { from, to, courseId: courseIdFilter }),
    ]);

    const currency = rawStatsCurrent.currency;
    const netRevenueCurrent = rawStatsCurrent.grossPaid - rawStatsCurrent.refundedAmount;
    const netRevenuePrev = rawStatsPrev.grossPaid - rawStatsPrev.refundedAmount;

    const [revenueTrend, coursePerformance] = await Promise.all([
      orderService.getRevenueTrend(scope, {
        courseId: courseIdFilter,
        from,
        to,
        currency,
      }),
      buildCoursePerformance(scope, courses, courseIdFilter, from, to, currency),
    ]);

    // `started` counts anyone active in the window regardless of when they
    // originally enrolled, while `totalEnrollments` only counts enrollments
    // created in this same window — different cohorts, so the ratio can
    // legitimately exceed 100%. Clamped so the funnel never widens.
    const learningFunnelStarted = Math.min(
      startedCompletedCurrent.started,
      enrollmentStatsCurrent.totalEnrollments,
    );
    const learningFunnelCompleted = Math.min(
      startedCompletedCurrent.completed,
      learningFunnelStarted,
    );

    return {
      scope: {
        type: isPlatformWide ? "platform" : "course",
        courseId: query.courseId ?? null,
        courseIds,
      },
      currency,
      overview: {
        netRevenue: kpi(netRevenueCurrent, netRevenuePrev),
        orders: kpi(rawStatsCurrent.totalOrders, rawStatsPrev.totalOrders),
        newEnrollments: kpi(
          enrollmentStatsCurrent.totalEnrollments,
          enrollmentStatsPrev.totalEnrollments,
        ),
        activeLearners: kpi(activeLearnersCurrent, activeLearnersPrev),
        estimatedWatchHours: kpi(estWatchHoursCurrent, estWatchHoursPrev),
        completionRate: kpi(
          progressCompletionCurrent.completionRate,
          progressCompletionPrev.completionRate,
        ),
        revenueTrend,
        orderFunnel,
        learningFunnel: {
          enrolled: enrollmentStatsCurrent.totalEnrollments,
          started: learningFunnelStarted,
          completed: learningFunnelCompleted,
        },
        coursePerformance,
      },
    };
  }

  function buildEmptyResponse(query: AnalyticsFilterQuery): AnalyticsOverviewResponse {
    const emptyKpi = kpi(0, 0);
    return {
      scope: { type: "course", courseId: query.courseId ?? null, courseIds: [] },
      currency: "INR",
      overview: {
        netRevenue: emptyKpi,
        orders: emptyKpi,
        newEnrollments: emptyKpi,
        activeLearners: emptyKpi,
        estimatedWatchHours: emptyKpi,
        completionRate: emptyKpi,
        revenueTrend: [],
        orderFunnel: { created: 0, paid: 0, refunded: 0 },
        learningFunnel: { enrolled: 0, started: 0, completed: 0 },
        coursePerformance: [],
      },
    };
  }

  return {
    adminOverview: (actor: AnalyticsActor, query: AnalyticsFilterQuery) =>
      buildOverview(actor, query),
    instructorOverview: (actor: AnalyticsActor, query: AnalyticsFilterQuery) =>
      buildOverview(actor, query),
  };
}

export type AnalyticsService = ReturnType<typeof createAnalyticsService>;
