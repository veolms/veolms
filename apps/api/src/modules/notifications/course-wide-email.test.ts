import assert from "node:assert/strict";
import { test } from "node:test";

import { createNotificationIntents } from "./notifications.handlers.ts";

const learners = [
  "3f2a9c1e-8b7d-4e6f-a5c4-1b2d3e4f5a6b",
  "0b6d3a3c-58f3-4a8f-8d3e-3b0f6c1a2b3c",
];
const coursePublished = {
  courseId: "7f0c2a4e-1d1b-4c55-9f7e-2a9b3c4d5e6f",
  courseSlug: "the-complete-javascript-course",
  courseTitle: "The Complete JavaScript Course",
  creatorUserId: "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d",
};
const listActiveCourseRecipientUserIds = async () => learners;

await test("a published course is emailed to its learners by default", async () => {
  const intents = await createNotificationIntents(
    "course.published",
    coursePublished,
    { listActiveCourseRecipientUserIds },
  );
  assert.equal(intents.length, learners.length);
  for (const intent of intents) {
    assert.deepEqual(intent.channels, ["in_app", "email"]);
  }
});

await test("with course-wide email off, a published course stays in-app", async () => {
  const intents = await createNotificationIntents(
    "course.published",
    coursePublished,
    { listActiveCourseRecipientUserIds, courseWideEmail: false },
  );
  assert.equal(intents.length, learners.length);
  for (const intent of intents) {
    assert.deepEqual(intent.channels, ["in_app"]);
  }
});

await test("with course-wide email off, a single learner's email still goes out", async () => {
  const [intent] = await createNotificationIntents(
    "payment.completed",
    {
      paymentId: "0b6d3a3c-58f3-4a8f-8d3e-3b0f6c1a2b3c",
      orderId: "7f0c2a4e-1d1b-4c55-9f7e-2a9b3c4d5e6f",
      orderNumber: "ORD-20261018-AB12CD",
      recipientUserId: learners[0],
      totalAmount: 799,
      currency: "INR",
      itemTitles: ["The Complete JavaScript Course"],
    },
    { listActiveCourseRecipientUserIds, courseWideEmail: false },
  );
  assert.deepEqual(intent?.channels, ["in_app", "email"]);
});
