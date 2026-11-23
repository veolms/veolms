/**
 * Quiz draft and publish (owner, 23 Nov 2026): a quiz can be attached to
 * a lecture as a draft and published later, or switched back to draft;
 * and each course has one switch that keeps all its quizzes in draft. A
 * learner sees a quiz only when both are published. Staff always see
 * them.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  signedInAdmin,
  signedUpLearner,
  startFlowApp,
} from "./setup/flow-app.ts";
import type { FlowClient } from "./setup/flow-app.ts";
import { createCourse, enrollForFree } from "./setup/flow-courses.ts";
import type { FlowCourse } from "./setup/flow-courses.ts";

const flow = await startFlowApp();
const admin = await signedInAdmin(flow);

interface Quiz {
  id: string;
  status?: string;
  versions: { id: string; publishedAt: string | null }[];
}

async function freeCourseWithLearner() {
  const course = await createCourse(flow, {
    pricing: "free",
    lessons: [{ preview: true }, {}],
  });
  const { client } = await signedUpLearner(flow, "quizlearner");
  const enrolled = await enrollForFree(client, course);
  assert.equal(enrolled.status, 200, JSON.stringify(enrolled.body));
  return { course, learner: client };
}

async function newQuiz(title: string): Promise<Quiz> {
  const created = await admin.post<Quiz>("/v1/quizzes/complete", {
    title,
    questions: [
      {
        questionType: "single_choice",
        prompt: "2 + 2 = ?",
        points: 1,
        options: [
          { text: "4", isCorrect: true },
          { text: "5", isCorrect: false },
        ],
      },
    ],
  });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  return created.body.data!;
}

async function attach(course: FlowCourse, quizId: string, versionId: string) {
  const attached = await admin.post<{ id: string }>(
    `/v1/courses/${course.id}/lessons/${course.lessons[1]!.id}/quiz-assignment`,
    { quizVersionId: versionId },
  );
  assert.equal(attached.status, 201, JSON.stringify(attached.body));
  return attached.body.data!.id;
}

async function learnerSees(client: FlowClient, course: FlowCourse) {
  const list = await client.get<{ id: string }[]>(
    `/v1/courses/${course.id}/quiz-assignments`,
  );
  assert.equal(list.status, 200, JSON.stringify(list.body));
  const mine = await client.get<{
    assignments: { id: string; courseId: string }[];
  }>("/v1/me/quizzes");
  assert.equal(mine.status, 200, JSON.stringify(mine.body));
  return {
    onCourse: list.body.data!.map((row) => row.id),
    // Every free course's quizzes are listed too: only this course's count.
    inMyQuizzes: mine.body
      .data!.assignments.filter((row) => row.courseId === course.id)
      .map((row) => row.id),
  };
}

await test("a quiz attached as a draft is hidden from learners until it is published, and can be hidden again", async () => {
  const { course, learner } = await freeCourseWithLearner();
  const quiz = await newQuiz("Draft first");

  // "Attach as draft": the questions are frozen, the quiz stays hidden.
  const frozen = await admin.post<Quiz>(`/v1/quizzes/${quiz.id}/publish`, {
    visibility: "draft",
  });
  assert.equal(frozen.status, 200, JSON.stringify(frozen.body));
  assert.equal(frozen.body.data!.status, "draft");
  const version = frozen.body.data!.versions.find((v) => v.publishedAt);
  assert.ok(version, "the questions are frozen as a version");
  const assignmentId = await attach(course, quiz.id, version.id);

  let seen = await learnerSees(learner, course);
  assert.deepEqual(seen.onCourse, []);
  assert.deepEqual(seen.inMyQuizzes, []);
  const blocked = await learner.post(
    `/v1/quiz-assignments/${assignmentId}/attempts`,
    {},
  );
  assert.equal(blocked.status, 404, "a draft quiz can't be started");

  // Staff still see it.
  const staffList = await admin.get<{ id: string }[]>(
    `/v1/courses/${course.id}/quiz-assignments`,
  );
  assert.deepEqual(
    staffList.body.data!.map((row) => row.id),
    [assignmentId],
  );

  // Published: learners see it and can start it.
  const published = await admin.patch<Quiz>(`/v1/quizzes/${quiz.id}/status`, {
    status: "published",
  });
  assert.equal(published.status, 200, JSON.stringify(published.body));
  assert.equal(published.body.data!.status, "published");
  seen = await learnerSees(learner, course);
  assert.deepEqual(seen.onCourse, [assignmentId]);
  assert.deepEqual(seen.inMyQuizzes, [assignmentId]);
  const started = await learner.post(
    `/v1/quiz-assignments/${assignmentId}/attempts`,
    {},
  );
  assert.ok(
    started.status === 200 || started.status === 201,
    JSON.stringify(started.body),
  );

  // Back to draft: hidden again.
  const hidden = await admin.patch<Quiz>(`/v1/quizzes/${quiz.id}/status`, {
    status: "draft",
  });
  assert.equal(hidden.body.data!.status, "draft");
  seen = await learnerSees(learner, course);
  assert.deepEqual(seen.onCourse, []);
  assert.deepEqual(seen.inMyQuizzes, []);
});

await test("publishing a quiz whose questions were never frozen freezes them first", async () => {
  const quiz = await newQuiz("Straight to published");
  assert.equal(quiz.status, "draft", "a new quiz starts as a draft");
  const published = await admin.patch<Quiz>(`/v1/quizzes/${quiz.id}/status`, {
    status: "published",
  });
  assert.equal(published.status, 200, JSON.stringify(published.body));
  assert.equal(published.body.data!.status, "published");
  assert.ok(published.body.data!.versions.some((v) => v.publishedAt));
});

await test("a course's quizzes switch keeps every quiz of the course hidden, published or not", async () => {
  const { course, learner } = await freeCourseWithLearner();
  const quiz = await newQuiz("Course switch");
  const published = await admin.post<Quiz>(`/v1/quizzes/${quiz.id}/publish`);
  const version = published.body.data!.versions.find((v) => v.publishedAt)!;
  const assignmentId = await attach(course, quiz.id, version.id);
  assert.deepEqual((await learnerSees(learner, course)).onCourse, [
    assignmentId,
  ]);

  const off = await admin.put<{ quizzesPublished?: boolean }>(
    `/v1/courses/${course.id}/settings`,
    { quizzesPublished: false },
  );
  assert.equal(off.status, 200, JSON.stringify(off.body));
  assert.equal(off.body.data!.quizzesPublished, false);
  const seen = await learnerSees(learner, course);
  assert.deepEqual(seen.onCourse, []);
  assert.deepEqual(seen.inMyQuizzes, []);
  const blocked = await learner.post(
    `/v1/quiz-assignments/${assignmentId}/attempts`,
    {},
  );
  assert.equal(blocked.status, 404);

  // Other settings saved later leave the switch as it is.
  await admin.put(`/v1/courses/${course.id}/settings`, { allowQa: true });
  assert.deepEqual((await learnerSees(learner, course)).onCourse, []);

  const on = await admin.put<{ quizzesPublished?: boolean }>(
    `/v1/courses/${course.id}/settings`,
    { quizzesPublished: true },
  );
  assert.equal(on.body.data!.quizzesPublished, true);
  assert.deepEqual((await learnerSees(learner, course)).onCourse, [
    assignmentId,
  ]);
});

await test("a learner cannot change a quiz's visibility", async () => {
  const { learner } = await freeCourseWithLearner();
  const quiz = await newQuiz("Not yours");
  const tried = await learner.patch(`/v1/quizzes/${quiz.id}/status`, {
    status: "published",
  });
  assert.equal(tried.status, 403);
});

await flow.close();
