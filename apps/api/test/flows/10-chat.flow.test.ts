/**
 * Chat, through the real API: course groups (announcement mode, sending,
 * retries, history and catch-up, edits, deletes, reactions), slow mode,
 * mutes, bans, helpers, private chats with requests and blocks, reports,
 * and live delivery over the stream.
 */
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { test } from "node:test";

import {
  signedInAdmin,
  signedUpLearner,
  startFlowApp,
  type FlowClient,
} from "./setup/flow-app.ts";
import { createCourse, enrollForFree } from "./setup/flow-courses.ts";

const flow = await startFlowApp();
const admin = await signedInAdmin(flow);
const course = await createCourse(flow, {
  title: "Chat Course",
  pricing: "free",
});
const elsewhere = await createCourse(flow, {
  title: "Other Course",
  pricing: "free",
});

const a = await signedUpLearner(flow, "chata");
const b = await signedUpLearner(flow, "chatb");
const c = await signedUpLearner(flow, "chatc");
await enrollForFree(a.client, course);
await enrollForFree(b.client, course);
await enrollForFree(c.client, elsewhere);

interface Room {
  id: string;
  kind: string;
  postingPolicy: string;
  directStatus: string | null;
  unreadCount: number;
  lastSeq: number;
  me: {
    canPost: boolean;
    cannotPostReason: string | null;
    restriction: { type: string } | null;
  };
}
interface Message {
  seq: number;
  eventSeq: number;
  body: string;
  editedAt: string | null;
  reactions: Record<string, number>;
  deleted: { by: string } | null;
  sender: { id: string; role: string } | null;
}

let roomId = "";
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

function refused(
  response: { status: number; body: { error?: { code?: string } } },
  status: number,
  code: string,
) {
  assert.equal(response.status, status, JSON.stringify(response.body.error));
  assert.equal(response.body.error?.code, code);
}

async function myRooms(client: FlowClient) {
  return ok<{ rooms: Room[]; requestsCount: number }>(
    await client.get("/v1/chat/rooms"),
  );
}

async function send(
  client: FlowClient,
  room: string,
  body: string,
  clientId = crypto.randomUUID(),
) {
  return client.post<{ message: Message; duplicate: boolean }>(
    `/v1/chat/rooms/${room}/messages`,
    { clientId, body },
  );
}

async function messages(client: FlowClient, room: string) {
  return ok<{ messages: Message[] }>(
    await client.get(`/v1/chat/rooms/${room}/messages`),
  ).messages;
}

await test("an admin turns on a course group; open free courses start announcement-only", async () => {
  const created = ok<{ room: Room }>(
    await admin.post(`/v1/chat/courses/${course.id}/room`),
  );
  assert.equal(created.room.kind, "course");
  assert.equal(created.room.postingPolicy, "staff_only");
  roomId = created.room.id;

  // Asking again returns the same group.
  const again = ok<{ room: Room }>(
    await admin.post(`/v1/chat/courses/${course.id}/room`),
  );
  assert.equal(again.room.id, roomId);

  for (const learner of [a, b]) {
    const listed = (await myRooms(learner.client)).rooms.find(
      (r) => r.id === roomId,
    );
    assert.ok(listed, "an enrolled learner sees the group");
    assert.equal(listed.unreadCount, 0);
    assert.equal(listed.me.canPost, false);
    assert.equal(listed.me.cannotPostReason, "staff_only");
  }
  assert.equal(
    (await myRooms(c.client)).rooms.some((r) => r.id === roomId),
    false,
    "someone in another course does not",
  );
  refused(await send(a.client, roomId, "hello"), 403, "CHAT_ADMINS_ONLY");
  // An open free course is readable by anyone signed in (as its discussions
  // are), but only listed for those who joined it.
  assert.equal(
    (await c.client.get(`/v1/chat/rooms/${roomId}/messages`)).status,
    200,
  );
  const asVisitor = ok<{ room: Room }>(
    await c.client.get(`/v1/chat/rooms/${roomId}`),
  ).room;
  assert.equal(asVisitor.me.canPost, false);

  // A paid course's group is closed to people without access, and starts
  // open for posting.
  const paid = await createCourse(flow, {
    title: "Paid Chat Course",
    pricing: "paid",
  });
  const paidRoom = ok<{ room: Room }>(
    await admin.post(`/v1/chat/courses/${paid.id}/room`),
  ).room;
  assert.equal(paidRoom.postingPolicy, "everyone");
  refused(
    await c.client.get(`/v1/chat/rooms/${paidRoom.id}/messages`),
    403,
    "CHAT_NO_ACCESS",
  );
  refused(
    await send(c.client, paidRoom.id, "let me in"),
    403,
    "CHAT_NO_ACCESS",
  );
  refused(
    await c.client.post(`/v1/chat/courses/${paid.id}/room`),
    403,
    "CHAT_NOT_ADMIN",
  );

  ok(
    await admin.patch(`/v1/chat/rooms/${roomId}/settings`, {
      postingPolicy: "everyone",
    }),
  );
  // Reading an open free course's group is open; posting needs joining it.
  refused(
    await send(c.client, roomId, "hi from outside"),
    403,
    "CHAT_JOIN_COURSE_FIRST",
  );
  refused(
    await a.client.patch(`/v1/chat/rooms/${roomId}/settings`, {
      postingPolicy: "staff_only",
    }),
    403,
    "CHAT_NOT_ADMIN",
  );
});

