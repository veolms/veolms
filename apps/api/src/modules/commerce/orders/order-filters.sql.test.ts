import assert from "node:assert/strict";
import { test } from "node:test";
import type { Database } from "@veolms/database";
import {
  DummyDriver,
  Kysely,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
} from "kysely";
import {
  ordersListQuerySchema,
  orderStatsQuerySchema,
  type OrderScope,
} from "@veolms/contracts";
import { adminOrderConditions, allOf } from "./order-filters.sql.ts";

const db = new Kysely<Database>({
  dialect: {
    createAdapter: () => new PostgresAdapter(),
    createDriver: () => new DummyDriver(),
    createIntrospector: (kysely) => new PostgresIntrospector(kysely),
    createQueryCompiler: () => new PostgresQueryCompiler(),
  },
});

const academy: OrderScope = { type: "academy", id: crypto.randomUUID() };
const courseA = "11111111-1111-4111-8111-111111111111";
const courseB = "22222222-2222-4222-8222-222222222222";
const couponA = "33333333-3333-4333-8333-333333333333";

function compile(filters: Parameters<typeof adminOrderConditions>[1]) {
  const compiled = allOf(adminOrderConditions(academy, filters)).compile(db);
  return {
    sql: compiled.sql.replace(/\s+/g, " "),
    parameters: compiled.parameters,
  };
}

await test("no filters is no condition", () => {
  assert.equal(compile({}).sql, "true");
});

await test("statuses are kept, or left out when excluded", () => {
  const kept = compile({ statuses: ["paid", "refunded"] });
  assert.match(kept.sql, /o\.status in \(\$1, \$2\)/);
  assert.deepEqual(kept.parameters, ["paid", "refunded"]);

  const left = compile({ statuses: ["paid"], statusMode: "exclude" });
  assert.match(left.sql, /o\.status not in \(\$1\)/);
});

await test("courses are matched through the order's items, or excluded with not exists", () => {
  const kept = compile({ courseIds: [courseA, courseB] });
  assert.match(kept.sql, /^\(exists \( select 1 from order_items oi/);
  assert.deepEqual(kept.parameters, [[courseA, courseB]]);

  const left = compile({ courseIds: [courseA], courseMode: "exclude" });
  assert.match(left.sql, /not exists \( select 1 from order_items oi/);
});

await test("excluding a coupon keeps orders that used no coupon", () => {
  const left = compile({ couponIds: [couponA], couponMode: "exclude" });
  assert.match(left.sql, /o\.coupon_id is null or not \(o\.coupon_id = any/);

  const kept = compile({ couponIds: [couponA] });
  assert.doesNotMatch(kept.sql, /is null/);
});

await test("paid means a price before discounts; free means none", () => {
  assert.match(compile({ kind: "paid" }).sql, /o\.subtotal_amount > 0/);
  assert.match(compile({ kind: "free" }).sql, /o\.subtotal_amount = 0/);
});

await test("every filter is a condition of its own", () => {
  const conditions = adminOrderConditions(academy, {
    statuses: ["paid"],
    courseIds: [courseA],
    couponIds: [couponA],
    kind: "paid",
    from: new Date("2026-11-01T00:00:00Z"),
    to: new Date("2026-11-12T00:00:00Z"),
  });
  assert.equal(conditions.length, 6);
});

await test("search escapes LIKE wildcards", () => {
  const searched = compile({ search: "100%" });
  assert.ok(searched.parameters.includes("%100\\%%"));
});

await test("a learner's scope is always applied", () => {
  const user: OrderScope = { type: "user", id: courseA };
  const compiled = allOf(adminOrderConditions(user, {})).compile(db);
  assert.match(compiled.sql, /o\.user_id = \$1::uuid/);
});

await test("the list query reads comma lists and defaults modes to include", () => {
  const parsed = ordersListQuerySchema.parse({
    courseIds: `${courseA}, ${courseB}`,
    couponIds: couponA,
    couponMode: "exclude",
    kind: "free",
    page: "2",
  });
  assert.deepEqual(parsed.courseIds, [courseA, courseB]);
  assert.equal(parsed.courseMode, "include");
  assert.equal(parsed.couponMode, "exclude");
  assert.equal(parsed.page, 2);
});

await test("the list query refuses ids that are not uuids", () => {
  assert.equal(
    ordersListQuerySchema.safeParse({ courseIds: "not-a-uuid" }).success,
    false,
  );
});

await test("the stats query takes the same filters as the list", () => {
  const parsed = orderStatsQuerySchema.parse({
    statuses: "payment_failed,expired",
    statusMode: "exclude",
    courseIds: courseA,
    search: "aarav",
  });
  assert.deepEqual(parsed.statuses, ["payment_failed", "expired"]);
  assert.equal(parsed.statusMode, "exclude");
  assert.deepEqual(parsed.courseIds, [courseA]);
});

await test("a single status and a list keep only what both allow", async () => {
  const { toAdminOrderFilters } = await import("./admin-orders.service.ts");
  assert.deepEqual(
    toAdminOrderFilters({ status: "paid", statuses: ["paid", "refunded"] })
      .statuses,
    ["paid"],
  );
  const none = toAdminOrderFilters({ status: "paid", statuses: ["refunded"] });
  assert.equal(none.matchNothing, true);
  assert.match(
    allOf(adminOrderConditions(academy, none)).compile(db).sql,
    /false/,
  );
});

await test("the older single course and coupon join their lists", async () => {
  const { toAdminOrderFilters } = await import("./admin-orders.service.ts");
  const filters = toAdminOrderFilters({
    courseId: courseA,
    courseIds: [courseB],
    couponId: couponA,
  });
  assert.deepEqual(filters.courseIds, [courseB, courseA]);
  assert.deepEqual(filters.couponIds, [couponA]);
});
