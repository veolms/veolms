/**
 * The order an admin puts the courses in: saved in one go, refused when it
 * was made from a stale list or by someone who does not edit every course,
 * and followed by the catalogue, the admin's list and a learner's courses.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  signedInAdmin,
  signedUpLearner,
  startFlowApp,
} from "./setup/flow-app.ts";
import {
  createCourse,
  enrollForFree,
  myCourseIds,
} from "./setup/flow-courses.ts";

const flow = await startFlowApp();
const admin = await signedInAdmin(flow);

const first = await createCourse(flow, { title: "Order A", pricing: "free" });
const second = await createCourse(flow, { title: "Order B", pricing: "free" });
const third = await createCourse(flow, { title: "Order C", pricing: "free" });
const draft = await createCourse(flow, { title: "Order D", status: "draft" });

/** Every course the admin's list shows, in its order. */
async function adminCourseIds(): Promise<string[]> {
  const response = await admin.get<{ courses: { id: string }[] }>(
    "/v1/courses/mine",
  );
  assert.equal(response.status, 200);
  return response.body.data!.courses.map((course) => course.id);
}

/** The published catalogue, in its order. */
async function catalogueIds(): Promise<string[]> {
  const response = await flow
    .visitor()
    .get<{ courses: { id: string }[] }>("/v1/courses?limit=60");
  assert.equal(response.status, 200);
  return response.body.data!.courses.map((course) => course.id);
}

const ours = new Set([first.id, second.id, third.id, draft.id]);
const onlyOurs = (ids: readonly string[]) => ids.filter((id) => ours.has(id));

await test("the admin's order is saved and every list follows it", async () => {
  const others = (await adminCourseIds()).filter((id) => !ours.has(id));
  const order = [third.id, draft.id, first.id, second.id, ...others];

  const saved = await admin.put<{
    courses: { id: string; sortPosition: number }[];
  }>("/v1/courses/order", { courseIds: order });
  assert.equal(
    saved.status,
    200,
    `answered ${saved.status}: ${JSON.stringify(saved.body.error)}`,
  );
  assert.deepEqual(
    saved.body.data!.courses.map((course) => course.id),
    order,
  );

  assert.deepEqual(await adminCourseIds(), order, "the admin's list");
  // The catalogue lists published courses only; the draft keeps its place
  // in the order without showing.
  assert.deepEqual(
    onlyOurs(await catalogueIds()),
    [third.id, first.id, second.id],
    "the catalogue (asked again, so not from a stale cache)",
  );

  const { client: learner } = await signedUpLearner(flow);
  await enrollForFree(learner, first);
  await enrollForFree(learner, second);
  await enrollForFree(learner, third);
  assert.deepEqual(
    onlyOurs(await myCourseIds(learner)),
    [third.id, first.id, second.id],
    "a learner's courses",
  );
});

await test("an order made from a stale list is refused", async () => {
  const before = await adminCourseIds();
  const missingOne = before.filter((id) => id !== second.id);

  const response = await admin.put("/v1/courses/order", {
    courseIds: missingOne,
  });
  assert.equal(response.status, 409);
  assert.equal(response.body.error?.code, "COURSE_ORDER_STALE");
  assert.deepEqual(await adminCourseIds(), before, "nothing changed");
});

await test("a course named twice or a malformed id is refused", async () => {
  const ids = await adminCourseIds();
  const twice = await admin.put("/v1/courses/order", {
    courseIds: [...ids, ids[0]],
  });
  assert.equal(twice.status, 400);

  const malformed = await admin.put("/v1/courses/order", {
    courseIds: ["not-a-uuid"],
  });
  assert.equal(malformed.status, 400);
});

await test("a learner or a visitor cannot reorder the courses", async () => {
  const ids = await adminCourseIds();
  const { client: learner } = await signedUpLearner(flow);

  const asLearner = await learner.put("/v1/courses/order", { courseIds: ids });
  assert.equal(asLearner.status, 403);

  const asVisitor = await flow
    .visitor()
    .put("/v1/courses/order", { courseIds: ids });
  assert.equal(asVisitor.status, 401);
});

// Leave the other flow files the order they were written against.
await flow.database
  .updateTable("courses")
  .set({ sort_position: null })
  .execute();
await flow.close();