await test("sending: a retry is not stored twice; history, unread counts and catch-up", async () => {
  const clientId = crypto.randomUUID();
  const first = ok<{ message: Message; duplicate: boolean }>(
    await send(a.client, roomId, "Why does useEffect run twice?", clientId),
    201,
  );
  assert.equal(first.duplicate, false);
  assert.equal(first.message.sender?.role, "learner");
  const retry = ok<{ message: Message; duplicate: boolean }>(
    await send(a.client, roomId, "Why does useEffect run twice?", clientId),
  );
  assert.equal(retry.duplicate, true);
  assert.equal(retry.message.seq, first.message.seq);

  const adminReply = ok<{ message: Message }>(
    await send(admin, roomId, "StrictMode in dev."),
    201,
  );
  assert.equal(
    adminReply.message.seq,
    first.message.seq + 1,
    "numbers have no gaps",
  );
  assert.equal(adminReply.message.sender?.role, "admin");

  const bRoom = (await myRooms(b.client)).rooms.find((r) => r.id === roomId)!;
  assert.equal(bRoom.unreadCount, 2);
  assert.deepEqual(
    (await messages(b.client, roomId)).map((m) => m.body),
    ["Why does useEffect run twice?", "StrictMode in dev."],
  );
  const changes = ok<{ reset: boolean; messages: Message[] }>(
    await b.client.get(
      `/v1/chat/rooms/${roomId}/changes?since=${first.message.eventSeq}`,
    ),
  );
  assert.equal(changes.reset, false);
  assert.deepEqual(
    changes.messages.map((m) => m.seq),
    [adminReply.message.seq],
  );

  // Read positions are written in batches every few seconds.
  ok(
    await b.client.post("/v1/chat/receipts", {
      receipts: [{ roomId, readSeq: adminReply.message.seq }],
    }),
  );
  await sleep(3_500);
  assert.equal(
    (await myRooms(b.client)).rooms.find((r) => r.id === roomId)!.unreadCount,
    0,
  );
});

