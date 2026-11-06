import assert from "node:assert/strict";
import { test } from "node:test";
import type { Kysely } from "kysely";
import type { Database } from "@veolms/database";
import {
  createCourseOrderService,
  namesEveryCourse,
} from "./course-order.service.ts";

const A = "00000000-0000-4000-8000-00000000000a";
const B = "00000000-0000-4000-8000-00000000000b";
const C = "00000000-0000-4000-8000-00000000000c";

/** A database whose transaction runs its callback on a stand-in. */
function fakeDatabase() {
  const trx = { transaction: "trx" };
  const database = {
    transaction: () => ({
      execute: async (callback: (value: unknown) => Promise<unknown>) =>
        await callback(trx),
    }),
  } as unknown as Kysely<Database>;
  return { database, trx };
}

function setup(existing: string[]) {
  const { database, trx } = fakeDatabase();
  const calls = {
    locked: [] as unknown[],
    written: [] as { executor: unknown; ids: readonly string[] }[],
    invalidated: [] as (readonly string[])[],
    homeRefreshes: 0,
  };
  const service = createCourseOrderService({
    database,
    staticPages: {
      requestHomePageRefresh: () => {
        calls.homeRefreshes += 1;
      },
    },
    repository: {
      lockOrderableCourseIds: async (executor) => {
        calls.locked.push(executor);
        return existing;
      },
      writeCourseOrder: async (executor, ids) => {
        calls.written.push({ executor, ids });
      },
    },
    invalidate: (tags) => {
      calls.invalidated.push(tags);
    },
  });
  return { service, calls, trx };
}

await test("namesEveryCourse wants each course once and nothing else", () => {
  assert.equal(namesEveryCourse([B, A, C], [A, B, C]), true);
  assert.equal(namesEveryCourse([B.toUpperCase(), A, C], [A, B, C]), true);
  assert.equal(namesEveryCourse([A, B], [A, B, C]), false, "one missing");
  assert.equal(namesEveryCourse([A, B, B], [A, B, C]), false, "one twice");
  assert.equal(namesEveryCourse([A, B, C], [A, B]), false, "one unknown");
});

await test("a full order is written in one transaction, first to last", async () => {
  const { service, calls, trx } = setup([A, B, C]);
  const result = await service.reorderCourses([C, A, B]);

  assert.deepEqual(calls.locked, [trx]);
  assert.deepEqual(calls.written, [{ executor: trx, ids: [C, A, B] }]);
  assert.deepEqual(result.courses, [
    { id: C, sortPosition: 0 },
    { id: A, sortPosition: 1 },
    { id: B, sortPosition: 2 },
  ]);
});

await test("saving clears the cached course lists and rebuilds the home page", async () => {
  const { service, calls } = setup([A, B]);
  await service.reorderCourses([B, A]);

  assert.deepEqual(calls.invalidated, [["catalog"]]);
  assert.equal(calls.homeRefreshes, 1);
});

await test("an order from a stale list is refused and nothing changes", async () => {
  // A course was added since the admin loaded the list.
  const { service, calls } = setup([A, B, C]);

  await assert.rejects(service.reorderCourses([B, A]), {
    statusCode: 409,
    code: "COURSE_ORDER_STALE",
  });
  assert.deepEqual(calls.written, []);
  assert.deepEqual(calls.invalidated, []);
  assert.equal(calls.homeRefreshes, 0);
});
