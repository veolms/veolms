/**
 * A learner's own files, through the real API (Chats > Settings > Media
 * storage): the list counts only uploaded files (never text), by kind;
 * deleting files frees the space at once; a chat message whose file was
 * deleted stays and says so, for everyone, while a forwarded copy keeps
 * working; nobody can delete someone else's file; restoring a deleted
 * message does not bring a deleted file back into the count; discussion
 * and support files are deleted too. An admin who blocks a learner also
 * turns down their open request for more space.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { grantPlatformRole } from "@veolms/database";

import { SYSTEM_ROLES } from "../../../../packages/database/src/seed/rbac.ts";
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
  title: "My Files Course",
  pricing: "free",
});
const ana = await signedUpLearner(flow, "filesa");
const ben = await signedUpLearner(flow, "filesb");
await enrollForFree(ana.client, course);
await enrollForFree(ben.client, course);

interface StorageFile {
  source: string;
  id: string;
  kind: string;
  name: string;
  size: number;
  unsent: boolean;
  url: string | null;
}
interface FileList {
  files: StorageFile[];
  total: number;
  totalBytes: number;
  kinds: Array<{ kind: string; count: number; bytes: number }>;
}
interface Message {
  seq: number;
  attachments: Array<{ id: string; name: string }>;
  removedFiles?: Array<{ kind: string; name: string }>;
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

async function used(client: FlowClient) {
  return ok<{ usedBytes: number }>(await client.get("/v1/storage/me"))
    .usedBytes;
}

async function myFiles(client: FlowClient, query = "") {
  return ok<FileList>(await client.get(`/v1/storage/me/files${query}`));
}

async function remove(
  client: FlowClient,
  files: Array<{ source: string; id: string }>,
) {
  return ok<{ deleted: number; freedBytes: number }>(
    await client.post("/v1/storage/me/files/delete", { files }),
  );
}

/** Uploads files and sends them in one message; returns it. */
async function sendFiles(
  client: FlowClient,
  files: Array<{ kind: "image" | "file"; size: number; name: string }>,
  body = "",
) {
  const ids: string[] = [];
  for (const file of files) {
    const started = ok<{ uploadId: string; uploadUrl: string }>(
      await client.post(`/v1/chat/rooms/${roomId}/uploads`, {
        kind: file.kind,
        name: file.name,
        mimeType: file.kind === "image" ? "image/jpeg" : "application/pdf",
        size: file.size,
      }),
    );
    flow.storage.upload(started.uploadUrl);
    ok(await client.post(`/v1/chat/uploads/${started.uploadId}/complete`));
    ids.push(started.uploadId);
  }
  return ok<{ message: Message }>(
    await client.post(`/v1/chat/rooms/${roomId}/messages`, {
      clientId: crypto.randomUUID(),
      body: body || `Files ${crypto.randomUUID().slice(0, 8)}`,
      attachmentIds: ids,
    }),
    201,
  ).message;
}

async function messageAs(client: FlowClient, seq: number) {
  const page = ok<{ messages: Message[] }>(
    await client.get(`/v1/chat/rooms/${roomId}/messages`),
  );
  const message = page.messages.find((m) => m.seq === seq);
  assert.ok(message, `message ${seq} is listed`);
  return message;
}

let roomId = "";

await test("the list has the learner's own files only, by kind; text never counts", async () => {
  roomId = ok<{ room: { id: string } }>(
    await admin.post(`/v1/chat/courses/${course.id}/room`),
  ).room.id;
  ok(
    await admin.patch(`/v1/chat/rooms/${roomId}/settings`, {
      postingPolicy: "everyone",
    }),
  );

  ok(
    await ana.client.post(`/v1/chat/rooms/${roomId}/messages`, {
      clientId: crypto.randomUUID(),
      body: "Only text: takes no space",
    }),
    201,
  );
  assert.equal(await used(ana.client), 0);

  await sendFiles(ana.client, [
    { kind: "image", size: 3_000, name: "one.jpg" },
    { kind: "image", size: 5_000, name: "two.jpg" },
  ]);
  await sendFiles(ana.client, [{ kind: "file", size: 9_000, name: "a.pdf" }]);
  await sendFiles(ben.client, [{ kind: "file", size: 1_000, name: "b.pdf" }]);

  const list = await myFiles(ana.client);
  assert.equal(list.total, 3);
  assert.equal(list.totalBytes, 17_000);
  assert.deepEqual(
    list.files.map((file) => [file.name, file.size, file.source]),
    [
      ["a.pdf", 9_000, "chat"],
      ["two.jpg", 5_000, "chat"],
      ["one.jpg", 3_000, "chat"],
    ],
    "biggest first, only Ana's",
  );
  assert.deepEqual(
    list.kinds.map((kind) => [kind.kind, kind.count, kind.bytes]),
    [
      ["image", 2, 8_000],
      ["video", 0, 0],
      ["audio", 0, 0],
      ["file", 1, 9_000],
    ],
  );
  const photos = await myFiles(ana.client, "?kind=image&sort=oldest");
  assert.deepEqual(
    photos.files.map((file) => file.name),
    ["one.jpg", "two.jpg"],
  );
  assert.equal(photos.total, 2);
  assert.ok(photos.files[0]?.url?.startsWith("/v1/chat/uploads/"));
});

