import assert from "node:assert/strict";
import { test } from "node:test";

import { createNotificationIntents } from "./notifications.handlers.ts";

// Owner, 22 Nov 2026: learners hear about a course being published only
// when the admin asks (the publish popup's box, or "Send notification"),
// and about its quizzes only when the course's admin turned that on.

const learners = [
  "3f2a9c1e-8b7d-4e6f-a5c4-1b2d3e4f5a6b",
  "0b6d3a3c-58f3-4a8f-8d3e-3b0f6c1a2b3c",
];
const courseId = "7f0c2a4e-1d1b-4c55-9f7e-2a9b3c4d5e6f";
const listActiveCourseRecipientUserIds = async () => learners;
const coursePublished = {
  courseId,
  courseSlug: "the-complete-javascript-course",
  courseTitle: "The Complete JavaScript Course",
  creatorUserId: "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d",
};
const quizAssigned = {
  courseId,
  courseTitle: "The Complete JavaScript Course",
  courseSlug: "the-complete-javascript-course",
  quizId: "1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f",
  quizTitle: "Closures",
  lessonId: "2d3e4f5a-6b7c-4d8e-9f0a-1b2c3d4e5f6a",
  lessonTitle: "Closures explained",
  deepLink: "/learn/the-complete-javascript-course?view=quiz",
};
const quizPassed = {
  recipientUserId: learners[0],
  courseId,
  courseTitle: "The Complete JavaScript Course",
  courseSlug: "the-complete-javascript-course",
  quizId: "1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f",
  quizTitle: "Closures",
  score: 8,
  maxScore: 10,
  scorePercentage: 80,
  deepLink: "/learn/the-complete-javascript-course?view=quiz",
};

await test("publishing tells no learner unless the admin asks", async () => {
  const intents = await createNotificationIntents(
    "course.published",
    coursePublished,
    { listActiveCourseRecipientUserIds },
  );
  assert.equal(intents.length, 0);
});

await test("publishing with the box ticked tells every learner", async () => {
  const intents = await createNotificationIntents(
    "course.published",
    { ...coursePublished, notifyLearners: true },
    { listActiveCourseRecipientUserIds },
  );
  assert.equal(intents.length, learners.length);
});

await test("a new quiz tells no learner while the course has quiz notifications off", async () => {
  const off = await createNotificationIntents("quiz.assigned", quizAssigned, {
    listActiveCourseRecipientUserIds,
    quizNotificationsEnabled: async () => false,
  });
  const unknown = await createNotificationIntents(
    "quiz.assigned",
    quizAssigned,
    { listActiveCourseRecipientUserIds },
  );
  assert.equal(off.length, 0);
  assert.equal(unknown.length, 0);
});

await test("a new quiz tells every learner when the course has them on", async () => {
  const intents = await createNotificationIntents(
    "quiz.assigned",
    quizAssigned,
    {
      listActiveCourseRecipientUserIds,
      quizNotificationsEnabled: async (id) => id === courseId,
    },
  );
  assert.equal(intents.length, learners.length);
});

await test("a quiz result follows the course's choice too", async () => {
  const off = await createNotificationIntents(
    "quiz.attempt.passed",
    quizPassed,
    {
      listActiveCourseRecipientUserIds,
      quizNotificationsEnabled: async () => false,
    },
  );
  const on = await createNotificationIntents(
    "quiz.attempt.passed",
    quizPassed,
    {
      listActiveCourseRecipientUserIds,
      quizNotificationsEnabled: async () => true,
    },
  );
  assert.equal(off.length, 0);
  assert.equal(on.length, 1);
});
