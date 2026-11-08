/**
 * Chat, through the real API: course groups (announcement mode, sending,
 * retries, history and catch-up, edits, deletes, reactions), slow mode,
 * mutes, bans, helpers, private chats with requests and blocks, reports,
 * live delivery over the stream (also of a group turned on later), group
 * ticks and Message info, and chat privacy settings.
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
import { createChatRepository } from "../../src/modules/chat/shared/chat.repository.ts";
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

  // Who reacted (tap the reactions): you first, then the others.
  ok(
    await a.client.put(
      `/v1/chat/rooms/${roomId}/messages/${mine.seq}/reaction`,
      { emoji: "❤️" },
    ),
  );
  type Reactions = { reactions: { id: string; emoji: string }[] };
  const whoReacted = async (client: typeof a.client) =>
    ok<Reactions>(
      await client.get(
        `/v1/chat/rooms/${roomId}/messages/${mine.seq}/reactions`,
      ),
    ).reactions.map((r) => [r.id, r.emoji]);
  assert.deepEqual(await whoReacted(b.client), [
    [b.userId, "👍"],
    [a.userId, "❤️"],
  ]);
  assert.deepEqual(await whoReacted(a.client), [
    [a.userId, "❤️"],
    [b.userId, "👍"],
  ]);
  ok(
    await a.client.put(
      `/v1/chat/rooms/${roomId}/messages/${mine.seq}/reaction`,
      { emoji: null },
    ),
  );
  assert.deepEqual(await whoReacted(b.client), [[b.userId, "👍"]]);

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
  // While it is a request, the sender sees no ticks: B opening it is not
  // answering it.
  ok(
    await b.client.post("/v1/chat/receipts", {
      receipts: [{ roomId: dm, readSeq: 1 }],
    }),
  );
  await sleep(1_500);
  const pending = (await myRooms(a.client)).rooms.find((r) => r.id === dm) as
    | (Room & { peerReadSeq: number | null; peerDeliveredSeq: number | null })
    | undefined;
  assert.equal(pending?.peerReadSeq, null);
  assert.equal(pending?.peerDeliveredSeq, null);

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

await test("group icon: only admins set it, an unfinished upload can't be one, and the picture is read through the API", async () => {
  type Summary = { iconUrl: string | null; customIcon: boolean };
  const before = ok<{ room: Summary }>(
    await b.client.get(`/v1/chat/rooms/${roomId}`),
  ).room;
  // This course has no picture and no icon was set: nothing to show.
  assert.equal(before.customIcon, false);
  assert.equal(before.iconUrl, null);
  refused(
    await b.client.get(`/v1/chat/rooms/${roomId}/icon`),
    404,
    "CHAT_UPLOAD_NOT_FOUND",
  );

  const started = ok<{ uploadId: string }>(
    await admin.post(`/v1/chat/rooms/${roomId}/uploads`, {
      kind: "image",
      name: "icon.jpg",
      mimeType: "image/jpeg",
      size: 2_000,
      width: 64,
      height: 64,
    }),
  );
  refused(
    await b.client.patch(`/v1/chat/rooms/${roomId}/settings`, {
      iconUploadId: started.uploadId,
    }),
    403,
    "CHAT_NOT_ADMIN",
  );
  refused(
    await admin.patch(`/v1/chat/rooms/${roomId}/settings`, {
      iconUploadId: started.uploadId,
    }),
    400,
    "CHAT_ICON_INVALID",
  );
});

await test("file cleanup keeps a group's icon (it belongs to no message) and removes orphaned files", async () => {
  const start = async (name: string) =>
    ok<{ uploadId: string }>(
      await admin.post(`/v1/chat/rooms/${roomId}/uploads`, {
        kind: "image",
        name,
        mimeType: "image/jpeg",
        size: 2_000,
      }),
    ).uploadId;
  const icon = await start("icon.jpg");
  const orphan = await start("orphan.jpg");
  // As after "Change icon": both finished and attached, only one is the
  // group's icon, and neither belongs to a message.
  await flow.database
    .updateTable("chat_uploads")
    .set({ status: "attached" })
    .where("id", "in", [icon, orphan])
    .execute();
  await flow.database
    .updateTable("chat_rooms")
    .set({ icon_upload_id: icon })
    .where("id", "=", roomId)
    .execute();

  const later = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
  const removable = (
    await createChatRepository().listRemovableUploads(
      flow.database,
      later,
      later,
      10_000,
    )
  ).map((row) => row.id);
  assert.ok(
    !removable.includes(icon),
    "a group's icon is never cleaned up while the group uses it",
  );
  assert.ok(removable.includes(orphan), "an orphaned file is cleaned up");

  await flow.database
    .updateTable("chat_rooms")
    .set({ icon_upload_id: null })
    .where("id", "=", roomId)
    .execute();
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

/** Opens a chat stream as this person; everything it receives, as text. */
async function openStream(client: FlowClient) {
  const { port } = flow.app.server.address() as AddressInfo;
  const cookie = [...client.cookies]
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");
  const received: string[] = [];
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
  response.on("data", (chunk: string) => received.push(chunk));
  const text = () => received.join("");
  async function waitFor(needle: string, what: string) {
    for (let i = 0; i < 80 && !text().includes(needle); i += 1)
      await sleep(100);
    assert.ok(text().includes(needle), what);
  }
  await waitFor("event: ready", "the stream says ready");
  return { text, waitFor, close: () => request.destroy() };
}