await test("edit, delete for everyone or for me, and reactions", async () => {
  const mine = ok<{ message: Message }>(
    await send(a.client, roomId, "typo hre"),
    201,
  ).message;
  const edited = ok<{ message: Message }>(
    await a.client.patch(`/v1/chat/rooms/${roomId}/messages/${mine.seq}`, {
      body: "typo here",
    }),
  ).message;
  assert.equal(edited.body, "typo here");
  assert.ok(edited.editedAt);
  assert.ok(
    edited.eventSeq > mine.eventSeq,
    "an edit gets a new change number",
  );
  refused(
    await b.client.patch(`/v1/chat/rooms/${roomId}/messages/${mine.seq}`, {
      body: "nope",
    }),
    403,
    "CHAT_NOT_YOUR_MESSAGE",
  );

  const reacted = ok<{ message: Message }>(
    await b.client.put(
      `/v1/chat/rooms/${roomId}/messages/${mine.seq}/reaction`,
      { emoji: "👍" },
    ),
  ).message;
  assert.deepEqual(reacted.reactions, { "👍": 1 });
  refused(
    await b.client.put(
      `/v1/chat/rooms/${roomId}/messages/${mine.seq}/reaction`,
      { emoji: "lol" },
    ),
    400,
    "CHAT_INVALID_REACTION",
  );

  ok(
    await b.client.delete(
      `/v1/chat/rooms/${roomId}/messages/${mine.seq}?for=me`,
    ),
  );
  assert.equal(
    (await messages(b.client, roomId)).some((m) => m.seq === mine.seq),
    false,
  );
  assert.equal(
    (await messages(a.client, roomId)).some((m) => m.seq === mine.seq),
    true,
  );

  ok(
    await a.client.delete(
      `/v1/chat/rooms/${roomId}/messages/${mine.seq}?for=everyone`,
    ),
  );
  const gone = (await messages(admin, roomId)).find((m) => m.seq === mine.seq)!;
  assert.equal(gone.body, "", "deleted text is never sent out");
  assert.equal(gone.deleted?.by, "self");
});

await test("slow mode holds learners back but not admins; a mute stops sending until lifted", async () => {
  ok(
    await admin.patch(`/v1/chat/rooms/${roomId}/settings`, {
      slowModeSeconds: 30,
    }),
  );
  // B has not posted in the group yet; A has, seconds ago (that counts too).
  ok(await send(b.client, roomId, "one"), 201);
  refused(await send(b.client, roomId, "two"), 429, "CHAT_SLOW_MODE");
  refused(await send(a.client, roomId, "me too"), 429, "CHAT_SLOW_MODE");
  ok(await send(admin, roomId, "admins are exempt"), 201);
  ok(await send(admin, roomId, "still exempt"), 201);
  ok(
    await admin.patch(`/v1/chat/rooms/${roomId}/settings`, {
      slowModeSeconds: 0,
    }),
  );

  const mute = ok<{ restriction: { id: string } }>(
    await admin.post("/v1/chat/restrictions", {
      userId: a.userId,
      roomId,
      type: "mute",
      durationMinutes: 60,
      reason: "spam",
    }),
    201,
  );
  refused(await send(a.client, roomId, "muted?"), 403, "CHAT_MUTED");
  const listed = (await myRooms(a.client)).rooms.find((r) => r.id === roomId)!;
  assert.equal(listed.me.cannotPostReason, "muted");
  assert.equal(listed.me.restriction?.type, "mute");

  ok(await admin.delete(`/v1/chat/restrictions/${mute.restriction.id}`));
  ok(await send(a.client, roomId, "back again"), 201);
});

await test("helpers delete and mute learners only, for at most 24 hours", async () => {
  ok(await admin.put(`/v1/chat/rooms/${roomId}/helpers/${b.userId}`));

  const learnerMessage = ok<{ message: Message }>(
    await send(a.client, roomId, "BUY CHEAP BUNDLES"),
    201,
  ).message;
  ok(
    await b.client.delete(
      `/v1/chat/rooms/${roomId}/messages/${learnerMessage.seq}`,
    ),
  );
  const removed = (await messages(admin, roomId)).find(
    (m) => m.seq === learnerMessage.seq,
  )!;
  assert.equal(removed.deleted?.by, "admin");

  const adminMessage = ok<{ message: Message }>(
    await send(admin, roomId, "Rules: be kind"),
    201,
  ).message;
  refused(
    await b.client.delete(
      `/v1/chat/rooms/${roomId}/messages/${adminMessage.seq}`,
    ),
    403,
    "CHAT_TARGET_OUTRANKS",
  );
  refused(
    await b.client.post("/v1/chat/restrictions", {
      userId: a.userId,
      roomId,
      type: "mute",
      durationMinutes: 2 * 24 * 60,
      reason: "spam",
    }),
    403,
    "CHAT_NOT_ADMIN",
  );
  const short = ok<{ restriction: { id: string } }>(
    await b.client.post("/v1/chat/restrictions", {
      userId: a.userId,
      roomId,
      type: "mute",
      durationMinutes: 60,
      reason: "spam",
    }),
    201,
  );

  // Staff can bring a helper's deletion back.
  const restored = ok<{ message: Message }>(
    await admin.post(
      `/v1/chat/rooms/${roomId}/messages/${learnerMessage.seq}/restore`,
    ),
  ).message;
  assert.equal(restored.body, "BUY CHEAP BUNDLES");
  ok(await admin.delete(`/v1/chat/restrictions/${short.restriction.id}`));
  ok(await admin.delete(`/v1/chat/rooms/${roomId}/helpers/${b.userId}`));
});

