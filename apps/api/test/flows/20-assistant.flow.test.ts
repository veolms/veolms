/**
 * The chat assistant ("Claude"), through the real API: admins and
 * instructors open a private chat with it, learners and teaching assistants
 * cannot (nor can they find it); what people write reaches the agent's inbox
 * once and stays there until acknowledged; the agent posts and updates a
 * status card long after chat's edit window, writes and attaches files as
 * the assistant, and hears about Stop clicks; a finished card cannot change;
 * a wrong token, the feature switched off and a lost role are all refused.
 */
// First: the environment, before the API's config is read below.
import { FLOW_AGENT_TOKEN } from "./setup/assistant-env.ts";
import "./setup/flow-env.ts";

import assert from "node:assert/strict";
import crypto from "node:crypto";
import { test } from "node:test";

import { CLAUDE_ASSISTANT_USER_ID, grantPlatformRole } from "@veolms/database";
import { sql } from "kysely";

import { SYSTEM_ROLES } from "../../../../packages/database/src/seed/rbac.ts";
import { config } from "../../src/config.ts";
import { getChatRuntime } from "../../src/modules/chat/shared/chat.runtime.ts";
import {
  signedInAdmin,
  signedUpLearner,
  startFlowApp,
  type FlowClient,
} from "./setup/flow-app.ts";

const flow = await startFlowApp();
const admin = await signedInAdmin(flow);
const adminId = (await admin.whoAmI())!;

const instructorAccount = await signedUpLearner(flow, "aiteacher");
await grantPlatformRole(flow.database, {
  userId: instructorAccount.userId,
  roleId: SYSTEM_ROLES.instructor.id,
});
const instructor = flow.visitor();
await instructor.signIn(instructorAccount.learner.email);

const taAccount = await signedUpLearner(flow, "aita");
await grantPlatformRole(flow.database, {
  userId: taAccount.userId,
  roleId: SYSTEM_ROLES.teaching_assistant.id,
});
const ta = flow.visitor();
await ta.signIn(taAccount.learner.email);

const { client: learner } = await signedUpLearner(flow, "ailearner");

/** The agent service: no cookies, only its token. */
const agent = flow.visitor();
function asAgent(token = FLOW_AGENT_TOKEN) {
  return { authorization: `Assistant ${token}` };
}
function agentGet<T>(url: string, token?: string) {
  return agent.request<T>("GET", url, undefined, asAgent(token));
}
function agentPost<T>(url: string, body: unknown, token?: string) {
  return agent.request<T>("POST", url, body, asAgent(token));
}
function agentPatch<T>(url: string, body: unknown) {
  return agent.request<T>("PATCH", url, body, asAgent());
}

type InboxItem =
  | {
      kind: "message";
      roomId: string;
      seq: number;
      body: string;
      sender: { id: string; platformRoles: string[] };
      attachments: Array<{ id: string; name: string }>;
    }
  | { kind: "stop"; roomId: string; cardId: string };

async function inbox(): Promise<InboxItem[]> {
  const response = await agentGet<{ items: InboxItem[] }>(
    "/v1/assistant/agent/inbox?waitSeconds=0",
  );
  assert.equal(response.status, 200, JSON.stringify(response.body));
  return response.body.data!.items;
}

async function send(client: FlowClient, roomId: string, body: string) {
  const response = await client.post<{ message: { seq: number } }>(
    `/v1/chat/rooms/${roomId}/messages`,
    { clientId: crypto.randomUUID(), body },
  );
  return response;
}

let adminRoom = "";

