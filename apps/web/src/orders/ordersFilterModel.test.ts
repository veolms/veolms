// Run: node --test apps/web/src/orders/*.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import type { OrderCourseOption } from "@veolms/contracts";
import {
  DEFAULT_FILTER_STATE,
  courseFilterLabel,
  courseFilterParams,
  couponFilterLabel,
  isFreeOnlyView,
  parseFilterState,
  serializeFilterState,
  statusFilterLabel,
  toFilterParams,
} from "./ordersFilterModel.ts";
import {
  formatDayRange,
  fromDayKey,
  resolveDateRange,
} from "./ordersDateRange.ts";

const PAID_A = "11111111-1111-4111-8111-111111111111";
const PAID_B = "22222222-2222-4222-8222-222222222222";
const FREE_A = "33333333-3333-4333-8333-333333333333";
const COUPON = "44444444-4444-4444-8444-444444444444";

const course = (id: string, title: string, isFree: boolean) =>
  ({
    id,
    title,
    isFree,
    price: isFree ? 0 : 79900,
    currency: "INR",
    thumbnailUrl: null,
  }) satisfies OrderCourseOption;

const COURSES = [
  course(PAID_A, "JavaScript", false),
  course(PAID_B, "TypeScript", false),
  course(FREE_A, "Git", true),
];

const NOW = new Date(2026, 10, 12, 15, 30);

await test("an empty URL is the default view: 1D, Success, all paid courses", () => {
  const state = parseFilterState(new URLSearchParams());
  assert.deepEqual(state, DEFAULT_FILTER_STATE);
  const params = toFilterParams(state, COURSES, NOW);
  assert.equal(params.statuses, "paid");
  assert.equal(params.kind, "paid");
  assert.equal(params.courseIds, undefined);
  assert.equal(new Date(params.from).getDate(), 12);
});

await test("the default view leaves the URL empty", () => {
  assert.equal(serializeFilterState(DEFAULT_FILTER_STATE).toString(), "");
});

await test("a shared URL comes back as the same filters", () => {
  const state = {
    ...DEFAULT_FILTER_STATE,
    range: "custom" as const,
    customFrom: new Date(2026, 10, 2),
    customTo: new Date(2026, 10, 9),
    statuses: ["failed", "expired"] as const,
    statusMode: "exclude" as const,
    courses: [PAID_A],
    courseMode: "exclude" as const,
    coupons: [COUPON],
    couponMode: "exclude" as const,
    search: "aarav",
    page: 3,
    orderId: PAID_B,
  };
  const url = serializeFilterState(state);
  assert.deepEqual(parseFilterState(url), state);
});

await test("anything unreadable in the URL falls back to the default", () => {
  const state = parseFilterState(
    new URLSearchParams(
      "range=forever&status=bogus&course=nope&coupon=x&page=-4&order=1",
    ),
  );
  assert.equal(state.range, "1d");
  assert.deepEqual(state.statuses, ["success"]);
  assert.deepEqual(state.courses, []);
  assert.deepEqual(state.coupons, []);
  assert.equal(state.page, 1);
  assert.equal(state.orderId, null);
});

await test("a custom range missing a day is the default range", () => {
  const state = parseFilterState(
    new URLSearchParams("range=custom&from=2026-11-02"),
  );
  assert.equal(state.range, "1d");
});

await test("all statuses and all courses are kept in the URL as 'all'", () => {
  const url = serializeFilterState({
    ...DEFAULT_FILTER_STATE,
    statuses: [],
    courses: [],
  });
  assert.equal(url.toString(), "status=all&course=all");
  const back = parseFilterState(url);
  assert.deepEqual(back.statuses, []);
  assert.deepEqual(back.courses, []);
});

await test("failed stands for failed and cancelled payments", () => {
  const params = toFilterParams(
    { ...DEFAULT_FILTER_STATE, statuses: ["failed"] },
    COURSES,
    NOW,
  );
  assert.equal(params.statuses, "payment_failed,cancelled");
});

