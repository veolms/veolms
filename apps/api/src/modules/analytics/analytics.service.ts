import type { Kysely } from "kysely";
import type { Database } from "@veolms/database";
import type {
  AnalyticsFilterQuery,
  AnalyticsKpi,
  AnalyticsOverviewResponse,
  CoursePerformanceRow,
  DashboardSummaryResponse,
  DashboardLearningActivity,
  DashboardRange,
} from "@veolms/contracts";
import type { OrderScope } from "@veolms/contracts";
import type { OrderService } from "../commerce/orders/order.service.ts";
import type { EnrollmentService } from "../commerce/enrollments/enrollment.service.ts";
import type { StudentsService } from "../students/students.service.ts";
import type { CourseService } from "../courses/course/course.service.ts";
import type { LearningProgressService } from "../learning-progress/learning-progress.service.ts";
import type {
  AnalyticsActor,
  AnalyticsDashboardScope,
} from "./analytics.types.ts";
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
const DASHBOARD_RANGE_DAYS: Record<DashboardRange, number> = {
  "7d": 7,
  "30d": 30,
  "3m": 90,
  "1y": 365,
};
const ENROLLMENT_ACTIVITY_DAYS = 7;
const ENROLLMENT_ACTIVITY_BUCKET_HOURS = 8;
const ENROLLMENT_ACTIVITY_BUCKET_COUNT =
  (ENROLLMENT_ACTIVITY_DAYS * 24) / ENROLLMENT_ACTIVITY_BUCKET_HOURS;

interface EnrollmentActivityWindow {
  from: Date;
  to: Date;
  previousFrom: Date;
  previousTo: Date;
}

function resolveDashboardDateRanges(now = new Date()) {
  const currentMonthFrom = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
  );
  const previousMonthFrom = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1),
  );
  const previousMonthTo = new Date(currentMonthFrom.getTime() - 1);

  const activeCurrentFrom = new Date(now.getTime() - 7 * DAY_MS);
  const activePreviousFrom = new Date(activeCurrentFrom.getTime() - 7 * DAY_MS);
  const activePreviousTo = new Date(activeCurrentFrom.getTime() - 1);

  return {
    now,
    currentMonthFrom,
    previousMonthFrom,
    previousMonthTo,
    activeCurrentFrom,
    activePreviousFrom,
    activePreviousTo,
  };
}

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

function resolveDashboardRevenueRange(range: DashboardRange, now = new Date()) {
  const days = DASHBOARD_RANGE_DAYS[range];
  return resolveDateRange({
    from: new Date(now.getTime() - days * DAY_MS),
    to: now,
  });
}

function resolveEnrollmentActivityWindow(
  now = new Date(),
): EnrollmentActivityWindow {
  const to = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1),
  );
  const from = new Date(to.getTime() - ENROLLMENT_ACTIVITY_DAYS * DAY_MS);
  const previousFrom = new Date(
    from.getTime() - ENROLLMENT_ACTIVITY_DAYS * DAY_MS,
  );

  return { from, to, previousFrom, previousTo: from };
}

function resolveInclusiveEnd(exclusiveEnd: Date) {
  return new Date(exclusiveEnd.getTime() - 1);
}

function createEnrollmentActivityBucketWindow(from: Date) {
  return Array.from(
    { length: ENROLLMENT_ACTIVITY_BUCKET_COUNT },
    (_, index) => {
      const start = new Date(
        from.getTime() +
          index * ENROLLMENT_ACTIVITY_BUCKET_HOURS * 60 * 60 * 1000,
      );
      const end = new Date(
        start.getTime() + ENROLLMENT_ACTIVITY_BUCKET_HOURS * 60 * 60 * 1000,
      );
      return { start, end };
    },
  );
}

function emptyLearningActivity(
  window: EnrollmentActivityWindow,
): DashboardLearningActivity {
  return {
    averageCourseProgress: { value: 0 },
    courseCompletionRate: { value: 0 },
    newEnrollments: { value: 0 },
    enrollmentActivity: {
      currentTotal: 0,
      previousTotal: 0,
      changePercent: 0,
      from: window.from.toISOString(),
      to: window.to.toISOString(),
      bucketHours: ENROLLMENT_ACTIVITY_BUCKET_HOURS,
      timeZone: "UTC",
      buckets: createEnrollmentActivityBucketWindow(window.from).map(
        ({ start, end }) => ({
          start: start.toISOString(),
          end: end.toISOString(),
          value: 0,
        }),
      ),
    },
  };
}

