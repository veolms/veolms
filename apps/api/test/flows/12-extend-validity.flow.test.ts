/**
 * Staff extend a learner's access to a course (Students → Extend validity),
 * through the real API: the end date moves on the grant and the enrolment
 * together, the student page shows it, the learner is told, and a linked
 * course keeps its extension when the course linking it is synced again or
 * ends.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  signedInAdmin,
  signedUpLearner,
  startFlowApp,
} from "./setup/flow-app.ts";
import { createCourse } from "./setup/flow-courses.ts";

const flow = await startFlowApp();
const admin = await signedInAdmin(flow);
const DAY = 24 * 60 * 60 * 1000;

interface Validity {
  status: string;
  previousValidUntil: string | null;
  validUntil: string | null;
}

function ok<T>(
  response: { status: number; body: { data?: T; error?: unknown } },
  status = 200,
): T {
  assert.equal(
    response.status,
    status,
    `answered ${response.status}: ${JSON.stringify(response.body.error)}`,
  );
  return response.body.data as T;
}

const path = (userId: string, courseId: string) =>
  `/v1/access/users/${userId}/courses/${courseId}`;

async function rows(userId: string, courseId: string) {
  const grant = await flow.database
    .selectFrom("access_grants")
    .select(["status", "valid_until", "source"])
    .where("user_id", "=", userId)
    .where("course_id", "=", courseId)
    .executeTakeFirstOrThrow();
  const enrollment = await flow.database
    .selectFrom("enrollments")
    .select(["status", "access_expires_at"])
    .where("user_id", "=", userId)
    .where("course_id", "=", courseId)
    .executeTakeFirstOrThrow();
  return { grant, enrollment };
}

test.after(async () => {
  await flow.close();
});

test("an extension is added to the end date, on the grant and the enrolment", async () => {
  const course = await createCourse(flow);
  const learner = await signedUpLearner(flow, "extend");
  const end = new Date(Date.now() + 30 * DAY);
  ok(
    await admin.post("/v1/access/grants", {
      userId: learner.userId,
      courseId: course.id,
      validUntil: end.toISOString(),
    }),
    201,
  );

  const extended = ok<Validity>(
    await admin.post(`${path(learner.userId, course.id)}/validity`, {
      kind: "extend",
      amount: 6,
      unit: "months",
    }),
  );
  const expected = new Date(end);
  expected.setUTCMonth(expected.getUTCMonth() + 6);
  assert.equal(extended.previousValidUntil, end.toISOString());
  assert.equal(extended.validUntil, expected.toISOString());

  const { grant, enrollment } = await rows(learner.userId, course.id);
  assert.equal(grant.valid_until?.toISOString(), expected.toISOString());
  assert.equal(
    enrollment.access_expires_at?.toISOString(),
    expected.toISOString(),
  );

  // The student page shows it.
  const page = ok<{
    courses: { courseId: string; accessExpiresAt: string | null }[];
  }>(await admin.get(`/v1/students/${learner.learner.username}`));
  assert.equal(
    page.courses.find((item) => item.courseId === course.id)?.accessExpiresAt,
    expected.toISOString(),
  );

  // The learner is told.
  const notice = await flow.database
    .selectFrom("outbox_events")
    .select("payload")
    .where("event_type", "=", "access.validity_extended")
    .where("dedupe_key", "like", "access.validity_extended:%")
    .orderBy("occurred_at", "desc")
    .executeTakeFirst();
  assert.equal(
    (notice?.payload as { recipientUserId?: string })?.recipientUserId,
    learner.userId,
  );
});

test("lifetime ends the end date; lifetime and revoked access cannot be extended", async () => {
  const course = await createCourse(flow);
  const learner = await signedUpLearner(flow, "lifetime");
  ok(
    await admin.post("/v1/access/grants", {
      userId: learner.userId,
      courseId: course.id,
      validUntil: new Date(Date.now() + 10 * DAY).toISOString(),
    }),
    201,
  );
  const lifetime = ok<Validity>(
    await admin.post(`${path(learner.userId, course.id)}/validity`, {
      kind: "lifetime",
      notify: false,
    }),
  );
  assert.equal(lifetime.validUntil, null);
  assert.equal(
    (await rows(learner.userId, course.id)).enrollment.access_expires_at,
    null,
  );

  const again = await admin.post(
    `${path(learner.userId, course.id)}/validity`,
    {
      kind: "extend",
      amount: 1,
      unit: "years",
    },
  );
  assert.equal(again.status, 409);
  assert.equal(again.body.error?.code, "COURSE_ACCESS_LIFETIME");

  ok(await admin.delete(path(learner.userId, course.id)));
  const revoked = await admin.post(
    `${path(learner.userId, course.id)}/validity`,
    { kind: "lifetime" },
  );
  assert.equal(revoked.status, 409);
  assert.equal(revoked.body.error?.code, "COURSE_ACCESS_NOT_EXTENDABLE");

  // Learners cannot extend their own access.
  const self = await learner.client.post(
    `${path(learner.userId, course.id)}/validity`,
    { kind: "lifetime" },
  );
  assert.equal(self.status, 403);
});

test("access that ran out is extended from today", async () => {
  const course = await createCourse(flow);
  const learner = await signedUpLearner(flow, "lapsed");
  ok(
    await admin.post("/v1/access/grants", {
      userId: learner.userId,
      courseId: course.id,
      validUntil: new Date(Date.now() + DAY).toISOString(),
    }),
    201,
  );
  const past = new Date(Date.now() - 5 * DAY);
  await flow.database
    .updateTable("access_grants")
    .set({ valid_until: past, status: "expired" })
    .where("user_id", "=", learner.userId)
    .where("course_id", "=", course.id)
    .execute();

  const before = Date.now();
  const extended = ok<Validity>(
    await admin.post(`${path(learner.userId, course.id)}/validity`, {
      kind: "extend",
      amount: 30,
      unit: "days",
      notify: false,
    }),
  );
  const until = Date.parse(extended.validUntil!);
  assert.ok(
    until >= before + 30 * DAY - 1000 && until <= Date.now() + 30 * DAY,
  );
  assert.equal(extended.status, "active");
});

test("a linked course keeps its extension when its parent is synced again or ends", async () => {
  const parent = await createCourse(flow);
  const linked = await createCourse(flow);
  await flow.database
    .insertInto("course_links")
    .values({
      course_id: parent.id,
      linked_course_id: linked.id,
      section_ids: null,
    })
    .execute();
  const learner = await signedUpLearner(flow, "linked");
  const parentEnd = new Date(Date.now() + 20 * DAY);
  ok(
    await admin.post("/v1/access/grants", {
      userId: learner.userId,
      courseId: parent.id,
      validUntil: parentEnd.toISOString(),
    }),
    201,
  );
  const before = await rows(learner.userId, linked.id);
  assert.equal(before.grant.source, "linked_course");
  assert.equal(
    before.grant.valid_until?.toISOString(),
    parentEnd.toISOString(),
  );

  const extended = ok<Validity>(
    await admin.post(`${path(learner.userId, linked.id)}/validity`, {
      kind: "extend",
      amount: 1,
      unit: "years",
      notify: false,
    }),
  );
  const expected = new Date(parentEnd);
  expected.setUTCFullYear(expected.getUTCFullYear() + 1);
  assert.equal(extended.validUntil, expected.toISOString());

  // Another sync (the parent's grant changes) keeps the longer end.
  ok(
    await admin.post("/v1/access/grants", {
      userId: learner.userId,
      courseId: parent.id,
      validUntil: new Date(Date.now() + 40 * DAY).toISOString(),
    }),
    201,
  );
  let after = await rows(learner.userId, linked.id);
  assert.equal(after.grant.valid_until?.toISOString(), expected.toISOString());
  assert.equal(after.grant.source, "linked_course");

  // The parent is taken away: the linked course stays open until its
  // extension ends.
  ok(await admin.delete(path(learner.userId, parent.id)));
  after = await rows(learner.userId, linked.id);
  assert.equal(after.grant.status, "active");
  assert.equal(after.enrollment.status, "active");
  assert.equal(
    after.enrollment.access_expires_at?.toISOString(),
    expected.toISOString(),
  );
});