await test("partially refunded is a status of its own", () => {
  const params = toFilterParams(
    { ...DEFAULT_FILTER_STATE, statuses: ["partially_refunded"] },
    COURSES,
    NOW,
  );
  assert.equal(params.statuses, "partially_refunded");
  assert.equal(
    statusFilterLabel(["partially_refunded"], "include"),
    "Partially refunded",
  );
});

await test("every paid course chosen asks for paid orders, not their ids", () => {
  assert.deepEqual(courseFilterParams([PAID_A, PAID_B], "include", COURSES), {
    kind: "paid",
  });
});

await test("some paid courses narrow to those ids and to paid", () => {
  assert.deepEqual(courseFilterParams([PAID_A], "include", COURSES), {
    courseIds: PAID_A,
    kind: "paid",
  });
});

await test("paid and free together send only the ids", () => {
  assert.deepEqual(courseFilterParams([PAID_A, FREE_A], "include", COURSES), {
    courseIds: `${PAID_A},${FREE_A}`,
  });
});

await test("excluding courses is a NOT filter on their ids", () => {
  assert.deepEqual(courseFilterParams([PAID_A], "exclude", COURSES), {
    courseIds: PAID_A,
    courseMode: "exclude",
  });
});

await test("nothing chosen is no course filter", () => {
  assert.deepEqual(courseFilterParams([], "include", COURSES), {});
});

await test("free courses alone switch to the free view", () => {
  assert.equal(
    isFreeOnlyView({ ...DEFAULT_FILTER_STATE, courses: [FREE_A] }, COURSES),
    true,
  );
  assert.equal(isFreeOnlyView(DEFAULT_FILTER_STATE, COURSES), false);
});

await test("filter buttons summarise the choice", () => {
  assert.equal(
    courseFilterLabel("default", "include", COURSES),
    "All paid courses",
  );
  assert.equal(
    courseFilterLabel([PAID_A, PAID_B], "include", COURSES),
    "All paid courses",
  );
  assert.equal(
    courseFilterLabel([FREE_A], "include", COURSES),
    "All free courses",
  );
  assert.equal(courseFilterLabel([PAID_A], "include", COURSES), "JavaScript");
  assert.equal(
    courseFilterLabel([PAID_A, FREE_A], "include", COURSES),
    "2 courses",
  );
  assert.equal(
    courseFilterLabel([PAID_A, PAID_B], "exclude", COURSES),
    "All except 2 courses",
  );
  assert.equal(courseFilterLabel([], "include", COURSES), "All courses");
  assert.equal(statusFilterLabel([], "include"), "All statuses");
  assert.equal(
    statusFilterLabel(["success", "failed"], "include"),
    "2 statuses",
  );
  assert.equal(statusFilterLabel(["success"], "exclude"), "All except Success");
  assert.equal(
    couponFilterLabel([COUPON], "include", new Map([[COUPON, "DIWALI26"]])),
    "DIWALI26",
  );
});

await test("date chips count today as one of their days", () => {
  const week = resolveDateRange("7d", NOW);
  assert.equal(week.from.getDate(), 6);
  assert.equal(week.to.getDate(), 12);
  assert.equal(week.to.getHours(), 23);
});

await test("last month is the whole previous month", () => {
  const range = resolveDateRange("last_month", NOW);
  assert.equal(range.from.getMonth(), 9);
  assert.equal(range.from.getDate(), 1);
  assert.equal(range.to.getDate(), 31);
});

await test("a custom range never runs past today and may be picked backwards", () => {
  const range = resolveDateRange("custom", NOW, {
    from: new Date(2026, 11, 20),
    to: new Date(2026, 10, 2),
  });
  assert.equal(range.from.getDate(), 2);
  assert.equal(range.to.getMonth(), 10);
  assert.equal(range.to.getDate(), 12);
});

await test("day keys refuse dates that do not exist", () => {
  assert.equal(fromDayKey("2026-02-31"), null);
  assert.equal(fromDayKey("2026-11-09")?.getDate(), 9);
});

await test("a range is written short within a year", () => {
  assert.equal(
    formatDayRange(new Date(2026, 10, 2), new Date(2026, 10, 9)),
    "Nov 2 – Nov 9, 2026",
  );
});