await test("admins and instructors find the assistant; others do not", async () => {
  const info = await admin.get<{
    available: boolean;
    roomId: string | null;
    online: boolean;
  }>("/v1/assistant");
  assert.equal(info.status, 200);
  assert.equal(info.body.data!.available, true);
  assert.equal(info.body.data!.roomId, null);
  assert.equal(info.body.data!.online, false);

  const opened = await admin.post<{ roomId: string }>(
    "/v1/assistant/conversation",
  );
  assert.equal(opened.status, 200);
  adminRoom = opened.body.data!.roomId;
  const again = await admin.post<{ roomId: string }>(
    "/v1/assistant/conversation",
  );
  assert.equal(again.body.data!.roomId, adminRoom, "one chat per person");

  const rooms = await admin.get<{
    rooms: Array<{ id: string; me: { pinned: boolean } }>;
  }>("/v1/chat/rooms");
  const row = rooms.body.data!.rooms.find((room) => room.id === adminRoom);
  assert.ok(row, "the chat is in the admin's list");
  assert.equal(row.me.pinned, true, "pinned for the admin");

  const instructorInfo = await instructor.get<{ available: boolean }>(
    "/v1/assistant",
  );
  assert.equal(instructorInfo.body.data!.available, true);
  const instructorRoom = await instructor.post<{ roomId: string }>(
    "/v1/assistant/conversation",
  );
  assert.equal(instructorRoom.status, 200);
  assert.notEqual(instructorRoom.body.data!.roomId, adminRoom);

  for (const outsider of [learner, ta]) {
    const outsiderInfo = await outsider.get<{
      available: boolean;
      roomId: string | null;
    }>("/v1/assistant");
    assert.equal(outsiderInfo.body.data!.available, false);
    assert.equal(outsiderInfo.body.data!.roomId, null);
    assert.equal(
      (await outsider.post("/v1/assistant/conversation")).status,
      403,
    );
    // The normal private-chat route does not know the assistant at all.
    const direct = await outsider.post("/v1/chat/direct", {
      userId: CLAUDE_ASSISTANT_USER_ID,
    });
    assert.equal(direct.status, 404);
    // Nor can they post into someone's assistant chat.
    assert.ok(
      [403, 404].includes((await send(outsider, adminRoom, "hi")).status),
    );
    assert.equal(
      (await outsider.get(`/v1/assistant/cards?roomId=${adminRoom}`)).status,
      404,
    );
  }

  const search = await admin.get<{ people?: Array<{ id: string }> }>(
    "/v1/chat/direct/candidates?search=Claude",
  );
  assert.equal(search.status, 200);
  assert.ok(
    !JSON.stringify(search.body).includes(CLAUDE_ASSISTANT_USER_ID),
    "the assistant is never found in people search",
  );
});

await test("the agent needs its token", async () => {
  assert.equal((await agent.get("/v1/assistant/agent/inbox")).status, 401);
  assert.equal(
    (await agentGet("/v1/assistant/agent/inbox", "not-the-token")).status,
    401,
  );
  // A signed-in admin's cookie is not a token either.
  assert.equal((await admin.get("/v1/assistant/agent/inbox")).status, 401);
});

await test("people's messages reach the inbox once, until acknowledged", async () => {
  const sent = await send(admin, adminRoom, "fix: lesson 42 freezes at 39:26");
  assert.equal(sent.status, 201, JSON.stringify(sent.body));
  const seq = sent.body.data!.message.seq;

  const first = await inbox();
  const item = first.find((i) => i.kind === "message" && i.seq === seq);
  assert.ok(item && item.kind === "message");
  assert.equal(item.body, "fix: lesson 42 freezes at 39:26");
  assert.equal(item.sender.id, adminId);
  assert.ok(item.sender.platformRoles.includes("admin"));

  // Not acknowledged yet: delivered again (the agent may have crashed).
  assert.ok((await inbox()).some((i) => i.kind === "message" && i.seq === seq));

  const ack = await agentPost("/v1/assistant/agent/inbox/ack", {
    messages: [{ roomId: adminRoom, seq }],
  });
  assert.equal(ack.status, 200);
  assert.ok(
    !(await inbox()).some(
      (i) => i.kind === "message" && i.roomId === adminRoom,
    ),
  );

  // An acknowledgement past the chat's newest message is ignored.
  await agentPost("/v1/assistant/agent/inbox/ack", {
    messages: [{ roomId: adminRoom, seq: seq + 50 }],
  });
  const next = await send(admin, adminRoom, "ask: and the other lesson?");
  assert.ok(
    (await inbox()).some(
      (i) => i.kind === "message" && i.seq === next.body.data!.message.seq,
    ),
  );
  await agentPost("/v1/assistant/agent/inbox/ack", {
    messages: [{ roomId: adminRoom, seq: next.body.data!.message.seq }],
  });
});

let cardId = "";