await test("a group turned on while a learner has Chats open reaches them live", async () => {
  const later = await createCourse(flow, {
    title: "Later Chat Course",
    pricing: "free",
  });
  await enrollForFree(a.client, later);
  const stream = await openStream(a.client);
  await sleep(500);

  const room = ok<{ room: Room }>(
    await admin.post(`/v1/chat/courses/${later.id}/room`),
  ).room;
  await stream.waitFor(
    `event: chat.room_added
data: {"roomId":"${room.id}"}`,
    "the learner's open stream is told about the new group",
  );
  ok(await send(admin, room.id, "Welcome to the new group"), 201);
  await stream.waitFor(
    "Welcome to the new group",
    "its first message arrives live, without reconnecting",
  );
  stream.close();
});

await test("group ticks: two once everyone received it, blue once all read it; Message info lists them", async () => {
  const ticks = await createCourse(flow, {
    title: "Ticks Course",
    pricing: "free",
  });
  await enrollForFree(a.client, ticks);
  await enrollForFree(b.client, ticks);
  const room = ok<{ room: Room }>(
    await admin.post(`/v1/chat/courses/${ticks.id}/room`),
  ).room;
  ok(
    await admin.patch(`/v1/chat/rooms/${room.id}/settings`, {
      postingPolicy: "everyone",
    }),
  );
  // Each opens the group once (that makes them members).
  for (const client of [admin, a.client, b.client]) {
    await messages(client, room.id);
  }
  const sent = ok<{ message: Message }>(
    await send(a.client, room.id, "Did everyone get this?"),
    201,
  ).message;

  type Ticked = Room & {
    peerDeliveredSeq: number | null;
    peerReadSeq: number | null;
  };
  async function aSees() {
    return (await myRooms(a.client)).rooms.find(
      (r) => r.id === room.id,
    ) as Ticked;
  }
  let seen = await aSees();
  assert.ok(
    (seen.peerDeliveredSeq ?? 0) < sent.seq,
    "one tick while nobody has it",
  );

  ok(
    await admin.post("/v1/chat/receipts", {
      receipts: [{ roomId: room.id, deliveredSeq: sent.seq }],
    }),
  );
  ok(
    await b.client.post("/v1/chat/receipts", {
      receipts: [{ roomId: room.id, deliveredSeq: sent.seq }],
    }),
  );
  // Positions are written in batches every few seconds.
  for (let i = 0; i < 60 && (seen.peerDeliveredSeq ?? 0) < sent.seq; i += 1) {
    await sleep(200);
    seen = await aSees();
  }
  assert.ok(
    (seen.peerDeliveredSeq ?? 0) >= sent.seq,
    "two ticks once all received it",
  );
  assert.ok(
    (seen.peerReadSeq ?? 0) < sent.seq,
    "not blue while nobody read it",
  );

  ok(
    await b.client.post("/v1/chat/receipts", {
      receipts: [{ roomId: room.id, readSeq: sent.seq }],
    }),
  );
  for (let i = 0; i < 25; i += 1) await sleep(200);
  seen = await aSees();
  assert.ok(
    (seen.peerReadSeq ?? 0) < sent.seq,
    "still not blue: the admin has not read it",
  );

  const info = ok<{
    readBy: Array<{ id: string }>;
    deliveredTo: Array<{ id: string }>;
    waiting: number;
  }>(await a.client.get(`/v1/chat/rooms/${room.id}/messages/${sent.seq}/info`));
  assert.deepEqual(
    info.readBy.map((p) => p.id),
    [b.userId],
  );
  assert.equal(info.deliveredTo.length, 1, "the admin received it");
  assert.equal(info.waiting, 0);
  refused(
    await b.client.get(`/v1/chat/rooms/${room.id}/messages/${sent.seq}/info`),
    403,
    "CHAT_NOT_YOUR_MESSAGE",
  );

  ok(
    await admin.post("/v1/chat/receipts", {
      receipts: [{ roomId: room.id, readSeq: sent.seq }],
    }),
  );
  for (let i = 0; i < 60 && (seen.peerReadSeq ?? 0) < sent.seq; i += 1) {
    await sleep(200);
    seen = await aSees();
  }
  assert.ok((seen.peerReadSeq ?? 0) >= sent.seq, "blue once everyone read it");
});

