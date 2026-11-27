/**
 * Learners' storage space, through the real API: every learner's files
 * (chat, discussions, support) must fit in their space (2 GB unless an admin
 * changes it); an upload that does not fit, or any upload while blocked, is
 * refused; two uploads at once cannot both take the last space; deleting a
 * message gives its space back and a forwarded copy takes none; an unsent
 * upload stops counting once it expires; a learner asks for more and an
 * admin approves, declines or blocks, and every change is logged.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { STORAGE_DEFAULT_LIMIT_BYTES } from "@veolms/contracts";

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
  title: "Storage Course",
  pricing: "free",
});
const ana = await signedUpLearner(flow, "spacea");
const ben = await signedUpLearner(flow, "spaceb");
await enrollForFree(ana.client, course);
await enrollForFree(ben.client, course);

interface MyStorage {
  state: string;
  usedBytes: number;
  limitBytes: number | null;
  blocked: { at: string; reason: string | null } | null;
  request: {
    id: string;
    status: string;
    note: string | null;
    grantedLimitBytes: number | null;
    decisionNote: string | null;
  } | null;
}
interface Learner {
  userId: string;
  usedBytes: number;
  limitBytes: number;
  customLimit: boolean;
  blocked: { reason: string | null } | null;
  pendingRequest: { id: string; note: string | null } | null;
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

function refused(
  response: { status: number; body: { error?: { code?: string } } },
  status: number,
  code: string,
) {
  assert.equal(response.status, status, JSON.stringify(response.body.error));
  assert.equal(response.body.error?.code, code);
}

async function mine(client: FlowClient) {
  return ok<MyStorage>(await client.get("/v1/storage/me"));
}

async function setLimit(userId: string, limitBytes: number | null) {
  return ok<{ learner: Learner }>(
    await admin.put(`/v1/storage/learners/${userId}/limit`, { limitBytes }),
  ).learner;
}

function startUpload(client: FlowClient, size: number) {
  return client.post<{ uploadId: string; uploadUrl: string }>(
    `/v1/chat/rooms/${roomId}/uploads`,
    { kind: "file", name: "notes.pdf", mimeType: "application/pdf", size },
  );
}

/** Uploads a file and sends it in a message; returns the message's number. */
async function sendFile(client: FlowClient, size: number) {
  const started = ok(await startUpload(client, size));
  flow.storage.upload(started.uploadUrl);
  ok(await client.post(`/v1/chat/uploads/${started.uploadId}/complete`));
  const sent = ok<{ message: { seq: number } }>(
    await client.post(`/v1/chat/rooms/${roomId}/messages`, {
      clientId: crypto.randomUUID(),
      // A caption of its own: the same text three times in a minute is
      // refused as repeated.
      body: `File ${crypto.randomUUID().slice(0, 8)}`,
      attachmentIds: [started.uploadId],
    }),
    201,
  );
  return { seq: sent.message.seq, uploadId: started.uploadId };
}

/** What the database keeps for the person (the triggers' count). */
async function keptBytes(userId: string) {
  const row = await flow.database
    .selectFrom("user_storage")
    .select("used_bytes")
    .where("user_id", "=", userId)
    .executeTakeFirst();
  return Number(row?.used_bytes ?? 0);
}

let roomId = "";

await test("a learner has 2 GB to start with; staff have no limit", async () => {
  const room = ok<{ room: { id: string } }>(
    await admin.post(`/v1/chat/courses/${course.id}/room`),
  ).room;
  roomId = room.id;
  ok(
    await admin.patch(`/v1/chat/rooms/${roomId}/settings`, {
      postingPolicy: "everyone",
    }),
  );

  const learner = await mine(ana.client);
  assert.equal(learner.state, "ok");
  assert.equal(learner.usedBytes, 0);
  assert.equal(learner.limitBytes, STORAGE_DEFAULT_LIMIT_BYTES);
  assert.equal(learner.request, null);

  const staff = await mine(admin);
  assert.equal(staff.state, "unlimited");
  assert.equal(staff.limitBytes, null);
});

await test("a file that does not fit is refused; one that fits goes through and counts", async () => {
  await setLimit(ana.userId, 10_000);
  await sendFile(ana.client, 6_000);
  assert.equal((await mine(ana.client)).usedBytes, 6_000);
  assert.equal(await keptBytes(ana.userId), 6_000);

  refused(await startUpload(ana.client, 6_000), 403, "STORAGE_FULL");
  // Space is per person: someone else in the same group is not affected.
  ok(await startUpload(ben.client, 6_000));
  // Staff are never limited.
  ok(await startUpload(admin, 20_000));
  assert.equal(await keptBytes(ana.userId), 6_000, "a refusal takes nothing");
});

