import assert from "node:assert/strict";
import { test } from "node:test";

import {
  MAX_CHAT_PAYLOAD_BYTES,
  decodeChatEvent,
  encodeChatEvent,
  peekChatEvent,
} from "./chat-bus.ts";

const ROOM = "0b0b8c7e-4a8f-4bb0-9d2e-3a1c2b4d5e6f";
const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-8222-222222222222";

await test("a message event round-trips, JSON with '|' inside included", () => {
  const json = JSON.stringify({ body: "a|b|c", seq: 7 });
  const [payload] = encodeChatEvent({
    type: "message",
    roomId: ROOM,
    seq: 7,
    eventSeq: 12,
    json,
  });
  assert.ok(payload);
  assert.deepEqual(peekChatEvent(payload), { kind: "m", roomId: ROOM });
  assert.deepEqual(decodeChatEvent(payload), {
    type: "message",
    roomId: ROOM,
    seq: 7,
    eventSeq: 12,
    json,
  });
});

await test("a message too big for NOTIFY becomes a pointer", () => {
  const json = JSON.stringify({ body: "x".repeat(MAX_CHAT_PAYLOAD_BYTES) });
  const payloads = encodeChatEvent({
    type: "update",
    roomId: ROOM,
    seq: 3,
    eventSeq: 9,
    json,
  });
  assert.equal(payloads.length, 1);
  assert.ok(Buffer.byteLength(payloads[0]!) < 200);
  assert.deepEqual(decodeChatEvent(payloads[0]!), {
    type: "update",
    roomId: ROOM,
    seq: 3,
    eventSeq: 9,
    json: null,
  });
});

await test("multi-byte text is measured in bytes, not characters", () => {
  // 2,000 Devanagari characters are ~6,000 bytes: still one event.
  const json = JSON.stringify({ body: "क".repeat(2_000) });
  const [payload] = encodeChatEvent({
    type: "message",
    roomId: ROOM,
    seq: 1,
    eventSeq: 1,
    json,
  });
  assert.ok(Buffer.byteLength(payload!) <= MAX_CHAT_PAYLOAD_BYTES);
  assert.equal(decodeChatEvent(payload!)?.type, "message");
});

await test("long user lists and receipts are split under the payload limit", () => {
  const userIds = Array.from({ length: 600 }, () => crypto.randomUUID());
  const payloads = encodeChatEvent({ type: "added", roomId: ROOM, userIds });
  assert.ok(payloads.length > 1);
  const decoded = payloads.flatMap((payload) => {
    assert.ok(Buffer.byteLength(payload) <= MAX_CHAT_PAYLOAD_BYTES);
    const event = decodeChatEvent(payload);
    return event?.type === "added" ? event.userIds : [];
  });
  assert.deepEqual(decoded, userIds);

  const receipts = Array.from({ length: 300 }, () => ({
    roomId: ROOM,
    userId: crypto.randomUUID(),
    readSeq: 5,
    deliveredSeq: 6,
    direct: true,
  }));
  const receiptPayloads = encodeChatEvent({ type: "receipts", receipts });
  assert.ok(receiptPayloads.length > 1);
  const back = receiptPayloads.flatMap((payload) => {
    const event = decodeChatEvent(payload);
    return event?.type === "receipts" ? event.receipts : [];
  });
  assert.deepEqual(back, receipts);
});

await test("typing, room and removed events round-trip", () => {
  const typing = encodeChatEvent({
    type: "typing",
    roomId: ROOM,
    userId: USER_A,
    name: "Riya | S",
  });
  assert.deepEqual(decodeChatEvent(typing[0]!), {
    type: "typing",
    roomId: ROOM,
    userId: USER_A,
    name: "Riya   S",
  });
  const room = encodeChatEvent({ type: "room", roomId: ROOM, eventSeq: 44 });
  assert.deepEqual(decodeChatEvent(room[0]!), {
    type: "room",
    roomId: ROOM,
    eventSeq: 44,
  });
  const removed = encodeChatEvent({
    type: "removed",
    roomId: ROOM,
    userIds: [USER_A, USER_B],
  });
  assert.deepEqual(decodeChatEvent(removed[0]!), {
    type: "removed",
    roomId: ROOM,
    userIds: [USER_A, USER_B],
  });
});

await test("payloads that are not ours are ignored", () => {
  for (const payload of [
    "",
    "x",
    '{"v":1,"u":[]}',
    "m|not-a-uuid|1|1|{}",
    `m|${ROOM}|abc|1|{}`,
    `d|-|not json`,
    `z|${ROOM}`,
  ]) {
    assert.equal(decodeChatEvent(payload), null, payload);
  }
});

await test("a course group opening round-trips", () => {
  const [payload] = encodeChatEvent({ type: "opened", roomId: ROOM });
  assert.equal(payload, `o|${ROOM}`);
  assert.deepEqual(decodeChatEvent(payload!), { type: "opened", roomId: ROOM });
});

await test("a group's read positions round-trip", () => {
  const [payload] = encodeChatEvent({
    type: "group_read",
    roomId: ROOM,
    deliveredSeq: 41,
    readSeq: 39,
  });
  assert.deepEqual(decodeChatEvent(payload!), {
    type: "group_read",
    roomId: ROOM,
    deliveredSeq: 41,
    readSeq: 39,
  });
});

await test("presence carries the person and their private chats", () => {
  const OTHER_ROOM = "3c3c8c7e-4a8f-4bb0-9d2e-3a1c2b4d5e6f";
  const [online] = encodeChatEvent({
    type: "presence",
    userId: USER_A,
    online: true,
    lastSeenAt: null,
    roomIds: [ROOM, OTHER_ROOM],
  });
  assert.deepEqual(decodeChatEvent(online!), {
    type: "presence",
    userId: USER_A,
    online: true,
    lastSeenAt: null,
    roomIds: [ROOM, OTHER_ROOM],
  });
  const [away] = encodeChatEvent({
    type: "presence",
    userId: USER_B,
    online: false,
    lastSeenAt: 1_794_000_000_000,
    roomIds: [ROOM],
  });
  assert.deepEqual(decodeChatEvent(away!), {
    type: "presence",
    userId: USER_B,
    online: false,
    lastSeenAt: 1_794_000_000_000,
    roomIds: [ROOM],
  });
});