await test("searching the files: typos, any order, with the kind chips, counts of what is found", async () => {
  const names = async (query: string) =>
    (await myFiles(ana.client, query)).files.map((file) => file.name);

  assert.deepEqual(await names("?q=two"), ["two.jpg"]);
  // A typo, and words in any order across name, chat and kind.
  assert.deepEqual(await names("?q=phtoo&sort=oldest"), ["one.jpg", "two.jpg"]);
  assert.deepEqual(await names("?q=docment%20course"), ["a.pdf"]);
  assert.deepEqual(await names("?q=files%20cours%20pdf"), ["a.pdf"]);

  const photos = await myFiles(ana.client, "?q=course&kind=image");
  assert.equal(photos.total, 2);
  assert.equal(photos.totalBytes, 8_000);
  // The chips count what the search finds, whatever kind is chosen.
  assert.deepEqual(
    photos.kinds.map((kind) => [kind.kind, kind.count]),
    [
      ["image", 2],
      ["video", 0],
      ["audio", 0],
      ["file", 1],
    ],
  );

  const page = await myFiles(ana.client, "?q=course&limit=1&offset=1");
  assert.equal(page.total, 3);
  assert.deepEqual(
    page.files.map((file) => file.name),
    ["two.jpg"],
    "paged like the unsearched list, biggest first",
  );

  const none = await myFiles(ana.client, "?q=zzzzzz");
  assert.equal(none.total, 0);
  assert.deepEqual(none.files, []);
  // Ben's b.pdf is never found by Ana: only her own a.pdf.
  assert.deepEqual(await names("?q=pdf"), ["a.pdf"]);
});

await test("deleting a chat file frees its space at once; the message stays and says the file was deleted", async () => {
  const sent = await sendFiles(
    ana.client,
    [
      { kind: "image", size: 2_000, name: "keep.jpg" },
      { kind: "image", size: 4_000, name: "gone.jpg" },
    ],
    "Two photos",
  );
  const gone = sent.attachments.find((file) => file.name === "gone.jpg")!;
  const before = await used(ana.client);

  // Ben forwards the message: his copy shares the stored file.
  ok(
    await ben.client.post("/v1/chat/forward", {
      fromRoomId: roomId,
      seqs: [sent.seq],
      toRoomIds: [roomId],
    }),
  );

  const result = await remove(ana.client, [{ source: "chat", id: gone.id }]);
  assert.deepEqual(result, { deleted: 1, freedBytes: 4_000 });
  assert.equal(await used(ana.client), before - 4_000);
  assert.equal(
    (await myFiles(ana.client)).files.some((file) => file.id === gone.id),
    false,
  );

  for (const viewer of [ana.client, ben.client]) {
    const message = await messageAs(viewer, sent.seq);
    assert.deepEqual(
      message.attachments.map((file) => file.name),
      ["keep.jpg"],
    );
    assert.deepEqual(message.removedFiles, [
      { kind: "image", name: "gone.jpg" },
    ]);
  }
  assert.equal(
    (await ben.client.get(`/v1/chat/uploads/${gone.id}`)).status,
    404,
    "the deleted file is gone for everyone",
  );

  // Ben's forwarded copy still opens.
  const page = ok<{ messages: Message[] }>(
    await ben.client.get(`/v1/chat/rooms/${roomId}/messages`),
  );
  const copy = page.messages
    .flatMap((message) => message.attachments)
    .find((file) => file.name === "gone.jpg");
  assert.ok(copy, "the forwarded copy is still in the chat");
  assert.notEqual(
    (await ben.client.get(`/v1/chat/uploads/${copy.id}`)).status,
    404,
  );

  // Deleting again, or someone else's file, deletes nothing.
  assert.deepEqual(
    await remove(ana.client, [{ source: "chat", id: gone.id }]),
    { deleted: 0, freedBytes: 0 },
  );
  const bens = (await myFiles(ben.client)).files[0]!;
  assert.deepEqual(
    await remove(ana.client, [{ source: "chat", id: bens.id }]),
    { deleted: 0, freedBytes: 0 },
  );
  assert.equal((await myFiles(ben.client)).total, 1);
});

await test("restoring a deleted message does not bring a deleted file back into the count", async () => {
  const sent = await sendFiles(ana.client, [
    { kind: "image", size: 1_500, name: "restore-a.jpg" },
    { kind: "image", size: 2_500, name: "restore-b.jpg" },
  ]);
  const b = sent.attachments.find((file) => file.name === "restore-b.jpg")!;
  await remove(ana.client, [{ source: "chat", id: b.id }]);
  const after = await used(ana.client);

  ok(
    await admin.delete(
      `/v1/chat/rooms/${roomId}/messages/${sent.seq}?for=everyone`,
    ),
  );
  assert.equal(await used(ana.client), after - 1_500);
  ok(await admin.post(`/v1/chat/rooms/${roomId}/messages/${sent.seq}/restore`));
  assert.equal(await used(ana.client), after);
  const message = await messageAs(ana.client, sent.seq);
  assert.deepEqual(
    message.attachments.map((file) => file.name),
    ["restore-a.jpg"],
  );
});

