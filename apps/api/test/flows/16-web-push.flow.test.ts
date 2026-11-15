/**
 * Web push for chat, through the real API and the real notification
 * worker: a browser subscribes, a message in its chat reaches it encrypted
 * (opened here as the browser would), tagged per chat; mutes (for a
 * while, for good, mentions only), a message already read, a push service
 * that says the subscription is gone or is busy, signing out and turning
 * it off. Only the push service itself is a stand-in (fake-push-service.ts).
 */
// First: the environment, before the API's config is read below.
import { fakePush, type FakeBrowser } from "./setup/fake-push-service.ts";
import "./setup/flow-env.ts";

import assert from "node:assert/strict";
import crypto from "node:crypto";
import { test } from "node:test";

import { sql } from "kysely";

import { config } from "../../src/config.ts";
import { createSessionService } from "../../src/modules/auth/index.ts";
import { createChatPushSource } from "../../src/modules/chat/index.ts";
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

/** The notification worker, as it runs beside the API. */
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
  }),
  chat: createChatPushSource({
    database: flow.database,
    groupMaxMembers: config.CHAT_PUSH_GROUP_MAX_MEMBERS,
  }),
  handlers: { listActiveCourseRecipientUserIds: async () => [] },
  recipients: { findRecipient: async (id) => ({ id, email: null }) },
});

// Every flow file signs the admin in, and one address gets at most 30
// codes a day (OTP_IDENTIFIER_DAILY_CEILING): the earlier files' codes are
// moved a day back so this file's sign-in is not refused when the whole
// suite runs. The limit itself is tested in 01-sign-in.
await sql`
  update otp_codes set created_at = created_at - interval '25 hours'
  where identifier = ${FLOW_ADMIN.email}
`.execute(flow.database);
const admin = await signedInAdmin(flow);

/**
 * Runs the worker until it has nothing left, as its loop does every few
 * seconds: events earlier flow files left behind come first.
 */
async function runWorker() {
  for (let round = 0; round < 50; round += 1) {
    const result = await worker.process();
    if (result.outbox.processed === 0 && (result.push?.sent ?? 0) === 0) return;
  }
}
const course = await createCourse(flow, {
  title: "Push Course",
  pricing: "free",
});
const a = await signedUpLearner(flow, "pusha");
const b = await signedUpLearner(flow, "pushb");
const c = await signedUpLearner(flow, "pushc");
for (const learner of [a, b, c]) await enrollForFree(learner.client, course);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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

async function subscribe(client: FlowClient, browser: FakeBrowser) {
  return ok<{ registered: true; enabled: boolean }>(
    await client.put("/v1/me/web-push/subscription", {
      endpoint: browser.endpoint,
      keys: browser.keys,
    }),
  );
}

let roomId = "";
async function send(
  client: FlowClient,
  body: string,
  extra: { mentions?: string[] } = {},
) {
  return ok<{ message: { seq: number } }>(
    await client.post(`/v1/chat/rooms/${roomId}/messages`, {
      clientId: crypto.randomUUID(),
      body,
      ...extra,
    }),
    201,
  ).message;
}

async function setMine(client: FlowClient, patch: Record<string, unknown>) {
  return ok<{
    room: { me: { notifyLevel: string; mutedUntil: string | null } };
  }>(await client.patch(`/v1/chat/rooms/${roomId}/me`, patch)).room.me;
}

async function webRows(userId: string) {
  return await flow.database
    .selectFrom("push_devices")
    .select(["id", "fid", "session_id", "web_endpoint"])
    .where("user_id", "=", userId)
    .where("platform", "=", "web")
    .execute();
}

const aBrowser = fakePush.browser("a-laptop");
const cBrowser = fakePush.browser("c-laptop");

