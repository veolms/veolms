import assert from "node:assert/strict";
import { test } from "node:test";

import {
  chatMessageSentEventSchema,
  messagePushText,
} from "./chat-push.service.ts";

await test("a chat push line says what was sent", () => {
  assert.equal(messagePushText("See you  in\nclass", []), "See you in class");
  assert.equal(messagePushText("", [{ kind: "image" }]), "📷 Photo");
  assert.equal(messagePushText("", [{ kind: "audio" }]), "🎤 Voice message");
  assert.equal(
    messagePushText("", [{ kind: "image" }, { kind: "image" }]),
    "📷 Photo ×2",
  );
  assert.equal(messagePushText("Notes", [{ kind: "file" }]), "📄 Notes");
  assert.equal(
    messagePushText("", [{ kind: "image" }, { kind: "file" }]),
    "📷 Photo",
  );
});

await test("the chat.message_sent event is validated", () => {
  const event = {
    roomId: "7f0c2a4e-1d1b-4c55-9f7e-2a9b3c4d5e6f",
    messageId: "3f2a9c1e-8b7d-4e6f-a5c4-1b2d3e4f5a6b",
    seq: 12,
    senderId: "0b6d3a3c-58f3-4a8f-8d3e-3b0f6c1a2b3c",
  };
  assert.deepEqual(chatMessageSentEventSchema.parse(event), event);
  assert.throws(() => chatMessageSentEventSchema.parse({ ...event, seq: 0 }));
});