await test("private chats: only where allowed, as a request first; blocks stop them", async () => {
  // A has sent many messages in the last seconds: let the per-user send
  // limit (10 per 10 s) pass.
  await sleep(10_500);
  refused(
    await a.client.post("/v1/chat/direct", { userId: b.userId }),
    403,
    "CHAT_DIRECT_NOT_ALLOWED",
  );
  ok(
    await admin.patch(`/v1/chat/rooms/${roomId}/settings`, {
      directMessagesAllowed: true,
    }),
  );

  const started = ok<{ room: Room; created: boolean }>(
    await a.client.post("/v1/chat/direct", { userId: b.userId }),
    201,
  );
  assert.equal(started.room.directStatus, "requested");
  const dm = started.room.id;
  ok(await send(a.client, dm, "Hi! Could you share your notes?"), 201);
  refused(await send(a.client, dm, "hello??"), 403, "CHAT_REQUEST_PENDING");

  const bView = await myRooms(b.client);
  assert.equal(bView.requestsCount, 1);
  // Replying accepts, as in WhatsApp.
  ok(await send(b.client, dm, "Sure, here they are"), 201);
  ok(await send(a.client, dm, "Thanks!"), 201);
  const again = ok<{ room: Room; created: boolean }>(
    await b.client.post("/v1/chat/direct", { userId: a.userId }),
  );
  assert.equal(again.created, false);
  assert.equal(again.room.id, dm);
  assert.equal(again.room.directStatus, "accepted");

  refused(
    await c.client.post("/v1/chat/direct", { userId: a.userId }),
    403,
    "CHAT_DIRECT_NOT_ALLOWED",
  );

  ok(await b.client.put(`/v1/chat/blocks/${a.userId}`));
  refused(await send(a.client, dm, "are you there"), 403, "CHAT_BLOCKED");
  ok(await b.client.delete(`/v1/chat/blocks/${a.userId}`));
  ok(await send(a.client, dm, "unblocked"), 201);
  refused(
    await c.client.get(`/v1/chat/rooms/${dm}/messages`),
    403,
    "CHAT_NO_ACCESS",
  );
});

await test("reports reach the group's admins; a ban takes the group away", async () => {
  const offending = ok<{ message: Message }>(
    await send(b.client, roomId, "rude words"),
    201,
  ).message;
  ok(
    await a.client.post(
      `/v1/chat/rooms/${roomId}/messages/${offending.seq}/report`,
      { reason: "harassment" },
    ),
    201,
  );
  const reports = ok<{
    reports: Array<{ id: string; seq: number; snapshot: { body: string } }>;
  }>(await admin.get("/v1/chat/reports?status=open")).reports;
  const report = reports.find((r) => r.seq === offending.seq);
  assert.ok(report);
  assert.equal(report.snapshot.body, "rude words");
  assert.deepEqual(
    ok<{ reports: unknown[] }>(await a.client.get("/v1/chat/reports")).reports,
    [],
  );
  ok(
    await admin.patch(`/v1/chat/reports/${report.id}`, { status: "actioned" }),
  );

  const ban = ok<{ restriction: { id: string } }>(
    await admin.post("/v1/chat/restrictions", {
      userId: b.userId,
      roomId,
      type: "ban",
      reason: "harassment",
    }),
    201,
  );
  assert.equal(
    (await myRooms(b.client)).rooms.some((r) => r.id === roomId),
    false,
  );
  refused(
    await b.client.get(`/v1/chat/rooms/${roomId}/messages`),
    403,
    "CHAT_BANNED",
  );
  ok(await admin.delete(`/v1/chat/restrictions/${ban.restriction.id}`));
  assert.ok((await myRooms(b.client)).rooms.some((r) => r.id === roomId));

  const log = ok<{ entries: Array<{ action: string }> }>(
    await admin.get("/v1/chat/moderation-log"),
  );
  assert.ok(log.entries.some((e) => e.action === "restriction.ban"));
});

