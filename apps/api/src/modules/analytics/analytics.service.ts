import { cacheTags, createCache } from "@veolms/api-core";
import type { Kysely } from "kysely";
import type { Database } from "@veolms/database";
import type {
  AnalyticsCoursesResponse,
  AnalyticsFilterQuery,
  AnalyticsKpi,
  AnalyticsOverviewResponse,
  AnalyticsRevenueResponse,
  CoursePerformanceRow,
  DashboardSummaryResponse,
  DashboardLearningActivity,
  DashboardRange,
  DashboardYourCourse,
} from "@veolms/contracts";
import type { OrderScope } from "@veolms/contracts";
import type { OrderService } from "../commerce/orders/order.service.ts";
import type { EnrollmentService } from "../commerce/enrollments/enrollment.service.ts";
import type { StudentsService } from "../students/students.service.ts";
import type { CourseService } from "../courses/course/course.service.ts";
import type { LearningProgressService } from "../learning-progress/learning-progress.service.ts";
import type { AnalyticsActor } from "./analytics.types.ts";
import { hasAcademyPermission } from "../authorization/index.ts";
import { AppError } from "../../lib/errors.ts";
import * as analyticsRepo from "./analytics.repository.ts";

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
}

type DashboardCourse = Pick<
  DashboardYourCourse,
  "id" | "title" | "thumbnailUrl" | "thumbnailSrcSet" | "status"
>;

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_RANGE_DAYS = 30;
const TOP_COURSES_LIMIT = 8;
const TOP_PRODUCTS_LIMIT = 10;
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
  return { value, changePercent };
}

/** Longest span one request may cover; the dashboard's widest is a year. */
const MAX_RANGE_DAYS = 366;

function resolveDateRange(query: AnalyticsFilterQuery) {
  const to = query.to ?? new Date();
  const requestedFrom =
    query.from ?? new Date(to.getTime() - DEFAULT_RANGE_DAYS * DAY_MS);
  // The span was whatever the client asked for, and every extra day is
  // scanned twice — once for the range and once for the period before it.
  const from = new Date(
    Math.max(requestedFrom.getTime(), to.getTime() - MAX_RANGE_DAYS * DAY_MS),
  );
  const spanMs = Math.max(to.getTime() - from.getTime(), DAY_MS);
  const prevTo = from;
  const prevFrom = new Date(from.getTime() - spanMs);
  return { from, to, prevFrom, prevTo };
}

function resolveDashboardRevenueRange(range: DashboardRange, now = new Date()) {
  const days = DASHBOARD_RANGE_DAYS[range];
  const currentDayStart = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );
  const from = new Date(currentDayStart - (days - 1) * DAY_MS);
  const to = now;
  const prevTo = from;
  const prevFrom = new Date(prevTo.getTime() - days * DAY_MS);
  return { from, to, prevFrom, prevTo, days };
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

/** Inclusive start of each UTC 8-hour bucket in the activity window. */
function createEnrollmentActivityBucketStarts(from: Date) {
  return Array.from(
    { length: ENROLLMENT_ACTIVITY_BUCKET_COUNT },
    (_, index) =>
      new Date(
        from.getTime() +
          index * ENROLLMENT_ACTIVITY_BUCKET_HOURS * 60 * 60 * 1000,
      ),
  );
}

function normalizeRevenueTrend(
  points: Array<{ date: string; value: number }>,
  from: Date,
  bucketCount: number,
) {
  const valuesByDate = new Map(
    points.map((point) => [point.date, point.value]),
  );
  const start = Date.UTC(
    from.getUTCFullYear(),
    from.getUTCMonth(),
    from.getUTCDate(),
  );
  const trend: Array<{ date: string; value: number }> = [];

  for (let index = 0; index < bucketCount; index += 1) {
    const time = start + index * DAY_MS;
    const date = new Date(time).toISOString().slice(0, 10);
    trend.push({ date, value: valuesByDate.get(date) ?? 0 });
  }

  return trend;
}

/**
 * Analytics answers: aggregate snapshots, served up to 30 s old. Without
 * this every dashboard poll re-ran ~15 full-table aggregates, and one admin
 * tab was measured slowing all other traffic ~10x. Concurrent identical
 * requests share one computation; failures are not kept.
 */