await test("a browser subscribes; an address that is not a push service is refused", async () => {
  const settings = ok<{ enabled: boolean; publicKey: string }>(
    await a.client.get("/v1/me/web-push"),
  );
  assert.deepEqual(settings, { enabled: true, publicKey: fakePush.publicKey });

  const refused = await a.client.put("/v1/me/web-push/subscription", {
    endpoint: "https://intranet.example.test/admin",
    keys: aBrowser.keys,
  });
  assert.equal(refused.status, 400);
  assert.equal(refused.body.error?.code, "WEB_PUSH_ENDPOINT_REFUSED");

  assert.deepEqual(await subscribe(a.client, aBrowser), {
    registered: true,
    enabled: true,
  });
  // Saved again on the next visit: still one row for this browser.
  await subscribe(a.client, aBrowser);
  const rows = await webRows(a.userId);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.web_endpoint, aBrowser.endpoint);
  assert.ok(rows[0]!.session_id, "linked to the login that saved it");

  // A phone install cannot use a browser's id.
  const phone = await a.client.put("/v1/me/push-devices", {
    fid: rows[0]!.fid,
    applicationId: "com.example.app",
    platform: "android",
    pushAllowed: true,
  });
  assert.equal(phone.status, 400);

  // Signed out visitors cannot subscribe.
  const visitor = flow.visitor();
  assert.equal(
    (
      await visitor.put("/v1/me/web-push/subscription", {
        endpoint: aBrowser.endpoint,
        keys: aBrowser.keys,
      })
    ).status,
    401,
  );
});

await test("the test button sends a notification to this browser at once", async () => {
  const result = ok<{ sent: boolean; problem: string | null }>(
    await a.client.post("/v1/me/web-push/test", {
      endpoint: aBrowser.endpoint,
    }),
  );
  assert.deepEqual(result, { sent: true, problem: null });
  const [shown] = fakePush.pushesFor(aBrowser);
  assert.equal(shown?.kind, "test");
  // Another account's browser is not theirs to test.
  const other = ok<{ sent: boolean }>(
    await b.client.post("/v1/me/web-push/test", {
      endpoint: aBrowser.endpoint,
    }),
  );
  assert.equal(other.sent, false);
});

await test("a group message reaches the browser, encrypted, one notification per chat", async () => {
  const created = ok<{ room: { id: string } }>(
    await admin.post(`/v1/chat/courses/${course.id}/room`),
  );
  roomId = created.room.id;
  ok(
    await admin.patch(`/v1/chat/rooms/${roomId}/settings`, {
      postingPolicy: "everyone",
    }),
  );
  // A course group gets its members as they first open their chats (the
  // prompt to turn notifications on is on that page).
  for (const learner of [a, b, c])
    ok(await learner.client.get("/v1/chat/rooms"));

  const before = fakePush.received.length;
  const sent = await send(b.client, "Has anyone finished lesson 3?");
  await runWorker();

  const pushes = fakePush.received.slice(before);
  assert.equal(pushes.length, 1, "one push, to the one subscribed browser");
  const push = pushes[0]!;
  assert.equal(push.browser, aBrowser.name);
  assert.equal(push.headers["content-encoding"], "aes128gcm");
  assert.equal(push.headers.urgency, "high");
  assert.equal(push.headers.topic, roomId.replace(/-/gu, ""));
  assert.ok(Number(push.headers.ttl) > 0);
  assert.match(
    String(push.headers.authorization),
    new RegExp(`^vapid t=.+, k=${fakePush.publicKey}$`, "u"),
  );

  const shown = JSON.parse(fakePush.decrypt(push, aBrowser));
  assert.equal(shown.title, "Push Course");
  assert.equal(
    shown.body,
    `${b.learner.displayName}: Has anyone finished lesson 3?`,
  );
  assert.equal(shown.tag, `chat:${roomId}`);
  assert.equal(shown.url, `/chat/${roomId}?seq=${sent.seq}`);
  assert.equal(shown.isMention, false);
});

await test("muted for 8 hours or for good: nothing; mentions only: just mentions", async () => {
  const muted = await setMine(a.client, { muteFor: "8h" });
  assert.equal(muted.notifyLevel, "all");
  const until = Date.parse(muted.mutedUntil!);
  assert.ok(
    until > Date.now() + 7.9 * 3600_000 && until < Date.now() + 8.1 * 3600_000,
  );

  let before = fakePush.received.length;
  await send(b.client, "Anyone?");
  await runWorker();
  assert.equal(fakePush.received.length, before, "muted: no push");

  // A mute for a while that has ended lets messages through again.
  await sql`
    update chat_members set muted_until = now() - interval '1 minute'
    where room_id = ${roomId} and user_id = ${a.userId}
  `.execute(flow.database);
  before = fakePush.received.length;
  await send(admin, "The mute is over.");
  await runWorker();
  assert.equal(fakePush.received.length, before + 1);

  const mentions = await setMine(a.client, {
    notifyLevel: "mentions",
    muteFor: "off",
  });
  assert.deepEqual(mentions, {
    ...mentions,
    notifyLevel: "mentions",
    mutedUntil: null,
  });
  before = fakePush.received.length;
  await send(admin, "General note for everyone reading.");
  await runWorker();
  assert.equal(fakePush.received.length, before, "not mentioned: no push");
  await send(admin, "Can you check this?", { mentions: [a.userId] });
  await runWorker();
  const mentioned = fakePush.pushesFor(aBrowser).at(-1)!;
  assert.equal(fakePush.received.length, before + 1);
  assert.equal(mentioned.isMention, true);

  // A group on "mentions" muted for a while goes back to mentions.
  const again = await setMine(a.client, { muteFor: "1w" });
  assert.equal(again.notifyLevel, "mentions");
  assert.ok(again.mutedUntil);
  const forGood = await setMine(a.client, { muteFor: "always" });
  assert.deepEqual(
    { level: forGood.notifyLevel, until: forGood.mutedUntil },
    { level: "none", until: null },
  );
  before = fakePush.received.length;
  await send(admin, "Muted for good?", { mentions: [a.userId] });
  await runWorker();
  assert.equal(fakePush.received.length, before, "muted for good: no push");

  const unmuted = await setMine(a.client, { muteFor: "off" });
  assert.deepEqual(
    { level: unmuted.notifyLevel, until: unmuted.mutedUntil },
    { level: "all", until: null },
  );
});