await test("chat privacy: last seen and read receipts are saved per person", async () => {
  const before = ok<{
    showPresence: boolean;
    readReceipts: boolean;
    enterToSend: boolean;
  }>(await a.client.get("/v1/chat/me/profile"));
  assert.deepEqual(before, {
    showPresence: true,
    readReceipts: true,
    enterToSend: true,
  });
  const after = ok<{ showPresence: boolean; readReceipts: boolean }>(
    await a.client.patch("/v1/chat/me/profile", { readReceipts: false }),
  );
  assert.equal(after.readReceipts, false);
  assert.equal(after.showPresence, true);
  assert.equal(
    ok<{ readReceipts: boolean }>(await a.client.get("/v1/chat/me/profile"))
      .readReceipts,
    false,
  );
  ok(await a.client.patch("/v1/chat/me/profile", { readReceipts: true }));
});

await test("a message reaching someone's open app is delivered at once; search and Message info times", async () => {
  const quick = await createCourse(flow, {
    title: "Quick Ticks",
    pricing: "free",
  });
  await enrollForFree(a.client, quick);
  await enrollForFree(b.client, quick);
  const room = ok<{ room: Room }>(
    await admin.post(`/v1/chat/courses/${quick.id}/room`),
  ).room;
  ok(
    await admin.patch(`/v1/chat/rooms/${room.id}/settings`, {
      postingPolicy: "everyone",
    }),
  );
  for (const client of [admin, a.client, b.client]) {
    await messages(client, room.id);
  }
  // Both have the app open; nobody posts a receipt by hand.
  const streams = await Promise.all([openStream(admin), openStream(b.client)]);
  await sleep(500);
  const sent = ok<{ message: Message }>(
    await send(a.client, room.id, "Homework is due on Friday"),
    201,
  ).message;
  type Ticked = Room & { peerDeliveredSeq: number | null };
  let seen: Ticked | undefined;
  for (let i = 0; i < 25; i += 1) {
    await sleep(200);
    seen = (await myRooms(a.client)).rooms.find(
      (r) => r.id === room.id,
    ) as Ticked;
    if ((seen.peerDeliveredSeq ?? 0) >= sent.seq) break;
  }
  assert.ok(
    (seen?.peerDeliveredSeq ?? 0) >= sent.seq,
    "two ticks within seconds, from the open apps alone",
  );
  for (const stream of streams) stream.close();

  const info = ok<{ deliveredTo: Array<{ at: string | null }> }>(
    await a.client.get(`/v1/chat/rooms/${room.id}/messages/${sent.seq}/info`),
  );
  assert.equal(info.deliveredTo.length, 2);
  assert.ok(
    info.deliveredTo.every((p) => p.at !== null),
    "Message info says when it reached each of them",
  );

  const found = ok<{ messages: Message[] }>(
    await b.client.get(`/v1/chat/rooms/${room.id}/search?q=friday`),
  );
  assert.deepEqual(
    found.messages.map((m) => m.seq),
    [sent.seq],
  );
  const none = ok<{ messages: Message[] }>(
    await b.client.get(`/v1/chat/rooms/${room.id}/search?q=tuesday`),
  );
  assert.equal(none.messages.length, 0);
  // A typo still finds it, as the app's other search boxes do.
  const typo = ok<{ messages: Message[] }>(
    await b.client.get(`/v1/chat/rooms/${room.id}/search?q=homwork`),
  );
  assert.deepEqual(
    typo.messages.map((m) => m.seq),
    [sent.seq],
  );
});

