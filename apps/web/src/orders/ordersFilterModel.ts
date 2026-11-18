import type {
  OrderCourseOption,
  OrderFilterMode,
  OrderKind,
  OrderStatus,
} from "@veolms/contracts";
import {
  DEFAULT_DATE_RANGE,
  fromDayKey,
  isDateRangeKey,
  resolveDateRange,
  toDayKey,
  type DateRangeKey,
} from "./ordersDateRange.ts";

/**
 * The Orders screen's filters, kept in the URL so a view can be shared:
 * what is default is left out of it, and anything it cannot read falls back
 * to the default.
 */

/** The statuses the Status filter offers, each standing for real ones. */
export const STATUS_OPTIONS = [
  { key: "success", label: "Success", statuses: ["paid"] },
  {
    key: "partially_refunded",
    label: "Partially refunded",
    statuses: ["partially_refunded"],
  },
  { key: "refunded", label: "Refunded", statuses: ["refunded"] },
  {
    key: "failed",
    label: "Failed",
    statuses: ["payment_failed", "cancelled"],
  },
  { key: "expired", label: "Expired", statuses: ["expired"] },
] as const satisfies ReadonlyArray<{
  key: string;
  label: string;
  statuses: readonly OrderStatus[];
}>;

export type StatusKey = (typeof STATUS_OPTIONS)[number]["key"];
const STATUS_KEYS = new Set<string>(STATUS_OPTIONS.map((option) => option.key));
export const DEFAULT_STATUSES: readonly StatusKey[] = ["success"];

/** "All paid courses" until the course filter is touched. */
export type CourseSelection = "default" | readonly string[];

export interface OrdersFilterState {
  range: DateRangeKey;
  customFrom: Date | null;
  customTo: Date | null;
  /** Empty: every status. */
  statuses: readonly StatusKey[];
  statusMode: OrderFilterMode;
  courses: CourseSelection;
  courseMode: OrderFilterMode;
  /** Empty: every coupon (and none). */
  coupons: readonly string[];
  couponMode: OrderFilterMode;
  search: string;
  page: number;
  /** The order open in the panel. */
  orderId: string | null;
}

