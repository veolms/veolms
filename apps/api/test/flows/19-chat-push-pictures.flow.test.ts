/**
 * Pictures in a chat notification on an Android phone, through the real API
 * and notification worker: a chat push carries the sender's picture
 * (`senderAvatarUrl`; for a reaction, the person who reacted) and, in a
 * course chat, the course's picture (`roomIconUrl`), as complete URLs the
 * phone can fetch on its own; a private chat has no group picture. Only
 * Firebase is a stand-in (fake-phone-push.ts).
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
import {
  createNotificationProcessor,
  createPushPipeline,
} from "../../src/modules/notifications/index.ts";
import { createServices } from "../../src/services/index.ts";
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

// As the API's own worker is set up: public pictures are addressed through
// the CDN (CDN_URL is https://cdn.flow.test here; nothing is fetched).
const { storage } = createServices({ config, logger: quiet });

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
    storage,
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

const DICEBEAR_PNG =
  /^https:\/\/api\.dicebear\.com\/10\.x\/[a-z-]+\/png\?seed=[^&]+&size=128$/u;

// A published course with a picture of its own, as an upload stores it.
const course = await createCourse(flow, {
  title: "Push Pictures Course",
  pricing: "free",
});
const pictureId = crypto.randomUUID();
await flow.database
  .insertInto("media_assets")
  .values({
    id: pictureId,
    owner_id: FLOW_ADMIN.id,
    type: "image",
    storage_provider: "s3",
    storage_key: `public/thumbnails/${pictureId}/original.webp`,
    original_filename: "course.webp",
    mime_type: "image/webp",
    size_bytes: 2048,
    width: null,
    height: null,
    duration_seconds: null,
    metadata: JSON.stringify({}),
    status: "ready",
    upload_id: null,
    upload_part_size: null,
  })
  .execute();
await flow.database
  .updateTable("courses")
  .set({ thumbnail_media_id: pictureId })
  .where("id", "=", course.id)
  .execute();

const sender = await signedUpLearner(flow, "picsender");
const reader = await signedUpLearner(flow, "picreader");
for (const learner of [sender, reader])
  await enrollForFree(learner.client, course);

let roomId = "";
const phoneFid = `flowphone${crypto.randomBytes(8).toString("hex")}`;

async function send(client: FlowClient, room: string, body: string) {
  return ok<{ message: { seq: number } }>(
    await client.post(`/v1/chat/rooms/${room}/messages`, {
      clientId: crypto.randomUUID(),
      body,
    }),
    201,
  ).message;
}

/** What the reader's phone got for one message of a chat. */
async function pushedTo(room: string, seq: number) {
  const push = fakeFcm
    .pushesFor(phoneFid)
    .find((p) => p.data.roomId === room && p.data.seq === String(seq));
  assert.ok(push, "the phone got the chat push");
  return push.data;
}

await test("a course chat push carries the sender's and the course's pictures", async () => {
  roomId = ok<{ room: { id: string } }>(
    await admin.post(`/v1/chat/courses/${course.id}/room`),
  ).room.id;
  ok(
    await admin.patch(`/v1/chat/rooms/${roomId}/settings`, {
      postingPolicy: "everyone",
      directMessagesAllowed: true,
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

  const message = await send(sender.client, roomId, "Who has lesson 2 notes?");
  await runWorker();
  const data = await pushedTo(roomId, message.seq);

  assert.equal(data.kind, "chat_message");
  assert.equal(data.senderId, sender.userId);
  // A new account's default picture, as the PNG a phone can draw.
  assert.match(data.senderAvatarUrl ?? "", DICEBEAR_PNG);
  assert.equal(
    data.roomIconUrl,
    `https://cdn.flow.test/public/thumbnails/${pictureId}/240.webp`,
  );
});

await test("a private chat push carries an uploaded photo and no group picture", async () => {
  // A finished photo upload, as the API stores it (its 160 px WebP).
  const photo = `https://cdn.flow.test/public/avatars/${sender.userId}--${crypto.randomUUID()}/160.webp`;
  await flow.database
    .updateTable("users")
    .set({ avatar_data_url: photo })
    .where("id", "=", sender.userId)
    .execute();

  // Between learners, a private chat starts as a request; once the reader
  // accepts it, their phone hears the next message.
  const dm = ok<{ room: { id: string } }>(
    await sender.client.post("/v1/chat/direct", { userId: reader.userId }),
    201,
  ).room.id;
  await send(sender.client, dm, "Hi, a quick question");
  ok(await reader.client.post(`/v1/chat/direct/${dm}/accept`));
  const message = await send(sender.client, dm, "Do you have the slides?");
  await runWorker();
  const data = await pushedTo(dm, message.seq);

  assert.equal(data.roomKind, "direct");
  assert.equal(data.senderAvatarUrl, photo);
  assert.equal("roomIconUrl" in data, false, "no group picture");
});

await test("a reaction's push carries the picture of the person who reacted", async () => {
  const mine = await send(reader.client, roomId, "My notes are in the doc");
  const before = fakeFcm.pushesFor(phoneFid).length;
  ok(
    await sender.client.put(
      `/v1/chat/rooms/${roomId}/messages/${mine.seq}/reaction`,
      { emoji: "👍" },
    ),
  );
  await runWorker();
  const reaction = fakeFcm
    .pushesFor(phoneFid)
    .slice(before)
    .find((p) => p.data.text?.startsWith("Reacted 👍"));
  assert.ok(reaction, "the author's phone got the reaction");

  const photo = await flow.database
    .selectFrom("users")
    .select("avatar_data_url")
    .where("id", "=", sender.userId)
    .executeTakeFirstOrThrow();
  assert.equal(reaction.data.senderId, sender.userId);
  assert.equal(reaction.data.senderAvatarUrl, photo.avatar_data_url);
  assert.equal(
    reaction.data.roomIconUrl,
    `https://cdn.flow.test/public/thumbnails/${pictureId}/240.webp`,
  );
});

await flow.close();
