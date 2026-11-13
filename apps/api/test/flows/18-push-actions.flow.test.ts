/**
 * "Reply" and "Mark as read" from a chat notification on the phone, through
 * the real API and notification worker: a chat push to a phone carries a
 * single-use token; the app's native code replies or marks the chat read
 * with it (never with the session cookie); a reply hands back the next
 * token; a retry is not sent twice; a used, superseded or stale token, a
 * signed-out login and a missing header are refused; a chat read elsewhere
 * stops the token and clears the phone with a silent push. Only Firebase
 * is a stand-in (fake-phone-push.ts).
 */
// First: the environment, before the API's config is read below.
import { fakeFcm, FLOW_PHONE_APP_ID } from "./setup/fake-phone-push.ts";
import "./setup/flow-env.ts";

import assert from "node:assert/strict";
import crypto from "node:crypto";
import { test } from "node:test";

import { sql } from "kysely";

import { config } from "../../src/config.ts";
import { createSessionService } from "../../src/modules/auth/index.ts";
import { createChatPushSource } from "../../src/modules/chat/index.ts";
import { getChatRuntime } from "../../src/modules/chat/shared/chat.runtime.ts";
import {
  createNotificationProcessor,
  createPushPipeline,
} from "../../src/modules/notifications/index.ts";
import {
  signedInAdmin,
  signedUpLearner,
  startFlowApp,
  type FlowClient,
} from "./setup/flow-app.ts";
import { createCourse, enrollForFree } from "./setup/flow-courses.ts";
import { FLOW_ADMIN } from "./setup/flow-fixtures.ts";

const flow = await startFlowApp();
const quiet = {
  level: "silent",
  fatal() {},
  error() {},
  warn() {},
  info() {},
  debug() {},
  trace() {},
  silent() {},
  child() {
    return quiet;
  },
} as never;

const worker = createNotificationProcessor({
  database: flow.database,
  email: flow.email,
  logger: quiet,
  config,
  push: createPushPipeline({
    database: flow.database,
    logger: quiet,
    config,
    sessions: createSessionService({ database: flow.database }),
    fcm: fakeFcm,
  }),
  chat: createChatPushSource({
    database: flow.database,
    groupMaxMembers: config.CHAT_PUSH_GROUP_MAX_MEMBERS,
  }),
  handlers: { listActiveCourseRecipientUserIds: async () => [] },
  recipients: { findRecipient: async (id) => ({ id, email: null }) },
});

// See 16-web-push: earlier files' codes are moved a day back.
await sql`
  update otp_codes set created_at = created_at - interval '25 hours'
  where identifier = ${FLOW_ADMIN.email}
`.execute(flow.database);
const admin = await signedInAdmin(flow);