await test("status cards: posted once, updated after the edit window, Stop delivered", async () => {
  const request = await send(admin, adminRoom, "fix: the quiz timer skips");
  const requestSeq = request.body.data!.message.seq;
  cardId = crypto.randomUUID();

  const created = await agentPost<{
    card: { messageSeq: number; state: string };
  }>("/v1/assistant/agent/cards", {
    id: cardId,
    roomId: adminRoom,
    requestSeq,
    kind: "fix",
    title: "The quiz timer skips",
  });
  assert.equal(created.status, 200, JSON.stringify(created.body));
  const cardSeq = created.body.data!.card.messageSeq;
  assert.ok(cardSeq > requestSeq);
  const repeat = await agentPost<{ card: { messageSeq: number } }>(
    "/v1/assistant/agent/cards",
    {
      id: cardId,
      roomId: adminRoom,
      requestSeq,
      kind: "fix",
      title: "The quiz timer skips",
    },
  );
  assert.equal(
    repeat.body.data!.card.messageSeq,
    cardSeq,
    "the same card, not a second one",
  );

  // The agent's own messages never come back in its inbox.
  assert.ok(
    !(await inbox()).some((i) => i.kind === "message" && i.seq === cardSeq),
  );

  // Long after chat's 15-minute edit window, the card still updates.
  await sql`
    update chat_messages set created_at = now() - interval '2 hours'
    where room_id = ${adminRoom}::uuid and seq = ${cardSeq}
  `.execute(flow.database);
  const updated = await agentPatch<{ card: { state: string } }>(
    `/v1/assistant/agent/cards/${cardId}`,
    {
      state: "running",
      steps: [
        { label: "Queued", state: "done" },
        { label: "Reading the code", state: "active" },
      ],
      links: [
        { label: "Branch", url: "https://github.com/veolms/veolms/tree/x" },
      ],
    },
  );
  assert.equal(updated.status, 200, JSON.stringify(updated.body));
  const messages = await admin.get<{
    messages: Array<{ seq: number; body: string }>;
  }>(`/v1/chat/rooms/${adminRoom}/messages`);
  const card = messages.body.data!.messages.find((m) => m.seq === cardSeq);
  assert.match(card!.body, /Working/);
  assert.match(card!.body, /… Reading the code/);

  const cards = await admin.get<{
    cards: Array<{ id: string; state: string }>;
  }>(`/v1/assistant/cards?roomId=${adminRoom}`);
  assert.equal(cards.body.data!.cards[0]!.id, cardId);
  assert.equal(cards.body.data!.cards[0]!.state, "running");
  // Someone else cannot see or stop the admin's requests.
  assert.equal(
    (await instructor.get(`/v1/assistant/cards?roomId=${adminRoom}`)).status,
    404,
  );
  assert.equal(
    (await instructor.post(`/v1/assistant/cards/${cardId}/stop`)).status,
    404,
  );

  const stop = await admin.post<{ card: { stopRequested: boolean } }>(
    `/v1/assistant/cards/${cardId}/stop`,
  );
  assert.equal(stop.status, 200);
  assert.equal(stop.body.data!.card.stopRequested, true);
  const stops = (await inbox()).filter((i) => i.kind === "stop");
  assert.deepEqual(
    stops.map((s) => s.kind === "stop" && s.cardId),
    [cardId],
  );
  await agentPost("/v1/assistant/agent/inbox/ack", { stops: [cardId] });
  assert.ok(!(await inbox()).some((i) => i.kind === "stop"));

  const finished = await agentPatch(`/v1/assistant/agent/cards/${cardId}`, {
    state: "stopped",
  });
  assert.equal(finished.status, 200);
  const late = await agentPatch(`/v1/assistant/agent/cards/${cardId}`, {
    state: "running",
  });
  assert.equal(late.status, 409, "a finished request stays finished");
  assert.equal(
    (
      await agentPatch(`/v1/assistant/agent/cards/${crypto.randomUUID()}`, {
        state: "done",
      })
    ).status,
    404,
  );
});

await test("the agent writes and attaches files as the assistant", async () => {
  const clientId = crypto.randomUUID();
  const reply = await agentPost<{ seq: number; duplicate: boolean }>(
    `/v1/assistant/agent/rooms/${adminRoom}/messages`,
    { clientId, body: "Found it: the timer restarts on blur." },
  );
  assert.equal(reply.status, 201, JSON.stringify(reply.body));
  const retry = await agentPost<{ seq: number; duplicate: boolean }>(
    `/v1/assistant/agent/rooms/${adminRoom}/messages`,
    { clientId, body: "Found it: the timer restarts on blur." },
  );
  assert.equal(
    retry.body.data!.seq,
    reply.body.data!.seq,
    "a retry is not sent twice",
  );

  const png = Buffer.from(
    "89504e470d0a1a0a0000000d4948445200000001000000010806000000",
    "hex",
  );
  const upload = await agent.request<{ uploadId: string }>(
    "POST",
    `/v1/assistant/agent/rooms/${adminRoom}/uploads?name=after.png&mimeType=image/png`,
    png,
    { ...asAgent(), "content-type": "application/octet-stream" },
  );
  assert.equal(upload.status, 201, JSON.stringify(upload.body));
  const withFile = await agentPost<{ seq: number }>(
    `/v1/assistant/agent/rooms/${adminRoom}/messages`,
    {
      clientId: crypto.randomUUID(),
      body: "After the fix:",
      attachmentIds: [upload.body.data!.uploadId],
    },
  );
  assert.equal(withFile.status, 201, JSON.stringify(withFile.body));
  const messages = await admin.get<{
    messages: Array<{
      seq: number;
      sender: { id: string } | null;
      attachments: Array<{ name: string }>;
    }>;
  }>(`/v1/chat/rooms/${adminRoom}/messages`);
  const posted = messages.body.data!.messages.find(
    (m) => m.seq === withFile.body.data!.seq,
  );
  assert.equal(posted!.sender!.id, CLAUDE_ASSISTANT_USER_ID);
  assert.deepEqual(
    posted!.attachments.map((a) => a.name),
    ["after.png"],
  );

  const html = await agent.request(
    "POST",
    `/v1/assistant/agent/rooms/${adminRoom}/uploads?name=x.html&mimeType=text/html`,
    Buffer.from("<script>"),
    { ...asAgent(), "content-type": "application/octet-stream" },
  );
  assert.equal(html.status, 415);

  // Rooms that are not assistant chats are out of reach.
  assert.equal(
    (
      await agentPost(
        `/v1/assistant/agent/rooms/${crypto.randomUUID()}/messages`,
        {
          clientId: crypto.randomUUID(),
          body: "hello",
        },
      )
    ).status,
    404,
  );
});