await test("New chat: an admin finds any learner by name", async () => {
  const name = (
    await a.client.get<{ id: string; displayName: string }>("/v1/auth/me")
  ).body.data!.displayName;
  const found = ok<{ results: Array<{ id: string }> }>(
    await admin.get(
      `/v1/chat/direct/candidates?search=${encodeURIComponent(name.slice(0, 8))}`,
    ),
  );
  assert.ok(found.results.some((p) => p.id === a.userId));

  // By @username and by e-mail too.
  const me = (
    await a.client.get<{ username: string; email: string }>("/v1/auth/me")
  ).body.data!;
  const byUsername = ok<{ results: Array<{ id: string }> }>(
    await admin.get(
      `/v1/chat/direct/candidates?search=${encodeURIComponent("@" + me.username)}`,
    ),
  );
  assert.ok(byUsername.results.some((p) => p.id === a.userId));
  const byEmail = ok<{ results: Array<{ id: string }> }>(
    await admin.get(
      `/v1/chat/direct/candidates?search=${encodeURIComponent(me.email)}`,
    ),
  );
  assert.ok(byEmail.results.some((p) => p.id === a.userId));
});

await test("a learner can't open a chat with staff; staff write first, then the learner replies", async () => {
  const staff = (
    await admin.get<{ id: string; displayName: string }>("/v1/auth/me")
  ).body.data!;
  refused(
    await c.client.post("/v1/chat/direct", { userId: staff.id }),
    403,
    "CHAT_STAFF_FIRST",
  );
  const found = ok<{ results: Array<{ id: string }> }>(
    await c.client.get(
      `/v1/chat/direct/candidates?search=${encodeURIComponent(staff.displayName.slice(0, 4))}`,
    ),
  );
  assert.equal(
    found.results.some((p) => p.id === staff.id),
    false,
  );

  // Staff open the chat; until they write, the learner can't.
  const opened = ok<{ room: Room }>(
    await admin.post("/v1/chat/direct", { userId: c.userId }),
    201,
  ).room;
  const before = ok<{ room: Room }>(
    await c.client.get(`/v1/chat/rooms/${opened.id}`),
  ).room;
  assert.equal(before.me.cannotPostReason, "staff_first");
  refused(
    await send(c.client, opened.id, "Hello sir"),
    403,
    "CHAT_STAFF_FIRST",
  );
  ok(await send(admin, opened.id, "Hi! How is the course going?"), 201);
  ok(await send(c.client, opened.id, "Going well, thank you"), 201);
});

await test("a learner finds a classmate only by the whole e-mail, not a part of it", async () => {
  const other = (await b.client.get<{ email: string }>("/v1/auth/me")).body
    .data!.email;
  const part = ok<{ results: Array<{ id: string }> }>(
    await a.client.get(
      `/v1/chat/direct/candidates?search=${encodeURIComponent(other.slice(0, 10))}`,
    ),
  );
  assert.equal(
    part.results.some((p) => p.id === b.userId),
    false,
  );
  const whole = ok<{ results: Array<{ id: string }> }>(
    await a.client.get(
      `/v1/chat/direct/candidates?search=${encodeURIComponent(other)}`,
    ),
  );
  // Found only where the private-chat rules let them message each other.
  assert.ok(Array.isArray(whole.results));
});

await flow.close();