await test("many files at once, and discussion and support files too", async () => {
  // A note's attachment and a support attachment, as their upload routes
  // leave them (the streamed uploads themselves are covered elsewhere).
  const [discussion] = await flow.database
    .insertInto("learning_attachments")
    .values({
      id: crypto.randomUUID(),
      owner_id: ana.userId,
      kind: "image",
      storage_key: "discussion-uploads/flow-test.png",
      file_name: "diagram.png",
      file_url: "/v1/discussion-uploads/flow-test.png",
      mime_type: "image/png",
      file_size: 700,
      status: "ready",
    })
    .returning("id")
    .execute();
  const [support] = await flow.database
    .insertInto("support_attachments")
    .values({
      id: crypto.randomUUID(),
      owner_id: ana.userId,
      storage_key: "support-uploads/flow-test.pdf",
      file_name: "receipt.pdf",
      mime_type: "application/pdf",
      file_size: 300,
    })
    .returning("id")
    .execute();

  const before = await myFiles(ana.client, "?limit=100");
  const sources = new Set(before.files.map((file) => file.source));
  assert.deepEqual([...sources].sort(), ["chat", "discussion", "support"]);
  const kinds = Object.fromEntries(
    before.files.map((file) => [file.name, file.kind]),
  );
  assert.equal(kinds["diagram.png"], "image");
  assert.equal(kinds["receipt.pdf"], "file");

  const result = await remove(
    ana.client,
    before.files.map(({ source, id }) => ({ source, id })),
  );
  assert.equal(result.deleted, before.total);
  assert.equal(result.freedBytes, before.totalBytes);
  assert.equal(await used(ana.client), 0);
  assert.equal((await myFiles(ana.client)).total, 0);

  const note = await flow.database
    .selectFrom("learning_attachments")
    .select("status")
    .where("id", "=", discussion!.id)
    .executeTakeFirstOrThrow();
  assert.equal(note.status, "deleted", "posts stop showing it");
  const ticketFile = await flow.database
    .selectFrom("support_attachments")
    .select("id")
    .where("id", "=", support!.id)
    .executeTakeFirst();
  assert.equal(ticketFile, undefined);
});

await test("blocking a learner turns down their open request for more space", async () => {
  ok(await ben.client.post("/v1/storage/me/requests", { note: "More please" }));
  ok(
    await admin.post(`/v1/storage/learners/${ben.userId}/block`, {
      reason: "Spam uploads",
    }),
  );
  const view = ok<{
    state: string;
    request: { status: string; decisionNote: string | null } | null;
  }>(await ben.client.get("/v1/storage/me"));
  assert.equal(view.state, "blocked");
  assert.equal(view.request?.status, "declined");
  assert.equal(view.request?.decisionNote, "Spam uploads");

  const learners = ok<{ learners: Array<{ userId: string }> }>(
    await admin.get("/v1/storage/learners?filter=requested"),
  );
  assert.equal(
    learners.learners.some((learner) => learner.userId === ben.userId),
    false,
    "no longer among the requests",
  );
});

await test("an instructor sees every student's space but changes nothing", async () => {
  const account = await signedUpLearner(flow, "filesteacher");
  await grantPlatformRole(flow.database, {
    userId: account.userId,
    roleId: SYSTEM_ROLES.instructor.id,
  });
  const teacher = flow.visitor();
  await teacher.signIn(account.learner.email);

  const learners = ok<{ learners: Array<{ userId: string }> }>(
    await teacher.get("/v1/storage/learners"),
  );
  assert.ok(learners.learners.some((l) => l.userId === ben.userId));
  ok(await teacher.get(`/v1/storage/learners/${ben.userId}`));
  ok(await teacher.get("/v1/storage/settings"));

  for (const refused of [
    await teacher.post(`/v1/storage/learners/${ben.userId}/unblock`),
    await teacher.put(`/v1/storage/learners/${ben.userId}/limit`, {
      limitBytes: 5_000_000_000,
    }),
    await teacher.put("/v1/storage/settings", {
      defaultLimitBytes: 1_000_000,
    }),
  ]) {
    assert.equal(refused.status, 403);
  }
  // Their own uploads have no limit, as before.
  const own = ok<{ limitBytes: number | null }>(
    await teacher.get("/v1/storage/me"),
  );
  assert.equal(own.limitBytes, null);
});

await test("signed out: no files", async () => {
  const visitor = flow.visitor();
  assert.equal((await visitor.get("/v1/storage/me/files")).status, 401);
  assert.equal(
    (
      await visitor.post("/v1/storage/me/files/delete", {
        files: [{ source: "chat", id: crypto.randomUUID() }],
      })
    ).status,
    401,
  );
});

await flow.close();