function normalizeRevenueTrend(
  points: Array<{ date: string; value: number }>,
  from: Date,
  to: Date,
) {
  const valuesByDate = new Map(points.map((point) => [point.date, point.value]));
  const start = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
  const end = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate());
  const trend: Array<{ date: string; value: number }> = [];

  for (let time = start; time <= end; time += DAY_MS) {
    const date = new Date(time).toISOString().slice(0, 10);
    trend.push({ date, value: valuesByDate.get(date) ?? 0 });
  }

  return trend;
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

  async function buildRevenueOverview(
    scope: OrderScope,
    courseIdFilter: string | string[] | undefined,
    range: DashboardRange,
  ) {
    const { from, to, prevFrom, prevTo } = resolveDashboardRevenueRange(range);
    const current = await orderService.getRawStatsForCourses(scope, {
      courseId: courseIdFilter,
      from,
      to,
    });

    const [previous, currentFunnel, previousFunnel, trend] = await Promise.all([
      orderService.getRawStatsForCourses(scope, {
        courseId: courseIdFilter,
        from: prevFrom,
        to: prevTo,
        currency: current.currency,
      }),
      orderService.getOrderStatusFunnel(scope, {
        from,
        to,
        courseId: courseIdFilter,
      }),
      orderService.getOrderStatusFunnel(scope, {
        from: prevFrom,
        to: prevTo,
        courseId: courseIdFilter,
      }),
      orderService.getRevenueTrend(scope, {
        courseId: courseIdFilter,
        from,
        to,
        currency: current.currency,
      }),
    ]);

    const currentNetRevenue = current.grossPaid - current.refundedAmount;
    const previousNetRevenue = previous.grossPaid - previous.refundedAmount;

    return {
      range,
      currency: current.currency,
      trend: normalizeRevenueTrend(trend, from, to),
      grossSales: kpi(current.grossPaid, previous.grossPaid),
      netRevenue: kpi(currentNetRevenue, previousNetRevenue),
      orders: kpi(currentFunnel.paid, previousFunnel.paid),
      refunds: kpi(currentFunnel.refunded, previousFunnel.refunded),
    };
  }

  async function buildLearningActivity(
    courseIdFilter: string | string[] | undefined,
    window: EnrollmentActivityWindow,
  ): Promise<DashboardLearningActivity> {
    const [progress, currentEnrollments, previousEnrollments, activityRows] =
      await Promise.all([
        learningProgressService.getAverageProgressAndCompletionRate({
          courseId: courseIdFilter,
        }),
        enrollmentService.getEnrollmentStats({
          courseId: courseIdFilter,
          from: window.from,
          to: resolveInclusiveEnd(window.to),
        }),
        enrollmentService.getEnrollmentStats({
          courseId: courseIdFilter,
          from: window.previousFrom,
          to: resolveInclusiveEnd(window.previousTo),
        }),
        enrollmentService.getEnrollmentActivityBuckets({
          courseId: courseIdFilter,
          from: window.from,
          to: window.to,
        }),
      ]);

    const activityByStart = new Map(
      activityRows.map((row) => [row.start.toISOString(), row.value]),
    );
    const buckets = createEnrollmentActivityBucketWindow(window.from).map(
      ({ start, end }) => ({
        start: start.toISOString(),
        end: end.toISOString(),
        value: activityByStart.get(start.toISOString()) ?? 0,
      }),
    );

    return {
      averageCourseProgress: { value: progress.averageProgressPercent },
      courseCompletionRate: { value: progress.completionRate },
      newEnrollments: { value: currentEnrollments.totalEnrollments },
      enrollmentActivity: {
        currentTotal: currentEnrollments.totalEnrollments,
        previousTotal: previousEnrollments.totalEnrollments,
        changePercent: kpi(
          currentEnrollments.totalEnrollments,
          previousEnrollments.totalEnrollments,
        ).changePercent,
        from: window.from.toISOString(),
        to: window.to.toISOString(),
        bucketHours: ENROLLMENT_ACTIVITY_BUCKET_HOURS,
        timeZone: "UTC",
        buckets,
      },
    };
  }

  async function buildDashboard(
    actor: AnalyticsActor,
    dashboardScope: AnalyticsDashboardScope,
    range: DashboardRange = "30d",
  ): Promise<DashboardSummaryResponse> {
    const dashboardNow = new Date();
    const enrollmentActivityWindow =
      resolveEnrollmentActivityWindow(dashboardNow);
    const { courseIds, isPlatformWide } =
      dashboardScope === "platform"
        ? { courseIds: [], isPlatformWide: true }
        : await resolveCoursesInScope(actor, undefined);
    if (!isPlatformWide && courseIds.length === 0) {
      return {
        revenue: {
          value: 0,
          previousValue: 0,
          changePercent: 0,
          currency: "INR",
        },
        students: { total: 0, newThisMonth: 0 },
        activeLearners: kpi(0, 0),
        watchHours: kpi(0, 0),
        revenueOverview: {
          range,
          currency: "INR",
          trend: [],
          grossSales: kpi(0, 0),
          netRevenue: kpi(0, 0),
          orders: kpi(0, 0),
          refunds: kpi(0, 0),
        },
        learningActivity: emptyLearningActivity(enrollmentActivityWindow),
      };
    }

    const courseIdFilter: string | string[] | undefined = isPlatformWide
      ? undefined
      : courseIds.length === 1
        ? courseIds[0]
        : courseIds;
    const scope = await orderService.getAcademyScope();
    const {
      now,
      currentMonthFrom,
      previousMonthFrom,
      previousMonthTo,
      activeCurrentFrom,
      activePreviousFrom,
      activePreviousTo,
    } = resolveDashboardDateRanges(dashboardNow);

    const [currentRevenue, revenueOverview, learningActivity] =
      await Promise.all([
        orderService.getRawStatsForCourses(scope, {
          courseId: courseIdFilter,
          from: currentMonthFrom,
          to: now,
        }),
        buildRevenueOverview(scope, courseIdFilter, range),
        buildLearningActivity(courseIdFilter, enrollmentActivityWindow),
      ]);

    const [
      previousRevenue,
      studentCounts,
      activeLearnersCurrent,
      activeLearnersPrevious,
      watchHoursCurrent,
      watchHoursPrevious,
    ] = await Promise.all([
      // Pin the previous period to the current period's currency so a
      // multi-currency academy never compares different currencies.
      orderService.getRawStatsForCourses(scope, {
        courseId: courseIdFilter,
        from: previousMonthFrom,
        to: previousMonthTo,
        currency: currentRevenue.currency,
      }),
      studentsService.getStudentPopulationCounts({
        courseId: courseIdFilter,
        createdFrom: currentMonthFrom,
        createdTo: now,
      }),
      studentsService.getActiveLearnerCount({
        courseId: courseIdFilter,
        from: activeCurrentFrom,
        to: now,
      }),
      studentsService.getActiveLearnerCount({
        courseId: courseIdFilter,
        from: activePreviousFrom,
        to: activePreviousTo,
      }),
      learningProgressService.getEstimatedWatchHours({
        courseId: courseIdFilter,
        from: currentMonthFrom,
        to: now,
      }),
      learningProgressService.getEstimatedWatchHours({
        courseId: courseIdFilter,
        from: previousMonthFrom,
        to: previousMonthTo,
      }),
    ]);

    return {
      revenue: {
        ...kpi(
          currentRevenue.grossPaid - currentRevenue.refundedAmount,
          previousRevenue.grossPaid - previousRevenue.refundedAmount,
        ),
        currency: currentRevenue.currency,
      },
      students: studentCounts,
      activeLearners: kpi(activeLearnersCurrent, activeLearnersPrevious),
      watchHours: kpi(watchHoursCurrent, watchHoursPrevious),
      revenueOverview,
      learningActivity,
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
    dashboard: (
      actor: AnalyticsActor,
      dashboardScope: AnalyticsDashboardScope,
      range: DashboardRange = "30d",
    ) => buildDashboard(actor, dashboardScope, range),
  };
}

export type AnalyticsService = ReturnType<typeof createAnalyticsService>;