async function runWorker() {
  for (let round = 0; round < 50; round += 1) {
    const result = await worker.process();
    if (result.outbox.processed === 0 && (result.push?.sent ?? 0) === 0) return;
  }
}
/** The batched read positions, written now (the batcher does it each second). */
async function flushReads() {
  await getChatRuntime(flow.app, flow.database).receipts.flush();
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

const course = await createCourse(flow, {
  title: "Push Actions Course",
  pricing: "free",
});
const sender = await signedUpLearner(flow, "patsender");
const reader = await signedUpLearner(flow, "patreader");
for (const learner of [sender, reader])
  await enrollForFree(learner.client, course);

let roomId = "";
const phoneFid = `flowphone${crypto.randomBytes(8).toString("hex")}`;

async function send(client: FlowClient, body: string) {
  return ok<{ message: { seq: number } }>(
    await client.post(`/v1/chat/rooms/${roomId}/messages`, {
      clientId: crypto.randomUUID(),
      body,
    }),
    201,
  ).message;
}

/** The reader's phone gets the sender's new message; its token. */
async function pushedToken(body: string) {
  const before = fakeFcm.pushesFor(phoneFid).length;
  const message = await send(sender.client, body);
  await runWorker();
  const pushes = fakeFcm.pushesFor(phoneFid).slice(before);
  const push = pushes.find((p) => p.data.seq === String(message.seq));
  assert.ok(push, "the phone got the chat push");
  const token = push.data.actionToken;
  assert.ok(token && token.startsWith("pat_"), "with a token");
  assert.ok(push.data.actionTokenExpiresAt);
  return { token, seq: message.seq };
}

/** A request as the app's native code makes it: no cookies, the token. */
function native(path: string, token: string | null, payload: unknown = {}) {
  // `never`: each test names the answer it expects (ok<T>).
  return flow
    .visitor()
    .request<never>(
      "POST",
      path,
      payload,
      token ? { authorization: `PushAction ${token}` } : {},
    );
}

await test("a chat push to a phone carries a token; a reply sends it as the user", async () => {
  roomId = ok<{ room: { id: string } }>(
    await admin.post(`/v1/chat/courses/${course.id}/room`),
  ).room.id;
  ok(
    await admin.patch(`/v1/chat/rooms/${roomId}/settings`, {
      postingPolicy: "everyone",
    }),
  );
  for (const learner of [sender, reader])
    ok(await learner.client.get("/v1/chat/rooms"));
  ok(
    await reader.client.put("/v1/me/push-devices", {
      fid: phoneFid,
      applicationId: FLOW_PHONE_APP_ID,
      platform: "android",
      pushAllowed: true,
    }),
  );

  const { token } = await pushedToken("Anyone up for a study call?");
  const clientId = crypto.randomUUID();
  const sent = ok<{
    message: { seq: number; sentAt: string };
    nextToken: string;
    nextTokenExpiresAt: string;
  }>(
    await native("/v1/push-actions/chat/reply", token, {
      clientId,
      body: "On my way",
    }),
    201,
  );
  assert.ok(sent.nextToken.startsWith("pat_"));
  assert.notEqual(sent.nextToken, token);

  // In the chat, from the reader.
  const listed = ok<{
    messages: { seq: number; body: string; sender: { id: string } | null }[];
  }>(await sender.client.get(`/v1/chat/rooms/${roomId}/messages`));
  const reply = listed.messages.find((m) => m.seq === sent.message.seq);
  assert.equal(reply?.body, "On my way");
  assert.equal(reply?.sender?.id, reader.userId);

  // The phone lost the answer and sends again: the same message, a fresh
  // token; the one it never received stops working.
  const again = ok<{ message: { seq: number }; nextToken: string }>(
    await native("/v1/push-actions/chat/reply", token, {
      clientId,
      body: "On my way",
    }),
  );
  assert.equal(again.message.seq, sent.message.seq, "not sent twice");
  const lost = await native("/v1/push-actions/chat/reply", sent.nextToken, {
    clientId: crypto.randomUUID(),
    body: "Hello?",
  });
  assert.equal(lost.status, 401);
  assert.equal(lost.body.error?.code, "PUSH_ACTION_INVALID");

  // The used token, for another message: refused.
  const reused = await native("/v1/push-actions/chat/reply", token, {
    clientId: crypto.randomUUID(),
    body: "Second try",
  });
  assert.equal(reused.status, 401);
  assert.equal(reused.body.error?.code, "PUSH_ACTION_INVALID");

  // The rotated token replies once more.
  ok(
    await native("/v1/push-actions/chat/reply", again.nextToken, {
      clientId: crypto.randomUUID(),
      body: "Five minutes",
    }),
    201,
  );
});

await test("without the token header, or with only the session cookie, nothing is sent", async () => {
  const { token } = await pushedToken("Cookie check");
  const none = await native("/v1/push-actions/chat/reply", null, {
    clientId: crypto.randomUUID(),
    body: "No header",
  });
  assert.equal(none.status, 401);
  const wrongScheme = await flow
    .visitor()
    .request(
      "POST",
      "/v1/push-actions/chat/reply",
      { clientId: crypto.randomUUID(), body: "Bearer" },
      { authorization: `Bearer ${token}` },
    );
  assert.equal(wrongScheme.status, 401);
  const cookieOnly = await reader.client.post("/v1/push-actions/chat/reply", {
    clientId: crypto.randomUUID(),
    body: "Cookie",
  });
  assert.equal(cookieOnly.status, 401, "the session cookie is not read");
  // The token itself still works.
  ok(
    await native("/v1/push-actions/chat/reply", token, {
      clientId: crypto.randomUUID(),
      body: "Token works",
    }),
    201,
  );
});

await test("a newer push replaces the older token; mark as read spends it", async () => {
  const older = await pushedToken("First of two");
  const newer = await pushedToken("Second of two");
  const superseded = await native("/v1/push-actions/chat/read", older.token);
  assert.equal(superseded.status, 401);

  const read = ok<{ readSeq: number }>(
    await native("/v1/push-actions/chat/read", newer.token),
  );
  assert.equal(read.readSeq, newer.seq);
  await flushReads();
  const member = await flow.database
    .selectFrom("chat_members")
    .select("last_read_seq")
    .where("room_id", "=", roomId)
    .where("user_id", "=", reader.userId)
    .executeTakeFirstOrThrow();
  assert.ok(Number(member.last_read_seq) >= newer.seq, "the chat is read");
  const twice = await native("/v1/push-actions/chat/read", newer.token);
  assert.equal(twice.status, 401);
});

await test("read elsewhere: the token stops, and the phone gets a silent 'chat read'", async () => {
  const { token, seq } = await pushedToken("Read me on the laptop");
  ok(
    await reader.client.post("/v1/chat/receipts", {
      receipts: [{ roomId, readSeq: seq }],
    }),
  );
  await flushReads();
  const before = fakeFcm.pushesFor(phoneFid).length;
  await runWorker();
  const silent = fakeFcm
    .pushesFor(phoneFid)
    .slice(before)
    .find((p) => p.data.kind === "chat_read");
  assert.ok(silent, "a silent push to the phone");
  assert.equal(silent.data.roomId, roomId);
  assert.equal(silent.data.readSeq, String(seq));
  assert.equal(silent.android?.notification, undefined, "data-only");
  assert.equal(silent.android?.priority, "NORMAL");

  const refused = await native("/v1/push-actions/chat/reply", token, {
    clientId: crypto.randomUUID(),
    body: "Too late",
  });
  assert.equal(refused.status, 401);
});

await test("read since the push, even before the clean-up ran: 409", async () => {
  const { token, seq } = await pushedToken("Stale check");
  // As if read on another server whose clean-up has not run yet.
  await flow.database
    .updateTable("chat_members")
    .set({ last_read_seq: seq })
    .where("room_id", "=", roomId)
    .where("user_id", "=", reader.userId)
    .execute();
  const stale = await native("/v1/push-actions/chat/reply", token, {
    clientId: crypto.randomUUID(),
    body: "Stale",
  });
  assert.equal(stale.status, 409, JSON.stringify(stale.body.error));
  assert.equal(stale.body.error?.code, "PUSH_ACTION_STALE");
});

await test("after sign-out the token is refused: sign in to reply", async () => {
  const { token } = await pushedToken("Before sign-out");
  ok(await reader.client.post("/v1/auth/logout"));
  const signedOut = await native("/v1/push-actions/chat/reply", token, {
    clientId: crypto.randomUUID(),
    body: "Signed out",
  });
  assert.equal(signedOut.status, 401, JSON.stringify(signedOut.body.error));
  assert.equal(signedOut.body.error?.code, "PUSH_ACTION_SIGNED_OUT");
});

await flow.close();
