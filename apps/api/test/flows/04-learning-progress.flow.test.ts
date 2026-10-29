/**
 * What the player reports while a learner watches, and what comes back:
 * lessons completed, the course's progress, and where to carry on, on this
 * device or another.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { signedUpLearner, startFlowApp } from "./setup/flow-app.ts";
import type { FlowClient } from "./setup/flow-app.ts";
import {
  courseAccess,
  createCourse,
  enrollForFree,
  play,
} from "./setup/flow-courses.ts";
import type { FlowCourse } from "./setup/flow-courses.ts";

const flow = await startFlowApp();

interface ProgressItem {
  lessonId: string;
  progressPercent: number;
  positionSeconds?: number;
}

/** The player's periodic progress report. */
function report(
  client: FlowClient,
  course: FlowCourse,
  items: ProgressItem[],
  watchedSeconds = 30,
) {
  return client.post(`/v1/learning-progress/${course.slug}/batch`, {
    items,
    watchedSeconds,
    timeZone: "Asia/Kolkata",
  });
}

async function progressOf(client: FlowClient, course: FlowCourse) {
  const response = await client.get<{
    lessons: {
      lessonId: string;
      lessonNumber: number;
      progressPercent: number;
    }[];
    lastPlayed?: { lessonNumber: number; positionSeconds: number } | null;
  }>(`/v1/learning-progress/${course.slug}`);
  assert.equal(response.status, 200);
  return response.body.data!;
}

async function enrolledLearner(course: FlowCourse) {
  const learner = await signedUpLearner(flow);
  const order = await enrollForFree(learner.client, course);
  assert.equal(order.status, 200);
  return learner;
}

await test("a learner who has not started is shown no progress and is pointed at lesson 1", async () => {
  const course = await createCourse(flow, { pricing: "free" });
  const { client } = await enrolledLearner(course);

  const { access } = await courseAccess(client, course);
  assert.equal(access?.progress?.percent, 0);
  assert.equal(access?.progress?.started, false);
  assert.equal(access?.resume?.completedLessons, 0);
  assert.equal(access?.resume?.totalLessons, 3);
  assert.equal(access?.resume?.resumeLesson?.lessonNumber, 1);
});

await test("watching a lesson to the end marks it complete, and the course's progress moves", async () => {
  const course = await createCourse(flow, { pricing: "free" });
  const { client } = await enrolledLearner(course);

  const saved = await report(client, course, [
    {
      lessonId: course.lessons[0]!.id,
      progressPercent: 100,
      positionSeconds: 600,
    },
  ]);
  assert.equal(saved.status, 200);

  const progress = await progressOf(client, course);
  const first = progress.lessons.find(
    (l) => l.lessonId === course.lessons[0]!.id,
  );
  assert.equal(first?.progressPercent, 100);
  assert.equal(first?.lessonNumber, 1);

  const { access } = await courseAccess(client, course);
  assert.equal(access?.progress?.started, true);
  assert.equal(access?.resume?.completedLessons, 1);
  assert.ok((access?.progress?.percent ?? 0) > 0, "the course is part done");
  assert.ok((access?.progress?.percent ?? 100) < 100, "but not finished");
  assert.equal(
    access?.resume?.resumeLesson?.lessonNumber,
    2,
    "the next lesson is the one to carry on with",
  );
});

await test("a lesson part watched is not complete", async () => {
  const course = await createCourse(flow, { pricing: "free" });
  const { client } = await enrolledLearner(course);

  await report(client, course, [
    {
      lessonId: course.lessons[0]!.id,
      progressPercent: 60,
      positionSeconds: 360,
    },
  ]);

  const { access } = await courseAccess(client, course);
  assert.equal(access?.resume?.completedLessons, 0);
  assert.equal(access?.resume?.resumeLesson?.lessonNumber, 1);
});

await test("progress never goes backwards when an older report arrives late", async () => {
  const course = await createCourse(flow, { pricing: "free" });
  const { client } = await enrolledLearner(course);
  const lessonId = course.lessons[0]!.id;

  await report(client, course, [
    { lessonId, progressPercent: 100, positionSeconds: 600 },
  ]);
  // Rewatching the start, or a report from another tab sent earlier.
  await report(client, course, [
    { lessonId, progressPercent: 20, positionSeconds: 120 },
  ]);

  const progress = await progressOf(client, course);
  assert.equal(
    progress.lessons.find((l) => l.lessonId === lessonId)?.progressPercent,
    100,
  );
});

await test("finishing every lesson finishes the course", async () => {
  const course = await createCourse(flow, { pricing: "free" });
  const { client } = await enrolledLearner(course);

  await report(
    client,
    course,
    course.lessons.map((lesson) => ({
      lessonId: lesson.id,
      progressPercent: 100,
      positionSeconds: 600,
    })),
  );

  const { access } = await courseAccess(client, course);
  assert.equal(access?.progress?.percent, 100);
  assert.equal(access?.resume?.completedLessons, 3);
});

await test("the player resumes where the learner stopped, on another device too", async () => {
  const course = await createCourse(flow, { pricing: "free" });
  const { client, learner } = await enrolledLearner(course);

  await report(client, course, [
    {
      lessonId: course.lessons[1]!.id,
      progressPercent: 40,
      positionSeconds: 245,
    },
  ]);

  const laptop = flow.visitor();
  assert.equal((await laptop.signIn(learner.email)).status, 200);
  const bootstrap = await play(laptop, course, 2, "?resume=1");
  assert.equal(bootstrap.status, 200);
  assert.equal(bootstrap.body.data?.resumePosition?.seconds, 245);

  const progress = await progressOf(laptop, course);
  assert.equal(progress.lastPlayed?.lessonNumber, 2);
  assert.equal(progress.lastPlayed?.positionSeconds, 245);
});

await test("one learner's progress is never shown to another", async () => {
  const course = await createCourse(flow, { pricing: "free" });
  const { client: first } = await enrolledLearner(course);
  const { client: second } = await enrolledLearner(course);

  await report(first, course, [
    {
      lessonId: course.lessons[0]!.id,
      progressPercent: 100,
      positionSeconds: 600,
    },
  ]);

  const theirs = await progressOf(second, course);
  assert.equal(theirs.lessons.length, 0);
  assert.equal(
    (await courseAccess(second, course)).access?.progress?.started,
    false,
  );
});

await test("progress cannot be saved on a paid course the learner has not bought", async () => {
  const course = await createCourse(flow, { pricing: "paid" });
  const { client } = await signedUpLearner(flow);

  const saved = await report(client, course, [
    {
      lessonId: course.lessons[1]!.id,
      progressPercent: 100,
      positionSeconds: 600,
    },
  ]);

  assert.equal(saved.status, 403);
});

await test("a visitor who is not signed in cannot save progress", async () => {
  const course = await createCourse(flow, { pricing: "free" });
  const saved = await report(flow.visitor(), course, [
    { lessonId: course.lessons[0]!.id, progressPercent: 100 },
  ]);
  assert.equal(saved.status, 401);
});

await flow.close();
