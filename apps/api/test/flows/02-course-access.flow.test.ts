/**
 * Who can watch which lesson: visitors, learners who have not bought a
 * course, learners who enrolled, staff grants and their revocation, and
 * courses that are drafts or archived. The lock is checked where it is
 * enforced, the playback request the player makes, and against what the
 * course page shows, which must agree with it.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  signedInAdmin,
  signedUpLearner,
  startFlowApp,
} from "./setup/flow-app.ts";
import {
  courseAccess,
  createCourse,
  enrollForFree,
  myCourseIds,
  play,
} from "./setup/flow-courses.ts";

const flow = await startFlowApp();
const admin = await signedInAdmin(flow);

// Lesson 1 is a free preview; lessons 2 and 3 are locked.
const paidCourse = () => createCourse(flow, { pricing: "paid" });

await test("a visitor watches a paid course's preview lesson and is asked to sign in for the rest", async () => {
  const course = await paidCourse();
  const visitor = flow.visitor();

  const { access } = await courseAccess(visitor, course);
  assert.equal(access?.viewer, "guest");
  assert.equal(access?.access, "limited");
  assert.equal(access?.lockedLessonsNeed, "sign-in");

  const preview = await play(visitor, course, 1);
  assert.equal(preview.status, 200);
  assert.equal(preview.body.data?.lessonId, course.lessons[0]!.id);

  const locked = await play(visitor, course, 2);
  assert.equal(locked.status, 401);
  assert.equal(locked.body.data, undefined, "no video link is handed out");
});

await test("a learner who has not bought a paid course is refused its locked lessons, and told to buy it", async () => {
  const course = await paidCourse();
  const { client } = await signedUpLearner(flow);

  const { access } = await courseAccess(client, course);
  assert.equal(access?.access, "limited");
  assert.equal(access?.lockedLessonsNeed, "purchase");
  assert.equal(access?.enrolled, false);

  assert.equal((await play(client, course, 1)).status, 200);
  for (const lesson of [2, 3]) {
    const locked = await play(client, course, lesson);
    assert.equal(locked.status, 403);
    assert.equal(locked.body.error?.code, "COURSE_ACCESS_DENIED");
  }
  const token = await client.get(
    `/v1/courses/${course.slug}/lessons/2/playback-token`,
  );
  assert.equal(token.status, 403, "nor is a new segment token");
});

await test("a lesson that does not exist is not found, rather than played from another lesson", async () => {
  const course = await paidCourse();
  const { client } = await signedUpLearner(flow);
  assert.equal((await play(client, course, 99)).status, 404);
  assert.equal(
    (
      await client.get(
        `/v1/courses/no-such-course-${course.id}/lessons/1/playback-bootstrap`,
      )
    ).status,
    404,
  );
});

await test("a learner enrolls in a free course: it is in My Courses and every lesson plays", async () => {
  const course = await createCourse(flow, { pricing: "free" });
  const { client } = await signedUpLearner(flow);

  const order = await enrollForFree(client, course);
  assert.equal(order.status, 200);
  assert.equal(order.body.data?.order.status, "paid");
  assert.equal(order.body.data?.gateway, null, "nothing to pay");

  const { access } = await courseAccess(client, course);
  assert.equal(access?.enrolled, true);
  assert.equal(access?.access, "full");
  assert.equal(access?.lockedLessonsNeed, null);
  assert.ok((await myCourseIds(client)).includes(course.id));
  for (const lesson of [1, 2, 3]) {
    assert.equal((await play(client, course, lesson)).status, 200);
  }
});

await test("a visitor watches only the first lesson of a free course, and signs in for the rest", async () => {
  const course = await createCourse(flow, {
    pricing: "free",
    lessons: [{}, {}, {}],
  });
  const visitor = flow.visitor();

  const { access } = await courseAccess(visitor, course);
  assert.equal(access?.firstLessonOpen, true);
  assert.equal(access?.lockedLessonsNeed, "sign-in");
  assert.equal((await play(visitor, course, 1)).status, 200);
  assert.equal((await play(visitor, course, 2)).status, 401);
});

await test("a free course closed to self-enrolment cannot be joined, and stays locked until staff grant it", async () => {
  const course = await createCourse(flow, {
    pricing: "free",
    access: "restricted",
    lessons: [{}, {}],
  });
  const { client } = await signedUpLearner(flow);

  const { access } = await courseAccess(client, course);
  assert.equal(access?.canSelfEnroll, false);
  assert.equal(access?.lockedLessonsNeed, "grant");

  const order = await enrollForFree(client, course);
  assert.equal(order.status, 403);
  assert.equal(order.body.error?.code, "COURSE_ACCESS_RESTRICTED");
  assert.equal((await play(client, course, 2)).status, 403);
  assert.ok(!(await myCourseIds(client)).includes(course.id));
});

await test("a learner given access by staff watches every lesson; when it is revoked they are locked out again", async () => {
  const course = await paidCourse();
  const { client, userId } = await signedUpLearner(flow);

  const grant = await admin.post("/v1/access/grants", {
    userId,
    courseId: course.id,
  });
  assert.equal(grant.status, 201);
  assert.equal((await play(client, course, 2)).status, 200);
  assert.equal((await courseAccess(client, course)).access?.access, "full");

  const revoke = await admin.delete(
    `/v1/access/users/${userId}/courses/${course.id}`,
  );
  assert.equal(revoke.status, 200);
  assert.equal((await play(client, course, 2)).status, 403);
  assert.equal((await courseAccess(client, course)).access?.access, "limited");

  const restore = await admin.post(
    `/v1/access/users/${userId}/courses/${course.id}/restore`,
  );
  assert.equal(restore.status, 200);
  assert.equal((await play(client, course, 2)).status, 200);
});

await test("access granted until a date that has passed no longer plays", async () => {
  const course = await paidCourse();
  const { client, userId } = await signedUpLearner(flow);
  const grant = await admin.post("/v1/access/grants", {
    userId,
    courseId: course.id,
    validUntil: new Date(Date.now() + 60 * 60_000).toISOString(),
  });
  assert.equal(grant.status, 201);
  assert.equal((await play(client, course, 2)).status, 200);

  // The hour runs out.
  await flow.database
    .updateTable("access_grants")
    .set({ valid_until: new Date(Date.now() - 1_000) })
    .where("user_id", "=", userId)
    .where("course_id", "=", course.id)
    .execute();

  assert.equal((await play(client, course, 2)).status, 403);
});

await test("a draft course is shown to no learner and plays for nobody but staff", async () => {
  const course = await createCourse(flow, { status: "draft" });
  const { client } = await signedUpLearner(flow);

  assert.equal((await courseAccess(client, course)).status, 404);
  assert.equal(
    (await play(client, course, 1)).status,
    404,
    "not even its preview",
  );
  assert.equal((await play(flow.visitor(), course, 1)).status, 404);
  assert.equal((await play(admin, course, 2)).status, 200);
});

await test("an archived course keeps playing for the learners who have it, and is closed to everyone else", async () => {
  const course = await paidCourse();
  const { client: owner, userId } = await signedUpLearner(flow);
  await admin.post("/v1/access/grants", { userId, courseId: course.id });
  const { client: stranger } = await signedUpLearner(flow);

  const archive = await admin.post(`/v1/courses/${course.id}/archive`);
  assert.equal(archive.status, 200);

  assert.equal((await play(owner, course, 2)).status, 200);
  assert.equal(
    (await play(stranger, course, 1)).status,
    404,
    "not even its preview",
  );
  assert.equal((await courseAccess(stranger, course)).status, 404);
  const order = await stranger.post("/v1/checkout/orders", {
    items: [{ itemType: "course", courseId: course.id }],
  });
  assert.equal(order.status, 409);
  assert.equal(order.body.error?.code, "COURSE_NOT_AVAILABLE");
});

await test("an unpublished lesson is skipped: lesson numbers count only what learners are shown", async () => {
  const course = await createCourse(flow, {
    pricing: "free",
    lessons: [{}, { published: false }, {}],
  });
  const { client } = await signedUpLearner(flow);
  await enrollForFree(client, course);

  const second = await play(client, course, 2);
  assert.equal(second.status, 200);
  assert.equal(
    second.body.data?.lessonId,
    course.lessons[2]!.id,
    "lesson 2 is the third one written, the second one published",
  );
  assert.equal((await play(client, course, 3)).status, 404);
});

await test("a video still being prepared answers 'not ready' to a learner who has the course, and 'no access' to one who does not", async () => {
  const course = await createCourse(flow, {
    pricing: "paid",
    lessons: [{ preview: true }, { video: "processing" }],
  });
  const { client: buyer, userId } = await signedUpLearner(flow);
  await admin.post("/v1/access/grants", { userId, courseId: course.id });
  const { client: stranger } = await signedUpLearner(flow);

  const notReady = await play(buyer, course, 2);
  assert.equal(notReady.status, 409);
  assert.equal(notReady.body.error?.code, "MEDIA_NOT_READY");
  assert.equal((await play(stranger, course, 2)).status, 403);
});

await test("the video link handed to a learner is for that lesson's own video, with a segment token", async () => {
  const course = await createCourse(flow, { pricing: "free" });
  const { client } = await signedUpLearner(flow);
  await enrollForFree(client, course);

  for (const [index, lesson] of course.lessons.entries()) {
    const bootstrap = await play(client, course, index + 1);
    assert.equal(bootstrap.status, 200);
    assert.equal(bootstrap.body.data?.lessonId, lesson.id);
    assert.ok(
      bootstrap.body.data?.manifestUrl.includes(lesson.mediaId!),
      `lesson ${index + 1} plays its own video`,
    );
    assert.ok(
      bootstrap.body.data?.segmentToken,
      "protected segments need a token",
    );
  }
});

await test("a learner leaves a free course: it leaves My Courses", async () => {
  const course = await createCourse(flow, { pricing: "free" });
  const { client } = await signedUpLearner(flow);
  await enrollForFree(client, course);
  assert.ok((await myCourseIds(client)).includes(course.id));

  const leave = await client.delete(`/v1/enrollments/courses/${course.id}`);
  assert.equal(leave.status, 200);

  assert.ok(!(await myCourseIds(client)).includes(course.id));
  assert.equal((await courseAccess(client, course)).access?.enrolled, false);
});

await test("one learner's enrolment opens nothing for another learner", async () => {
  const course = await paidCourse();
  const { userId } = await signedUpLearner(flow);
  await admin.post("/v1/access/grants", { userId, courseId: course.id });
  const { client: other } = await signedUpLearner(flow);

  assert.equal((await play(other, course, 2)).status, 403);
  assert.equal((await courseAccess(other, course)).access?.access, "limited");
});

await flow.close();