await test("two uploads at once cannot both take the last space", async () => {
  // 4,000 bytes free: of five 3,000-byte uploads started together, one fits.
  const answers = await Promise.all(
    Array.from({ length: 5 }, () => startUpload(ana.client, 3_000)),
  );
  const passed = answers.filter((answer) => answer.status === 200);
  assert.equal(passed.length, 1, answers.map((a) => a.status).join(","));
  for (const answer of answers.filter((a) => a.status !== 200)) {
    refused(answer, 403, "STORAGE_FULL");
  }
  // An unsent upload holds its space while it may still be sent.
  assert.equal(await keptBytes(ana.userId), 9_000);
  assert.equal((await mine(ana.client)).usedBytes, 9_000);
});

await test("an unsent upload stops counting once it has expired", async () => {
  // The upload left unsent above, a day and more later.
  await flow.database
    .updateTable("chat_uploads")
    .set({ created_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) })
    .where("owner_id", "=", ana.userId)
    .where("status", "=", "pending")
    .execute();
  // The learner's own view counts from the files at once...
  assert.equal((await mine(ana.client)).usedBytes, 6_000);
  // ...and an upload is not refused for it: the kept count is recomputed
  // before refusing.
  ok(await startUpload(ana.client, 3_500));
  assert.equal(await keptBytes(ana.userId), 9_500);
});

await test("deleting a message gives its space back; a forwarded copy takes none", async () => {
  await setLimit(ana.userId, 30_000);
  const { seq } = await sendFile(ana.client, 8_000);
  assert.equal((await mine(ana.client)).usedBytes, 17_500);

  const forwarded = ok<{
    results: Array<{ sent: number; error: string | null }>;
  }>(
    await ana.client.post("/v1/chat/forward", {
      fromRoomId: roomId,
      seqs: [seq],
      toRoomIds: [roomId],
    }),
  );
  assert.deepEqual(
    forwarded.results.map((r) => [r.sent, r.error]),
    [[1, null]],
  );
  assert.equal(
    (await mine(ana.client)).usedBytes,
    17_500,
    "a forwarded copy uses the same stored file",
  );

  ok(
    await ana.client.delete(
      `/v1/chat/rooms/${roomId}/messages/${seq}?for=everyone`,
    ),
  );
  assert.equal((await mine(ana.client)).usedBytes, 9_500);
  assert.equal(await keptBytes(ana.userId), 9_500);
});

await test("a learner asks for more space; an admin sees the request and approves it", async () => {
  await setLimit(ana.userId, 10_000);
  refused(await startUpload(ana.client, 2_000), 403, "STORAGE_FULL");

  const asked = ok<{ request: { id: string; status: string } }>(
    await ana.client.post("/v1/storage/me/requests", {
      note: "Project videos for the capstone",
    }),
  ).request;
  assert.equal(asked.status, "pending");
  // Asking again (a double tap) returns the same open request.
  const again = ok<{ request: { id: string } }>(
    await ana.client.post("/v1/storage/me/requests", {}),
  ).request;
  assert.equal(again.id, asked.id);

  const listed = ok<{
    learners: Learner[];
    summary: { pendingRequests: number };
  }>(await admin.get("/v1/storage/learners?filter=requested"));
  const row = listed.learners.find((l) => l.userId === ana.userId);
  assert.ok(row, "the learner is listed under requests");
  assert.equal(row.pendingRequest?.id, asked.id);
  assert.equal(row.pendingRequest?.note, "Project videos for the capstone");
  assert.ok(listed.summary.pendingRequests >= 1);

  const approved = ok<{ learner: Learner }>(
    await admin.post(`/v1/storage/requests/${asked.id}/approve`, {
      limitBytes: 50_000,
      note: "Granted for the capstone",
    }),
  ).learner;
  assert.equal(approved.limitBytes, 50_000);
  assert.equal(approved.customLimit, true);
  assert.equal(approved.pendingRequest, null);
  refused(
    await admin.post(`/v1/storage/requests/${asked.id}/approve`, {
      limitBytes: 1,
    }),
    409,
    "STORAGE_REQUEST_DECIDED",
  );

  const after = await mine(ana.client);
  assert.equal(after.limitBytes, 50_000);
  assert.equal(after.request?.status, "approved");
  assert.equal(after.request?.grantedLimitBytes, 50_000);
  assert.equal(after.request?.decisionNote, "Granted for the capstone");
  ok(await startUpload(ana.client, 2_000));
});