const analyticsResponses = createCache<unknown>({
  name: "analytics.responses",
  ttlMs: 30_000,
  maxEntries: 100,
  maxBytes: 8 * 1024 * 1024,
});

export function createAnalyticsService(options: AnalyticsServiceOptions) {
  const {
    database,
    orderService,
    enrollmentService,
    studentsService,
    courseService,
    learningProgressService,
  } = options;

  /**
   * A single `courseId` is ownership-checked for instructors (strict
   * creator-or-admin, no userRoles bypass — see
   * courses/shared/courses.utils.ts). With none given: an admin sees every
   * course on the platform (isPlatformWide), an instructor sees their own.
   */
  /**
   * Analytics held through a role that reaches every course (admin, or a
   * team role) covers the whole academy; an instructor's covers their own.
   */
  /** Which analytics keys the actor holds for every course. */
  async function academyAnalytics(actor: AnalyticsActor) {
    const [overview, course, revenue] = await Promise.all([
      hasAcademyPermission(database, actor.id, "analytics.overview.read"),
      hasAcademyPermission(database, actor.id, "analytics.course.read"),
      hasAcademyPermission(database, actor.id, "analytics.revenue.read"),
    ]);
    return { overview, course, revenue };
  }

  async function seesEveryCourse(actor: AnalyticsActor): Promise<boolean> {
    const held = await academyAnalytics(actor);
    return held.overview || held.course || held.revenue;
  }

  /**
   * Money reaches the holders of the revenue permission, and an instructor
   * looking at their own courses. Analytics held for every course without
   * the revenue key (a team role) stop short of it.
   */
  async function seesRevenue(actor: AnalyticsActor): Promise<boolean> {
    const held = await academyAnalytics(actor);
    return held.revenue || !(held.overview || held.course);
  }

  /** The overview with every money figure taken out. */
  function withoutRevenue(
    response: AnalyticsOverviewResponse,
  ): AnalyticsOverviewResponse {
    const emptyKpi = kpi(0, 0);
    return {
      ...response,
      includesRevenue: false,
      overview: {
        ...response.overview,
        netRevenue: emptyKpi,
        orders: emptyKpi,
        refundRate: emptyKpi,
        dailyOrders: [],
        coursePerformance: response.overview.coursePerformance.map((row) => ({
          ...row,
          orders: 0,
          netRevenue: 0,
        })),
      },
    };
  }

  async function resolveCoursesInScope(
    actor: AnalyticsActor,
    courseId: string | undefined,
  ): Promise<{
    courseIds: string[];
    courses: ScopedCourse[];
    isPlatformWide: boolean;
  }> {
    const everyCourse = await seesEveryCourse(actor);
    if (courseId) {
      const course = everyCourse
        ? await courseService.findCourseById(courseId)
        : await courseService.getCourseAndVerifyOwner(
            courseId,
            actor.id,
            actor.roles,
            "analytics.course.read",
          );
      if (!course) {
        return { courseIds: [], courses: [], isPlatformWide: false };
      }
      return {
        courseIds: [courseId],
        courses: [{ id: course.id, title: course.title }],
        isPlatformWide: false,
      };
    }

    if (everyCourse) {
      // Summaries, not listMyCourses: scope resolution only needs ids and
      // titles, and listMyCourses hydrates media URLs at up to ~5 queries
      // per course before a single aggregate has run.
      const mine = await courseService.listMyCourseSummaries(
        actor.id,
        actor.roles,
        { everyCourse: true },
      );
      return {
        courseIds: mine.courses.map((course) => course.id),
        courses: mine.courses.map((course) => ({
          id: course.id,
          title: course.title,
        })),
        isPlatformWide: true,
      };
    }

    const mine = await courseService.listMyCourseSummaries(actor.id);
    return {
      courseIds: mine.courses.map((course) => course.id),
      courses: mine.courses.map((course) => ({
        id: course.id,
        title: course.title,
      })),
      isPlatformWide: false,
    };
  }

  async function resolveDashboardCourses(
    actor: AnalyticsActor,
  ): Promise<DashboardCourse[]> {
    const mine = await courseService.listMyCourses(actor.id, actor.roles);
    return mine.courses
      .filter(
        (course) => course.status === "published" || course.status === "draft",
      )
      .map((course) => ({
        id: course.id,
        title: course.title,
        thumbnailUrl: course.thumbnailUrl,
        thumbnailSrcSet: course.thumbnailSrcSet,
        status: course.status,
      }));
  }

  async function buildYourCourses(
    courses: DashboardCourse[],
  ): Promise<DashboardYourCourse[]> {
    if (courses.length === 0) return [];

    const courseIds = courses.map((course) => course.id);
    const [enrollmentCounts, progressRows] = await Promise.all([
      enrollmentService.listEnrollmentCountsByCourse({ courseId: courseIds }),
      learningProgressService.getAverageProgressByCourse({
        courseId: courseIds,
      }),
    ]);
    const studentsByCourse = new Map(
      enrollmentCounts.map((row) => [row.courseId, row.enrollmentCount]),
    );
    const progressByCourse = new Map(
      progressRows.map((row) => [row.courseId, row.averageProgressPercent]),
    );

    return courses.map((course) => ({
      ...course,
      students: studentsByCourse.get(course.id) ?? 0,
      averageProgressPercent: progressByCourse.get(course.id) ?? null,
    }));
  }

  /** Shared by every tab: the range, the period before it, the course
   * scope and the academy order scope. */
  async function resolveTabContext(
    actor: AnalyticsActor,
    query: AnalyticsFilterQuery,
  ) {
    const scopeInfo = await resolveCoursesInScope(actor, query.courseId);
    const range = resolveDateRange(query);
    const courseIdFilter: string | string[] | undefined =
      scopeInfo.isPlatformWide
        ? undefined
        : scopeInfo.courseIds.length === 1
          ? scopeInfo.courseIds[0]
          : scopeInfo.courseIds;
    const isEmpty =
      !scopeInfo.isPlatformWide && scopeInfo.courseIds.length === 0;
    const scope = await orderService.getAcademyScope();
    return { ...scopeInfo, ...range, courseIdFilter, isEmpty, scope };
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
    const titleById = new Map(
      courses.map((course) => [course.id, course.title]),
    );
    const targetIds =
      topByEnrollment.length > 0
        ? topByEnrollment.map((row) => row.courseId)
        : courses.map((course) => course.id).slice(0, TOP_COURSES_LIMIT);

    // Progress for all target courses in ONE grouped query (this used to
    // run the scalar aggregate once per course); order stats stay per
    // course because each is a cheap filtered aggregate and the currency
    // must be pinned per row — see the comment below.
    const [progressByCourse, orderStatsList, ordersByCourse] =
      await Promise.all([
        learningProgressService
          .getAverageProgressAndCompletionRateByCourse(targetIds)
          .then((rows) => new Map(rows.map((row) => [row.courseId, row]))),
        Promise.all(
          targetIds.map((courseId) =>
            // `currency` pinned so every row in the table is expressed in the
            // same currency as the headline totals — without it, each course
            // would independently resolve to whichever currency it sells the
            // most in, and a mixed-currency deployment would show inconsistent
            // per-course revenue next to a single-currency column header.
            orderService.getRawStatsForCourses(scope, {
              courseId,
              from,
              to,
              currency,
            }),
          ),
        ),
        analyticsRepo.getOrderCountsByCourse(database, scope, {
          courseIds: targetIds,
          from,
          to,
        }),
      ]);

    return targetIds.map((courseId, index) => {
      const orderStats = orderStatsList[index]!;
      const progress = progressByCourse.get(courseId);
      return {
        courseId,
        title: titleById.get(courseId) ?? "Untitled course",
        enrollments: enrollmentByCourse.get(courseId) ?? 0,
        orders: ordersByCourse.get(courseId) ?? 0,
        netRevenue: orderStats.grossPaid - orderStats.refundedAgainstPaid,
        completionRate: progress?.completionRate ?? 0,
        averageProgressPercent: progress?.averageProgressPercent ?? 0,
      };
    });
  }

  /** Every UTC day of the range, in order, a zero row where nothing happened. */
  function fillDays<T extends { date: string }>(
    points: T[],
    from: Date,
    to: Date,
    empty: (date: string) => T,
  ): T[] {
    const byDate = new Map(points.map((point) => [point.date, point]));
    const start = Date.UTC(
      from.getUTCFullYear(),
      from.getUTCMonth(),
      from.getUTCDate(),
    );
    const filled: T[] = [];
    for (let time = start; time < to.getTime(); time += DAY_MS) {
      const date = new Date(time).toISOString().slice(0, 10);
      filled.push(byDate.get(date) ?? empty(date));
    }
    return filled;
  }

  const emptyDailyOrders = (date: string) => ({
    date,
    grossSales: 0,
    netRevenue: 0,
    orders: 0,
    refundedAmount: 0,
    refunds: 0,
  });
  const emptyTrendPoint = (date: string) => ({ date, value: 0 });

  function refundRateOf(funnel: { paid: number; refunded: number }): number {
    return funnel.paid > 0 ? (funnel.refunded / funnel.paid) * 100 : 0;
  }

  async function buildOverview(
    actor: AnalyticsActor,
    query: AnalyticsFilterQuery,
  ): Promise<AnalyticsOverviewResponse> {
    const context = await resolveTabContext(actor, query);
    if (context.isEmpty) return buildEmptyOverview();
    const { courses, courseIdFilter, from, to, prevFrom, prevTo, scope } =
      context;

    const [
      rawStatsCurrent,
      rawStatsPrev,
      enrollmentStatsCurrent,
      enrollmentStatsPrev,
      studentsCurrent,
      studentsPrev,
      progressCompletionCurrent,
      progressCompletionPrev,
      funnelCurrent,
      funnelPrev,
      dailyEnrollments,
    ] = await Promise.all([
      orderService.getRawStatsForCourses(scope, {
        courseId: courseIdFilter,
        from,
        to,
      }),
      orderService.getRawStatsForCourses(scope, {
        courseId: courseIdFilter,
        from: prevFrom,
        to: prevTo,
      }),
      enrollmentService.getEnrollmentStats({
        courseId: courseIdFilter,
        from,
        to,
      }),
      enrollmentService.getEnrollmentStats({
        courseId: courseIdFilter,
        from: prevFrom,
        to: prevTo,
      }),
      analyticsRepo.countEnrolledLearnersAsOf(database, {
        courseId: courseIdFilter,
        asOf: to,
      }),
      analyticsRepo.countEnrolledLearnersAsOf(database, {
        courseId: courseIdFilter,
        asOf: prevTo,
      }),
      learningProgressService.getAverageProgressAndCompletionRate({
        courseId: courseIdFilter,
        asOf: to,
      }),
      learningProgressService.getAverageProgressAndCompletionRate({
        courseId: courseIdFilter,
        asOf: prevTo,
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
      analyticsRepo.getDailyEnrollments(database, {
        courseId: courseIdFilter,
        from,
        to,
      }),
    ]);

    const currency = rawStatsCurrent.currency;
    const netRevenueCurrent =
      rawStatsCurrent.grossPaid - rawStatsCurrent.refundedAgainstPaid;
    const netRevenuePrev =
      rawStatsPrev.grossPaid - rawStatsPrev.refundedAgainstPaid;

    const [dailyOrders, coursePerformance] = await Promise.all([
      analyticsRepo.getDailyOrderSeries(database, scope, {
        courseId: courseIdFilter,
        from,
        to,
        currency,
      }),
      buildCoursePerformance(
        scope,
        courses,
        courseIdFilter,
        from,
        to,
        currency,
      ),
    ]);

    return {
      currency,
      overview: {
        netRevenue: kpi(netRevenueCurrent, netRevenuePrev),
        orders: kpi(rawStatsCurrent.totalOrders, rawStatsPrev.totalOrders),
        newEnrollments: kpi(
          enrollmentStatsCurrent.totalEnrollments,
          enrollmentStatsPrev.totalEnrollments,
        ),
        totalStudents: kpi(studentsCurrent, studentsPrev),
        refundRate: kpi(refundRateOf(funnelCurrent), refundRateOf(funnelPrev)),
        completionRate: kpi(
          progressCompletionCurrent.completionRate,
          progressCompletionPrev.completionRate,
        ),
        dailyOrders: fillDays(dailyOrders, from, to, emptyDailyOrders),
        dailyEnrollments: fillDays(dailyEnrollments, from, to, emptyTrendPoint),
        coursePerformance,
      },
    };
  }

  async function buildRevenue(
    actor: AnalyticsActor,
    query: AnalyticsFilterQuery,
  ): Promise<AnalyticsRevenueResponse> {
    if (!(await seesRevenue(actor))) {
      throw new AppError(
        403,
        "FORBIDDEN",
        "Revenue analytics need the analytics.revenue.read permission.",
      );
    }
    const context = await resolveTabContext(actor, query);
    if (context.isEmpty) return buildEmptyRevenue();
    const { courseIdFilter, from, to, prevFrom, prevTo, scope } = context;

    const [current, funnelCurrent, funnelPrev, inCarts] = await Promise.all([
      orderService.getRawStatsForCourses(scope, {
        courseId: courseIdFilter,
        from,
        to,
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
      analyticsRepo.countItemsInCarts(database, {
        courseId: courseIdFilter,
        from,
        to,
      }),
    ]);
    const currency = current.currency;
    const window = { courseId: courseIdFilter, from, to, currency };

    const [
      previous,
      daily,
      byProduct,
      sources,
      paymentMethods,
      coupons,
      topCourses,
    ] = await Promise.all([
      orderService.getRawStatsForCourses(scope, {
        courseId: courseIdFilter,
        from: prevFrom,
        to: prevTo,
        currency,
      }),
      analyticsRepo.getDailyOrderSeries(database, scope, window),
      analyticsRepo.getRevenueByProduct(database, scope, {
        ...window,
        limit: TOP_PRODUCTS_LIMIT,
      }),
      analyticsRepo.getRevenueSources(database, scope, window),
      analyticsRepo.getPaymentMethods(database, scope, window),
      analyticsRepo.getCouponPerformance(database, scope, {
        ...window,
        limit: TOP_PRODUCTS_LIMIT,
      }),
      analyticsRepo.getTopRevenueCourses(database, scope, {
        ...window,
        limit: TOP_COURSES_LIMIT,
      }),
    ]);

    const net = (row: typeof current) =>
      row.grossPaid - row.refundedAgainstPaid;
    const aov = (row: typeof current) =>
      row.totalOrders > 0 ? Math.round(row.grossPaid / row.totalOrders) : 0;

    return {
      currency,
      revenue: {
        grossSales: kpi(current.grossPaid, previous.grossPaid),
        netRevenue: kpi(net(current), net(previous)),
        orders: kpi(current.totalOrders, previous.totalOrders),
        uniqueBuyers: kpi(current.uniqueBuyers, previous.uniqueBuyers),
        averageOrderValue: kpi(aov(current), aov(previous)),
        refundRate: kpi(refundRateOf(funnelCurrent), refundRateOf(funnelPrev)),
        refundedAmount: kpi(
          current.refundedAgainstPaid,
          previous.refundedAgainstPaid,
        ),
        refundCount: kpi(funnelCurrent.refunded, funnelPrev.refunded),
        funnel: {
          inCarts,
          checkoutStarted: funnelCurrent.created,
          paid: funnelCurrent.paid,
          refunded: funnelCurrent.refunded,
        },
        daily: fillDays(daily, from, to, emptyDailyOrders),
        byProduct,
        sources,
        paymentMethods,
        coupons,
        topCourses,
      },
    };
  }

  async function buildCourses(
    actor: AnalyticsActor,
    query: AnalyticsFilterQuery,
  ): Promise<AnalyticsCoursesResponse> {
    const context = await resolveTabContext(actor, query);
    if (context.isEmpty) return buildEmptyCourses();
    const { courses, courseIdFilter, from, to, prevFrom, prevTo } = context;

    const [
      snapshotCurrent,
      snapshotPrev,
      enrollmentsCurrent,
      enrollmentsPrev,
      progressCurrent,
      progressPrev,
      quizzesCurrent,
      quizzesPrev,
      dailyEnrollments,
      content,
      topByEnrollment,
    ] = await Promise.all([
      analyticsRepo.getContentSnapshotAsOf(database, {
        courseId: courseIdFilter,
        asOf: to,
      }),
      analyticsRepo.getContentSnapshotAsOf(database, {
        courseId: courseIdFilter,
        asOf: prevTo,
      }),
      enrollmentService.getEnrollmentStats({
        courseId: courseIdFilter,
        from,
        to,
      }),
      enrollmentService.getEnrollmentStats({
        courseId: courseIdFilter,
        from: prevFrom,
        to: prevTo,
      }),
      learningProgressService.getAverageProgressAndCompletionRate({
        courseId: courseIdFilter,
        asOf: to,
      }),
      learningProgressService.getAverageProgressAndCompletionRate({
        courseId: courseIdFilter,
        asOf: prevTo,
      }),
      analyticsRepo.getQuizSummary(database, {
        courseId: courseIdFilter,
        from,
        to,
      }),
      analyticsRepo.getQuizSummary(database, {
        courseId: courseIdFilter,
        from: prevFrom,
        to: prevTo,
      }),
      analyticsRepo.getDailyEnrollments(database, {
        courseId: courseIdFilter,
        from,
        to,
      }),
      analyticsRepo.getContentInsights(database, {
        courseId: courseIdFilter,
      }),
      enrollmentService.listTopCoursesByEnrollment({
        limit: TOP_COURSES_LIMIT,
        from,
        to,
        courseId: courseIdFilter,
      }),
    ]);

    const titleById = new Map(
      courses.map((course) => [course.id, course.title]),
    );
    const targetIds =
      topByEnrollment.length > 0
        ? topByEnrollment.map((row) => row.courseId)
        : courses.map((course) => course.id).slice(0, TOP_COURSES_LIMIT);
    const enrollmentByCourse = new Map(
      topByEnrollment.map((row) => [row.courseId, row.enrollmentCount]),
    );
    const [progressByCourse, countsByCourse] = await Promise.all([
      learningProgressService
        .getAverageProgressAndCompletionRateByCourse(targetIds)
        .then((rows) => new Map(rows.map((row) => [row.courseId, row]))),
      analyticsRepo
        .listCourseContentCounts(database, targetIds)
        .then((rows) => new Map(rows.map((row) => [row.courseId, row]))),
    ]);

    const hours = (seconds: number) => seconds / 3600;

    return {
      courses: {
        activeCourses: kpi(
          snapshotCurrent.publishedCourses,
          snapshotPrev.publishedCourses,
        ),
        enrollments: kpi(
          enrollmentsCurrent.totalEnrollments,
          enrollmentsPrev.totalEnrollments,
        ),
        averageCompletion: kpi(
          progressCurrent.completionRate,
          progressPrev.completionRate,
        ),
        lessonsPublished: kpi(
          snapshotCurrent.publishedLessons,
          snapshotPrev.publishedLessons,
        ),
        totalDurationHours: kpi(
          hours(snapshotCurrent.videoSeconds),
          hours(snapshotPrev.videoSeconds),
        ),
        quizAttempts: kpi(quizzesCurrent.attempts, quizzesPrev.attempts),
        dailyEnrollments: fillDays(dailyEnrollments, from, to, emptyTrendPoint),
        topCourses: targetIds.map((courseId) => {
          const progress = progressByCourse.get(courseId);
          const counts = countsByCourse.get(courseId);
          return {
            courseId,
            title: titleById.get(courseId) ?? "Untitled course",
            enrollments: enrollmentByCourse.get(courseId) ?? 0,
            learners: counts?.learners ?? 0,
            completionRate: progress?.completionRate ?? 0,
            averageProgressPercent: progress?.averageProgressPercent ?? 0,
            lessons: counts?.lessons ?? 0,
            durationHours: hours(counts?.videoSeconds ?? 0),
          };
        }),
        content: {
          courses: content.courses,
          publishedCourses: content.publishedCourses,
          sections: content.sections,
          lessons: content.lessons,
          videoLessons: content.videoLessons,
          documentLessons: content.documentLessons,
          quizLessons: content.quizLessons,
          resources: content.resources,
          durationHours: hours(content.videoSeconds),
        },
        quizzes: quizzesCurrent,
      },
    };
  }

  async function buildRevenueOverview(
    scope: OrderScope,
    range: DashboardRange,
  ) {
    const { from, to, prevFrom, prevTo, days } =
      resolveDashboardRevenueRange(range);
    const current = await orderService.getRawStatsForCourses(scope, {
      from,
      toExclusive: to,
    });

    const [previous, currentFunnel, previousFunnel, trend] = await Promise.all([
      orderService.getRawStatsForCourses(scope, {
        from: prevFrom,
        toExclusive: prevTo,
        currency: current.currency,
      }),
      orderService.getOrderStatusFunnel(scope, {
        from,
        toExclusive: to,
      }),
      orderService.getOrderStatusFunnel(scope, {
        from: prevFrom,
        toExclusive: prevTo,
      }),
      orderService.getRevenueTrend(scope, {
        from,
        toExclusive: to,
        currency: current.currency,
      }),
    ]);

    const currentNetRevenue = current.grossPaid - current.refundedAmount;
    const previousNetRevenue = previous.grossPaid - previous.refundedAmount;

    return {
      currency: current.currency,
      trend: normalizeRevenueTrend(trend, from, days),
      grossSales: kpi(current.grossPaid, previous.grossPaid),
      netRevenue: kpi(currentNetRevenue, previousNetRevenue),
      orders: kpi(currentFunnel.paid, previousFunnel.paid),
      refunds: kpi(currentFunnel.refunded, previousFunnel.refunded),
    };
  }

  async function buildLearningActivity(
    window: EnrollmentActivityWindow,
  ): Promise<DashboardLearningActivity> {
    const [progress, currentEnrollments, previousEnrollments, activityRows] =
      await Promise.all([
        learningProgressService.getAverageProgressAndCompletionRate(),
        enrollmentService.getEnrollmentStats({
          from: window.from,
          to: resolveInclusiveEnd(window.to),
        }),
        enrollmentService.getEnrollmentStats({
          from: window.previousFrom,
          to: resolveInclusiveEnd(window.previousTo),
        }),
        enrollmentService.getEnrollmentActivityBuckets({
          from: window.from,
          to: window.to,
        }),
      ]);

    const activityByStart = new Map(
      activityRows.map((row) => [row.start.toISOString(), row.value]),
    );
    const buckets = createEnrollmentActivityBucketStarts(window.from).map(
      (start) => ({
        start: start.toISOString(),
        value: activityByStart.get(start.toISOString()) ?? 0,
      }),
    );

    return {
      averageCourseProgress: { value: progress.averageProgressPercent },
      courseCompletionRate: { value: progress.completionRate },
      newEnrollments: { value: currentEnrollments.totalEnrollments },
      enrollmentActivity: {
        changePercent: kpi(
          currentEnrollments.totalEnrollments,
          previousEnrollments.totalEnrollments,
        ).changePercent,
        buckets,
      },
    };
  }

  /**
   * Every team member has a Home. Its academy-wide numbers need analytics
   * for every course (the Overview or Revenue key), its money the revenue
   * key; "Your Courses" follows the caller's own course visibility. What
   * the caller may not see is null and never computed.
   */
  async function buildDashboard(
    actor: AnalyticsActor,
    range: DashboardRange = "30d",
  ): Promise<DashboardSummaryResponse> {
    const held = await academyAnalytics(actor);
    if (!held.overview && !held.revenue) {
      return {
        revenue: null,
        students: null,
        activeLearners: null,
        watchHours: null,
        revenueOverview: null,
        learningActivity: null,
        yourCourses: await buildYourCourses(
          await resolveDashboardCourses(actor),
        ),
      };
    }
    const full = await buildAcademyDashboard(actor, range);
    return held.revenue
      ? full
      : { ...full, revenue: null, revenueOverview: null };
  }

  async function buildAcademyDashboard(
    actor: AnalyticsActor,
    range: DashboardRange,
  ): Promise<DashboardSummaryResponse> {
    const dashboardNow = new Date();
    const enrollmentActivityWindow =
      resolveEnrollmentActivityWindow(dashboardNow);
    const dashboardCourses = await resolveDashboardCourses(actor);
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

    const [currentRevenue, revenueOverview, learningActivity, yourCourses] =
      await Promise.all([
        orderService.getRawStatsForCourses(scope, {
          from: currentMonthFrom,
          to: now,
        }),
        buildRevenueOverview(scope, range),
        buildLearningActivity(enrollmentActivityWindow),
        buildYourCourses(dashboardCourses),
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
        from: previousMonthFrom,
        to: previousMonthTo,
        currency: currentRevenue.currency,
      }),
      studentsService.getStudentPopulationCounts({
        createdFrom: currentMonthFrom,
        createdTo: now,
      }),
      studentsService.getActiveLearnerCount({
        from: activeCurrentFrom,
        to: now,
      }),
      studentsService.getActiveLearnerCount({
        from: activePreviousFrom,
        to: activePreviousTo,
      }),
      learningProgressService.getEstimatedWatchHours({
        from: currentMonthFrom,
        to: now,
      }),
      learningProgressService.getEstimatedWatchHours({
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
      yourCourses,
    };
  }

  function buildEmptyOverview(): AnalyticsOverviewResponse {
    const emptyKpi = kpi(0, 0);
    return {
      currency: "INR",
      overview: {
        netRevenue: emptyKpi,
        orders: emptyKpi,
        newEnrollments: emptyKpi,
        totalStudents: emptyKpi,
        refundRate: emptyKpi,
        completionRate: emptyKpi,
        dailyOrders: [],
        dailyEnrollments: [],
        coursePerformance: [],
      },
    };
  }

  function buildEmptyRevenue(): AnalyticsRevenueResponse {
    const emptyKpi = kpi(0, 0);
    return {
      currency: "INR",
      revenue: {
        grossSales: emptyKpi,
        netRevenue: emptyKpi,
        orders: emptyKpi,
        uniqueBuyers: emptyKpi,
        averageOrderValue: emptyKpi,
        refundRate: emptyKpi,
        refundedAmount: emptyKpi,
        refundCount: emptyKpi,
        funnel: { inCarts: 0, checkoutStarted: 0, paid: 0, refunded: 0 },
        daily: [],
        byProduct: [],
        sources: [],
        paymentMethods: [],
        coupons: [],
        topCourses: [],
      },
    };
  }

  function buildEmptyCourses(): AnalyticsCoursesResponse {
    const emptyKpi = kpi(0, 0);
    return {
      courses: {
        activeCourses: emptyKpi,
        enrollments: emptyKpi,
        averageCompletion: emptyKpi,
        lessonsPublished: emptyKpi,
        totalDurationHours: emptyKpi,
        quizAttempts: emptyKpi,
        dailyEnrollments: [],
        topCourses: [],
        content: {
          courses: 0,
          publishedCourses: 0,
          sections: 0,
          lessons: 0,
          videoLessons: 0,
          documentLessons: 0,
          quizLessons: 0,
          resources: 0,
          durationHours: 0,
        },
        quizzes: { attempts: 0, submitted: 0, passRate: 0, averageScore: 0 },
      },
    };
  }

  /**
   * Answers are aggregate snapshots (see `analyticsResponses`), each for one
   * actor: a change to the actor's roles clears theirs (`user:<id>`).
   */
  async function cachedResponse<T>(
    actor: AnalyticsActor,
    key: string,
    build: () => Promise<T>,
  ): Promise<T> {
    return (await analyticsResponses.fetch(key, build, {
      tags: [cacheTags.user(actor.id), cacheTags.rbac],
    })) as T;
  }

  function actorKey(actor: AnalyticsActor): string {
    return `${actor.id}:${[...actor.roles].sort().join(",")}`;
  }

  function tabKey(
    tab: "overview" | "revenue" | "courses",
    actor: AnalyticsActor,
    query: AnalyticsFilterQuery,
  ): string {
    return [
      tab,
      actorKey(actor),
      query.courseId ?? "",
      query.from?.toISOString() ?? "",
      query.to?.toISOString() ?? "",
    ].join("|");
  }

  return {
    overview: (actor: AnalyticsActor, query: AnalyticsFilterQuery) =>
      cachedResponse(actor, tabKey("overview", actor, query), async () => {
        const [response, revenue] = await Promise.all([
          buildOverview(actor, query),
          seesRevenue(actor),
        ]);
        return revenue ? response : withoutRevenue(response);
      }),
    revenue: (actor: AnalyticsActor, query: AnalyticsFilterQuery) =>
      cachedResponse(actor, tabKey("revenue", actor, query), () =>
        buildRevenue(actor, query),
      ),
    courses: (actor: AnalyticsActor, query: AnalyticsFilterQuery) =>
      cachedResponse(actor, tabKey("courses", actor, query), () =>
        buildCourses(actor, query),
      ),
    dashboard: (actor: AnalyticsActor, range: DashboardRange = "30d") =>
      cachedResponse(
        actor,
        ["dashboard", actorKey(actor), range].join("|"),
        () => buildDashboard(actor, range),
      ),
  };
}

export type AnalyticsService = ReturnType<typeof createAnalyticsService>;