await test("files: signed direct uploads, allowed types only, never sent unfinished", async () => {
  const size = 4_000;
  const started = ok<{
    uploadId: string;
    uploadUrl: string;
    viaApi: boolean;
    headers: Record<string, string>;
  }>(
    await a.client.post("/v1/chat/rooms/" + roomId + "/uploads", {
      kind: "audio",
      name: "voice.weba",
      mimeType: "audio/webm;codecs=opus",
      size,
      durationMs: 4200,
      waveform: [10, 40, 80, 30],
    }),
  );
  // Object storage is configured here: the browser uploads straight to it.
  assert.equal(started.viaApi, false);
  assert.match(started.uploadUrl, /X-Amz-Signature=/);
  assert.match(
    started.uploadUrl,
    /content-type/i,
    "the type is bound into the signature",
  );
  assert.equal(started.headers["Content-Type"], "audio/webm");

  refused(
    await a.client.post("/v1/chat/rooms/" + roomId + "/uploads", {
      kind: "image",
      name: "x.svg",
      mimeType: "image/svg+xml",
      size: 10,
    }),
    400,
    "CHAT_UPLOAD_TYPE",
  );
  refused(
    await a.client.post("/v1/chat/rooms/" + roomId + "/uploads", {
      kind: "image",
      name: "big.jpg",
      mimeType: "image/jpeg",
      size: 50 * 1024 * 1024,
    }),
    400,
    "CHAT_UPLOAD_TOO_BIG",
  );
  refused(
    await a.client.post("/v1/chat/rooms/" + roomId + "/messages", {
      clientId: crypto.randomUUID(),
      body: "",
      attachmentIds: [started.uploadId],
    }),
    400,
    "CHAT_UPLOAD_NOT_READY",
  );
  refused(
    await b.client.post("/v1/chat/uploads/" + started.uploadId + "/complete"),
    404,
    "CHAT_UPLOAD_NOT_FOUND",
  );
  refused(
    await c.client.post("/v1/chat/rooms/" + roomId + "/uploads", {
      kind: "file",
      name: "a.pdf",
      mimeType: "application/pdf",
      size: 10,
    }),
    403,
    "CHAT_JOIN_COURSE_FIRST",
  );
});

await test("the live stream delivers new messages to the group", async () => {
  await flow.app.listen({ port: 0, host: "127.0.0.1" });
  const { port } = flow.app.server.address() as AddressInfo;
  const cookie = [...b.client.cookies]
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");
  const received: string[] = [];
  let ready = false;
  const request = http.get({
    host: "127.0.0.1",
    port,
    path: "/v1/chat/stream",
    headers: { cookie },
  });
  const response = await new Promise<http.IncomingMessage>(
    (resolve, reject) => {
      request.on("response", resolve);
      request.on("error", reject);
    },
  );
  assert.equal(response.statusCode, 200);
  response.setEncoding("utf8");
  response.on("data", (chunk: string) => {
    received.push(chunk);
    if (chunk.includes("event: ready")) ready = true;
  });
  for (let i = 0; i < 50 && !ready; i += 1) await sleep(100);
  assert.ok(ready, "the stream says ready");
  assert.ok(received.join("").includes(roomId), "ready lists the group");

  // The LISTEN connection opens with the first stream: give it a moment.
  await sleep(1_000);
  ok(await send(admin, roomId, "Live Q&A starts now"), 201);
  for (
    let i = 0;
    i < 50 && !received.join("").includes("Live Q&A starts now");
    i += 1
  ) {
    await sleep(100);
  }
  const all = received.join("");
  assert.ok(
    all.includes("event: chat.message"),
    "a chat.message event arrived",
  );
  assert.ok(all.includes("Live Q&A starts now"));
  request.destroy();
});

await flow.close();