export const DEFAULT_FILTER_STATE: OrdersFilterState = {
  range: DEFAULT_DATE_RANGE,
  customFrom: null,
  customTo: null,
  statuses: DEFAULT_STATUSES,
  statusMode: "include",
  courses: "default",
  courseMode: "include",
  coupons: [],
  couponMode: "include",
  search: "",
  page: 1,
  orderId: null,
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ALL = "all";

function readList(value: string | null): string[] {
  return (value ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

function readIds(value: string | null): string[] {
  return [...new Set(readList(value).filter((id) => UUID.test(id)))];
}

function readMode(value: string | null): OrderFilterMode {
  return value === "1" ? "exclude" : "include";
}

/** The filters a URL's query carries. */
export function parseFilterState(params: URLSearchParams): OrdersFilterState {
  const rangeParam = params.get("range");
  const range =
    rangeParam && isDateRangeKey(rangeParam) ? rangeParam : DEFAULT_DATE_RANGE;
  const customFrom = range === "custom" ? fromDayKey(params.get("from")) : null;
  const customTo = range === "custom" ? fromDayKey(params.get("to")) : null;

  const statusParam = params.get("status");
  const statuses =
    statusParam === null
      ? DEFAULT_STATUSES
      : statusParam === ALL
        ? []
        : (readList(statusParam).filter((key) =>
            STATUS_KEYS.has(key),
          ) as StatusKey[]);

  const courseParam = params.get("course");
  const courses: CourseSelection =
    courseParam === null
      ? "default"
      : courseParam === ALL
        ? []
        : readIds(courseParam);

  const page = Number(params.get("page"));
  const orderId = params.get("order");

  return {
    range:
      range === "custom" && !(customFrom && customTo)
        ? DEFAULT_DATE_RANGE
        : range,
    customFrom,
    customTo,
    statuses:
      statusParam !== null && statusParam !== ALL && statuses.length === 0
        ? DEFAULT_STATUSES
        : statuses,
    statusMode: readMode(params.get("xs")),
    courses,
    courseMode: readMode(params.get("xc")),
    coupons: readIds(params.get("coupon")),
    couponMode: readMode(params.get("xk")),
    search: (params.get("q") ?? "").slice(0, 100),
    page: Number.isInteger(page) && page > 1 ? Math.min(page, 10_000) : 1,
    orderId: orderId && UUID.test(orderId) ? orderId : null,
  };
}

function sameList(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

/** The query for `state`, defaults left out. */
export function serializeFilterState(
  state: OrdersFilterState,
): URLSearchParams {
  const params = new URLSearchParams();
  if (state.range !== DEFAULT_DATE_RANGE) params.set("range", state.range);
  if (state.range === "custom" && state.customFrom && state.customTo) {
    params.set("from", toDayKey(state.customFrom));
    params.set("to", toDayKey(state.customTo));
  }
  if (!sameList(state.statuses, DEFAULT_STATUSES)) {
    params.set(
      "status",
      state.statuses.length ? state.statuses.join(",") : ALL,
    );
  }
  if (state.statusMode === "exclude" && state.statuses.length) {
    params.set("xs", "1");
  }
  if (state.courses !== "default") {
    params.set("course", state.courses.length ? state.courses.join(",") : ALL);
    if (state.courseMode === "exclude" && state.courses.length) {
      params.set("xc", "1");
    }
  }
  if (state.coupons.length) {
    params.set("coupon", state.coupons.join(","));
    if (state.couponMode === "exclude") params.set("xk", "1");
  }
  if (state.search.trim()) params.set("q", state.search.trim());
  if (state.page > 1) params.set("page", String(state.page));
  if (state.orderId) params.set("order", state.orderId);
  return params;
}

/** The course ids a selection stands for, given what can be chosen. */
export function selectedCourseIds(
  selection: CourseSelection,
  courses: readonly OrderCourseOption[],
): string[] {
  return selection === "default"
    ? courses.filter((course) => !course.isFree).map((course) => course.id)
    : [...selection];
}

export interface CourseFilterParams {
  courseIds?: string;
  courseMode?: OrderFilterMode;
  kind?: OrderKind;
}

/**
 * The course part of the query. Choosing every paid (or every free) course
 * asks for paid (free) orders, so a course added later or one no longer on
 * sale is not left out; a choice all of one kind narrows to that kind too.
 */
export function courseFilterParams(
  selection: CourseSelection,
  mode: OrderFilterMode,
  courses: readonly OrderCourseOption[],
): CourseFilterParams {
  if (selection === "default") return { kind: "paid" };
  if (selection.length === 0) return {};
  if (mode === "exclude") {
    return { courseIds: selection.join(","), courseMode: "exclude" };
  }
  const byId = new Map(courses.map((course) => [course.id, course]));
  const chosen = selection.map((id) => byId.get(id)).filter(Boolean);
  const kinds = new Set(
    chosen.map((course) => (course!.isFree ? "free" : "paid")),
  );
  if (chosen.length !== selection.length || kinds.size !== 1) {
    return { courseIds: selection.join(",") };
  }
  const kind = [...kinds][0] as OrderKind;
  const everyOfKind = courses.filter(
    (course) => (kind === "free") === course.isFree,
  );
  return everyOfKind.length === selection.length
    ? { kind }
    : { courseIds: selection.join(","), kind };
}

/** The real statuses the chosen options stand for. */
export function statusesFor(keys: readonly StatusKey[]): OrderStatus[] {
  return STATUS_OPTIONS.filter((option) => keys.includes(option.key)).flatMap(
    (option) => [...option.statuses],
  );
}

/** The query the orders list, its figures and its export share. */
export function toFilterParams(
  state: OrdersFilterState,
  courses: readonly OrderCourseOption[],
  now: Date,
) {
  const { from, to } = resolveDateRange(state.range, now, {
    from: state.customFrom,
    to: state.customTo,
  });
  const statuses = statusesFor(state.statuses);
  return {
    from: from.toISOString(),
    to: to.toISOString(),
    ...(statuses.length
      ? {
          statuses: statuses.join(","),
          ...(state.statusMode === "exclude"
            ? { statusMode: "exclude" as const }
            : {}),
        }
      : {}),
    ...courseFilterParams(state.courses, state.courseMode, courses),
    ...(state.coupons.length
      ? {
          couponIds: state.coupons.join(","),
          ...(state.couponMode === "exclude"
            ? { couponMode: "exclude" as const }
            : {}),
        }
      : {}),
    ...(state.search.trim() ? { search: state.search.trim() } : {}),
  };
}

function summarise(
  count: number,
  noun: [string, string],
  mode: OrderFilterMode,
  single: string | undefined,
): string {
  const named =
    count === 1 && single ? single : `${count} ${noun[count === 1 ? 0 : 1]}`;
  return mode === "exclude" ? `All except ${named}` : named;
}

export function statusFilterLabel(
  keys: readonly StatusKey[],
  mode: OrderFilterMode,
): string {
  if (keys.length === 0) return "All statuses";
  const single = STATUS_OPTIONS.find((option) => option.key === keys[0])?.label;
  return summarise(keys.length, ["status", "statuses"], mode, single);
}

export function courseFilterLabel(
  selection: CourseSelection,
  mode: OrderFilterMode,
  courses: readonly OrderCourseOption[],
): string {
  if (selection === "default") return "All paid courses";
  if (selection.length === 0) return "All courses";
  if (mode === "include") {
    const params = courseFilterParams(selection, mode, courses);
    if (params.kind && !params.courseIds) {
      return params.kind === "free" ? "All free courses" : "All paid courses";
    }
  }
  const single = courses.find((course) => course.id === selection[0])?.title;
  return summarise(selection.length, ["course", "courses"], mode, single);
}

export function couponFilterLabel(
  selection: readonly string[],
  mode: OrderFilterMode,
  codes: ReadonlyMap<string, string>,
): string {
  if (selection.length === 0) return "All coupons";
  return summarise(
    selection.length,
    ["coupon", "coupons"],
    mode,
    codes.get(selection[0]!),
  );
}

/** Whether only free enrollments are shown (the free figures and columns). */
export function isFreeOnlyView(
  state: OrdersFilterState,
  courses: readonly OrderCourseOption[],
): boolean {
  return (
    courseFilterParams(state.courses, state.courseMode, courses).kind === "free"
  );
}
