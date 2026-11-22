import assert from "node:assert/strict";
import { test } from "node:test";

import type { ChatMessage } from "@veolms/contracts";

import { isAgentUploadType } from "./agent.service.ts";
import { isValidAck, planInboxPage } from "./agent.inbox.ts";

const ASSISTANT = "00000000-0000-4000-a000-000000000001";
const PERSON = "11111111-1111-4111-8111-111111111111";

function message(
  seq: number,
  senderId: string | null,
  patch: Partial<ChatMessage> = {},
): ChatMessage {
  return {
    id: `00000000-0000-4000-8000-${String(seq).padStart(12, "0")}`,
    roomId: "22222222-2222-4222-8222-222222222222",
    seq,
    eventSeq: seq,
    kind: "text",
    sender: senderId
      ? { id: senderId, name: "Someone", avatarUrl: null, role: "admin" }
      : null,
    body: `message ${seq}`,
    replyTo: null,
    mentions: [],
    mentionAll: false,
    reactions: {},
    attachments: [],
    pinned: false,
    createdAt: new Date(0).toISOString(),
    editedAt: null,
    deleted: null,
    ...patch,
  } as ChatMessage;
}

await test("planInboxPage: delivers people's messages and never the assistant's own", () => {
  const plan = planInboxPage(
    [message(1, PERSON), message(2, ASSISTANT), message(3, PERSON)],
    ASSISTANT,
  );
  assert.deepEqual(
    plan.deliver.map((m) => m.seq),
    [1, 3],
  );
  assert.equal(plan.skipTo, null);
});

await test("planInboxPage: skips deleted, system and empty messages", () => {
  const plan = planInboxPage(
    [
      message(1, PERSON, {
        deleted: { by: "self", byName: null, restorable: false },
      }),
      message(2, null, { kind: "system" }),
      message(3, PERSON, { body: "   " }),
    ],
    ASSISTANT,
  );
  assert.deepEqual(plan.deliver, []);
  assert.equal(plan.skipTo, 3);
});

await test("planInboxPage: delivers a message that only has files", () => {
  const plan = planInboxPage(
    [
      message(4, PERSON, {
        body: "",
        attachments: [
          {
            id: "33333333-3333-4333-8333-333333333333",
            kind: "image",
            name: "screen.png",
            mimeType: "image/png",
            size: 10,
            width: 1,
            height: 1,
            durationMs: null,
            waveform: null,
            url: "/x",
          },
        ],
      }),
    ],
    ASSISTANT,
  );
  assert.deepEqual(
    plan.deliver.map((m) => m.seq),
    [4],
  );
});

await test("planInboxPage: moves past a page holding only the assistant's replies", () => {
  const plan = planInboxPage(
    [message(7, ASSISTANT), message(8, ASSISTANT)],
    ASSISTANT,
  );
  assert.deepEqual(plan.deliver, []);
  assert.equal(plan.skipTo, 8);
});

await test("planInboxPage: does nothing on an empty page", () => {
  assert.deepEqual(planInboxPage([], ASSISTANT), {
    deliver: [],
    skipTo: null,
  });
});

await test("isValidAck: accepts positions within the room's messages only", () => {
  assert.equal(isValidAck(5, 9), true);
  assert.equal(isValidAck(9, 9), true);
  assert.equal(isValidAck(10, 9), false);
  assert.equal(isValidAck(0, 9), false);
  assert.equal(isValidAck(3, undefined), false);
});

await test("isAgentUploadType: allows previewable and safe files only", () => {
  for (const ok of [
    "image/png",
    "image/jpeg",
    "video/mp4",
    "application/pdf",
    "application/json",
    "text/plain; charset=utf-8",
    "application/zip",
  ]) {
    assert.equal(isAgentUploadType(ok), true, ok);
  }
  for (const bad of [
    "text/html",
    "application/javascript",
    "image/svg+xml",
    "application/x-sh",
  ]) {
    assert.equal(isAgentUploadType(bad), false, bad);
  }
});