await test("a learner withdraws a request; an admin declines another", async () => {
  const first = ok<{ request: { id: string } }>(
    await ben.client.post("/v1/storage/me/requests", {}),
  ).request;
  const withdrawn = ok<{ request: { status: string } }>(
    await ben.client.post("/v1/storage/me/requests/cancel"),
  ).request;
  assert.equal(withdrawn.status, "cancelled");
  refused(
    await admin.post(`/v1/storage/requests/${first.id}/decline`, {}),
    409,
    "STORAGE_REQUEST_DECIDED",
  );

  const second = ok<{ request: { id: string } }>(
    await ben.client.post("/v1/storage/me/requests", { note: "More please" }),
  ).request;
  assert.notEqual(second.id, first.id);
  ok(
    await admin.post(`/v1/storage/requests/${second.id}/decline`, {
      note: "Please delete old videos first",
    }),
  );
  const view = await mine(ben.client);
  assert.equal(view.request?.status, "declined");
  assert.equal(view.request?.decisionNote, "Please delete old videos first");
  assert.equal(view.limitBytes, STORAGE_DEFAULT_LIMIT_BYTES);
});

await test("a blocked learner can upload nothing, anywhere, until unblocked", async () => {
  ok(
    await admin.post(`/v1/storage/learners/${ana.userId}/block`, {
      reason: "Uploading unrelated videos",
    }),
  );
  refused(await startUpload(ana.client, 10), 403, "STORAGE_BLOCKED");
  const lesson = course.lessons[0];
  assert.ok(lesson, "the course has a lesson");
  refused(
    await ana.client.post("/v1/attachments/initiate", {
      courseId: course.id,
      lessonId: lesson.id,
      fileName: "diagram.png",
      mimeType: "image/png",
      fileSize: 10,
    }),
    403,
    "STORAGE_BLOCKED",
  );
  const view = await mine(ana.client);
  assert.equal(view.state, "blocked");
  assert.equal(view.blocked?.reason, "Uploading unrelated videos");

  ok(await admin.post(`/v1/storage/learners/${ana.userId}/unblock`));
  ok(await startUpload(ana.client, 10));
  assert.equal((await mine(ana.client)).state, "ok");
});

await test("setting a limit back to the default; every change is logged with who made it", async () => {
  const reset = await setLimit(ana.userId, null);
  assert.equal(reset.limitBytes, STORAGE_DEFAULT_LIMIT_BYTES);
  assert.equal(reset.customLimit, false);

  const detail = ok<{
    events: Array<{ action: string; actor: { id: string } | null }>;
  }>(await admin.get(`/v1/storage/learners/${ana.userId}`));
  const actions = detail.events.map((event) => event.action);
  for (const action of [
    "set_limit",
    "request",
    "approve_request",
    "block",
    "unblock",
    "reset_limit",
  ]) {
    assert.ok(actions.includes(action), `${action} is logged`);
  }
  const request = detail.events.find((event) => event.action === "request");
  assert.equal(request?.actor?.id, ana.userId);
  const block = detail.events.find((event) => event.action === "block");
  assert.notEqual(block?.actor?.id, ana.userId, "the admin who blocked");
});

await test("only admins see or change anyone's space", async () => {
  refused(
    await ana.client.get("/v1/storage/learners"),
    403,
    "PERMISSION_DENIED",
  );
  refused(
    await ana.client.put(`/v1/storage/learners/${ben.userId}/limit`, {
      limitBytes: 1,
    }),
    403,
    "PERMISSION_DENIED",
  );
  refused(
    await ana.client.post(`/v1/storage/learners/${ana.userId}/unblock`),
    403,
    "PERMISSION_DENIED",
  );
  refused(
    await ana.client.put("/v1/storage/settings", { defaultLimitBytes: 1 }),
    403,
    "PERMISSION_DENIED",
  );
  refused(
    await admin.post("/v1/storage/me/requests", {}),
    400,
    "STORAGE_NOT_LIMITED",
  );
  // A member of staff is not on the students' list.
  const adminId = ok<{ id: string }>(await admin.get("/v1/auth/me")).id;
  refused(
    await admin.get(`/v1/storage/learners/${adminId}`),
    404,
    "STORAGE_LEARNER_NOT_FOUND",
  );
});

await test("the default limit applies to everyone without one of their own", async () => {
  ok(await admin.put("/v1/storage/settings", { defaultLimitBytes: 5_000 }));
  assert.equal((await mine(ben.client)).limitBytes, 5_000);
  refused(await startUpload(ben.client, 6_000), 403, "STORAGE_FULL");
  ok(
    await admin.put("/v1/storage/settings", {
      defaultLimitBytes: STORAGE_DEFAULT_LIMIT_BYTES,
    }),
  );
});

await flow.close();
