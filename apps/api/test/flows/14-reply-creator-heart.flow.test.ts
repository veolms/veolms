/**
 * The creator's heart on replies, as comments have it: course staff give it
 * to a visible reply under a public post, everyone sees who gave it, and
 * learners cannot give it.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  signedInAdmin,
  signedUpLearner,
  startFlowApp,
} from "./setup/flow-app.ts";
import { createCourse, enrollForFree } from "./setup/flow-courses.ts";

const flow = await startFlowApp();
const admin = await signedInAdmin(flow);
const course = await createCourse(flow, {
  title: "Heart Course",
  pricing: "free",
});
const learner = await signedUpLearner(flow, "hearts");
await enrollForFree(learner.client, course);
const lessonId = course.lessons[0]!.id;

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

interface Reply {
  id: string;
  creatorHeart?: { displayName: string } | null;
}

async function postWithReply(visibility: "public" | "unlisted") {
  const thread = ok<{ id: string }>(
    await learner.client.post(
      `/v1/courses/${course.id}/lessons/${lessonId}/threads`,
      {
        courseId: course.id,
        lessonId,
        kind: "comment",
        content: `A ${visibility} comment`,
        visibility,
      },
    ),
    201,
  );
  const reply = ok<{ id: string }>(
    await learner.client.post(`/v1/threads/${thread.id}/replies`, {
      content: "A reply",
    }),
    201,
  );
  return { threadId: thread.id, replyId: reply.id };
}

async function replies(threadId: string): Promise<Reply[]> {
  return ok<{ replies: Reply[] }>(
    await learner.client.get(`/v1/threads/${threadId}/replies`),
  ).replies;
}

const heart = (replyId: string) =>
  `/v1/courses/${course.id}/moderation/replies/${replyId}`;

test.after(async () => {
  await flow.close();
});

test("staff give a reply the creator's heart, and take it back", async () => {
  const { threadId, replyId } = await postWithReply("public");
  assert.equal((await replies(threadId))[0]?.creatorHeart ?? null, null);

  ok(await admin.post(heart(replyId), { action: "heart" }));
  const hearted = (await replies(threadId)).find((item) => item.id === replyId);
  assert.ok(hearted?.creatorHeart?.displayName, "who gave it is shown");

  ok(await admin.post(heart(replyId), { action: "unheart" }));
  const taken = (await replies(threadId)).find((item) => item.id === replyId);
  assert.equal(taken?.creatorHeart ?? null, null);
});

test("only a reply under a public post can be hearted, and only by staff", async () => {
  const unlisted = await postWithReply("unlisted");
  const refused = await admin.post(heart(unlisted.replyId), {
    action: "heart",
  });
  assert.equal(refused.status, 409);
  assert.equal(refused.body.error?.code, "REPLY_NOT_PUBLIC");

  const open = await postWithReply("public");
  const learnerTry = await learner.client.post(heart(open.replyId), {
    action: "heart",
  });
  assert.equal(learnerTry.status, 403);
});
