/**
 * What only staff may do. A learner's session must open none of it, however
 * the request is made; the administrator's must open all of it, which also
 * proves each address checked here exists and answers.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  signedInAdmin,
  signedUpLearner,
  startFlowApp,
} from "./setup/flow-app.ts";
import { createCourse, play } from "./setup/flow-courses.ts";

const flow = await startFlowApp();
const admin = await signedInAdmin(flow);

/** Pages of the admin area, each read by one request. */
const STAFF_READS = [
  "/v1/enrollments",
  "/v1/students",
  "/v1/orders/stats",
  "/v1/orders/needs-refund",
  "/v1/coupons",
  "/v1/bundles/manage",
  "/v1/manual-payments",
  "/v1/refund-requests",
  "/v1/payments/gateway-config",
  "/v1/team/members",
  "/v1/team/roles",
  "/v1/team/invitations",
  "/v1/platform/settings",
  "/v1/academy/brand",
];

await test("a learner is refused every page of the admin area", async () => {
  const { client } = await signedUpLearner(flow);
  for (const url of STAFF_READS) {
    const response = await client.get(url);
    assert.equal(response.status, 403, `${url} answered ${response.status}`);
  }
});

await test("a visitor who is not signed in is asked to sign in for every page of the admin area", async () => {
  const visitor = flow.visitor();
  for (const url of STAFF_READS) {
    const response = await visitor.get(url);
    assert.equal(response.status, 401, `${url} answered ${response.status}`);
  }
});

await test("the administrator opens every page of the admin area", async () => {
  for (const url of STAFF_READS) {
    const response = await admin.get(url);
    assert.equal(
      response.status,
      200,
      `${url} answered ${response.status}: ${JSON.stringify(response.body.error)}`,
    );
  }
});

await test("Home's dashboard opens for a learner with no revenue or academy-wide numbers in it", async () => {
  const { client } = await signedUpLearner(flow);
  const academyWide = [
    "revenue",
    "students",
    "activeLearners",
    "watchHours",
    "revenueOverview",
    "learningActivity",
  ];

  const learnerHome = await client.get<Record<string, unknown>>(
    "/v1/analytics/dashboard",
  );
  assert.equal(learnerHome.status, 200);
  for (const key of academyWide) {
    assert.equal(learnerHome.body.data?.[key], null, `${key} is hidden`);
  }

  const adminHome = await admin.get<Record<string, unknown>>(
    "/v1/analytics/dashboard",
  );
  assert.equal(adminHome.status, 200);
  for (const key of academyWide) {
    assert.notEqual(
      adminHome.body.data?.[key],
      null,
      `${key} is shown to the admin`,
    );
  }
});

await test("a learner cannot give themselves a course", async () => {
  const course = await createCourse(flow, { pricing: "paid" });
  const { client, userId } = await signedUpLearner(flow);

  const grant = await client.post("/v1/access/grants", {
    userId,
    courseId: course.id,
  });

  assert.equal(grant.status, 403);
  assert.equal((await play(client, course, 2)).status, 403);
});

await test("a learner cannot archive or unpublish a course", async () => {
  const course = await createCourse(flow, { pricing: "free" });
  const { client } = await signedUpLearner(flow);

  assert.equal(
    (await client.post(`/v1/courses/${course.id}/archive`)).status,
    403,
  );
  assert.equal(
    (await client.post(`/v1/courses/${course.id}/unpublish`)).status,
    403,
  );
  assert.equal(
    (await play(flow.visitor(), course, 1)).status,
    200,
    "the course is still published",
  );
});

await test("a learner cannot change the academy's settings", async () => {
  const { client } = await signedUpLearner(flow);
  const response = await client.patch("/v1/platform/settings", {
    security: { maxDevicesPerStudent: 1 },
  });
  assert.equal(response.status, 403);
});

await test("a learner sees their own orders and never another learner's", async () => {
  const course = await createCourse(flow, { pricing: "free" });
  const { client: first } = await signedUpLearner(flow);
  const { client: second } = await signedUpLearner(flow);
  const mine = await first.post<{ order: { id: string } }>(
    "/v1/checkout/orders",
    { items: [{ itemType: "course", courseId: course.id }] },
  );
  assert.equal(mine.status, 200);
  const orderId = mine.body.data!.order.id;

  const own = await first.get(`/v1/orders/${orderId}`);
  assert.equal(own.status, 200);

  const others = await second.get(`/v1/orders/${orderId}`);
  assert.equal(others.status, 404, "as if it did not exist");
  const list = await second.get<unknown>("/v1/orders");
  assert.equal(list.status, 200);
  assert.ok(
    !JSON.stringify(list.body).includes(orderId),
    "it is not in their list either",
  );
});

await flow.close();