await test("files people attach can be read by the agent", async () => {
  const started = await admin.post<{ uploadId: string; uploadUrl: string }>(
    `/v1/chat/rooms/${adminRoom}/uploads`,
    { kind: "image", name: "bug.png", mimeType: "image/png", size: 10 },
  );
  assert.equal(started.status, 200, JSON.stringify(started.body));
  flow.storage.upload(started.body.data!.uploadUrl);
  await admin.post(`/v1/chat/uploads/${started.body.data!.uploadId}/complete`);
  const sent = await admin.post<{ message: { seq: number } }>(
    `/v1/chat/rooms/${adminRoom}/messages`,
    {
      clientId: crypto.randomUUID(),
      body: "fix: see the screenshot",
      attachmentIds: [started.body.data!.uploadId],
    },
  );
  assert.equal(sent.status, 201, JSON.stringify(sent.body));
  const item = (await inbox()).find(
    (i) => i.kind === "message" && i.seq === sent.body.data!.message.seq,
  );
  assert.ok(item && item.kind === "message");
  assert.deepEqual(
    item.attachments.map((a) => a.name),
    ["bug.png"],
  );
  const file = await agentGet(
    `/v1/assistant/agent/rooms/${adminRoom}/uploads/${started.body.data!.uploadId}`,
  );
  assert.equal(file.status, 302, "a short-lived link to the file");
  await agentPost("/v1/assistant/agent/inbox/ack", {
    messages: [{ roomId: adminRoom, seq: sent.body.data!.message.seq }],
  });
});

await test("heartbeat shows the assistant online", async () => {
  assert.equal(
    (
      await agentPost("/v1/assistant/agent/heartbeat", {
        version: "test",
        running: 0,
        queued: 0,
      })
    ).status,
    200,
  );
  const info = await admin.get<{ online: boolean; problem: string | null }>(
    "/v1/assistant",
  );
  assert.equal(info.body.data!.online, true);
  assert.equal(info.body.data!.problem, null);
  await agentPost("/v1/assistant/agent/heartbeat", {
    running: 0,
    queued: 0,
    problem: "Claude is not signed in",
  });
  const withProblem = await admin.get<{ problem: string | null }>(
    "/v1/assistant",
  );
  assert.equal(withProblem.body.data!.problem, "Claude is not signed in");
});

await test("someone who loses the role is refused and their messages are dropped", async () => {
  const room = (
    await instructor.post<{ roomId: string }>("/v1/assistant/conversation")
  ).body.data!.roomId;
  const sent = await send(instructor, room, "ask: before losing the role");
  assert.equal(sent.status, 201);
  await sql`
    delete from role_assignments where user_id = ${instructorAccount.userId}::uuid
  `.execute(flow.database);
  await sql`
    delete from user_roles where user_id = ${instructorAccount.userId}::uuid
  `.execute(flow.database);
  getChatRuntime(flow.app, flow.database).access.forgetUser(
    instructorAccount.userId,
  );

  assert.ok(
    !(await inbox()).some((i) => i.kind === "message" && i.roomId === room),
    "nothing of theirs reaches the agent any more",
  );
  assert.equal((await send(instructor, room, "ask: after")).status, 403);
  assert.equal(
    (await instructor.get<{ available: boolean }>("/v1/assistant")).body.data!
      .available,
    false,
  );
});

await test("switched off, the assistant answers 404 everywhere", async () => {
  const mutable = config as { ASSISTANT_ENABLED: boolean };
  mutable.ASSISTANT_ENABLED = false;
  try {
    assert.equal((await admin.get("/v1/assistant")).status, 404);
    assert.equal((await agentGet("/v1/assistant/agent/inbox")).status, 404);
  } finally {
    mutable.ASSISTANT_ENABLED = true;
  }
});

await flow.close();