await test("a message already read on another device is not pushed", async () => {
  const before = fakePush.received.length;
  const sent = await send(admin, "Read this on your phone.");
  ok(
    await a.client.post("/v1/chat/receipts", {
      receipts: [{ roomId, readSeq: sent.seq }],
    }),
  );
  // Read positions are written in batches every few seconds.
  await sleep(3_500);
  await runWorker();
  assert.equal(fakePush.received.length, before);
});

await test("busy push service: retried later; gone: the subscription is removed", async () => {
  fakePush.answer(aBrowser, 503);
  let before = fakePush.received.length;
  await send(admin, "Retry me.");
  await runWorker();
  assert.equal(fakePush.received.length, before + 1, "tried once");
  const waiting = await flow.database
    .selectFrom("push_deliveries")
    .select(["id", "status", "attempt_count", "next_attempt_at"])
    .where("user_id", "=", a.userId)
    .orderBy("created_at", "desc")
    .executeTakeFirstOrThrow();
  assert.equal(waiting.status, "pending");
  assert.equal(waiting.attempt_count, 1);
  assert.ok(waiting.next_attempt_at.getTime() > Date.now());

  fakePush.answer(aBrowser, undefined);
  await flow.database
    .updateTable("push_deliveries")
    .set({ next_attempt_at: new Date(Date.now() - 1000) })
    .where("id", "=", waiting.id)
    .execute();
  await runWorker();
  const delivered = await flow.database
    .selectFrom("push_deliveries")
    .select("status")
    .where("id", "=", waiting.id)
    .executeTakeFirstOrThrow();
  assert.equal(delivered.status, "sent");
  assert.match(
    String(fakePush.pushesFor(aBrowser).at(-1)!.body),
    /: Retry me\.$/u,
  );

  fakePush.answer(aBrowser, 410);
  before = fakePush.received.length;
  await send(admin, "Are you still there?");
  await runWorker();
  assert.equal(fakePush.received.length, before + 1);
  assert.equal((await webRows(a.userId)).length, 0, "410: removed");
  fakePush.answer(aBrowser, undefined);
});

await test("signing out stops that browser's pushes", async () => {
  await subscribe(c.client, cBrowser);
  assert.equal((await webRows(c.userId)).length, 1);
  ok(await c.client.post("/v1/auth/logout"));

  const before = fakePush.received.length;
  await send(admin, "After sign-out.");
  await runWorker();
  assert.equal(
    fakePush.received.slice(before).filter((p) => p.browser === cBrowser.name)
      .length,
    0,
  );
  // The worker drops a signed-out login's browser when it next has a push
  // for it (the site also removes it itself before signing out).
  assert.equal((await webRows(c.userId)).length, 0, "removed after sign-out");
});

await test("turning notifications off removes the subscription", async () => {
  await subscribe(a.client, aBrowser);
  const removed = ok<{ removed: boolean }>(
    await a.client.post("/v1/me/web-push/subscription/remove", {
      endpoint: aBrowser.endpoint,
    }),
  );
  assert.equal(removed.removed, true);
  const before = fakePush.received.length;
  await send(admin, "Nobody subscribed now.");
  await runWorker();
  assert.equal(fakePush.received.length, before);
});

await flow.close();
await fakePush.close();
