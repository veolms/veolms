import assert from "node:assert/strict";
import { test } from "node:test";

import {
  chatMessageSentEventSchema,
  messagePushText,
  roomPushIconUrl,
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

await test("a group's notification picture: only a public copy, never a private icon", () => {
  const storage = {
    getPublicObjectUrl: (key: string) => `https://cdn.example.com/${key}`,
    isCdnPublicKey: (key: string) => key.startsWith("public/"),
  };
  const published = {
    thumbnail_url: null,
    media_id: "m1",
    media_storage_key: "public/thumbnails/m1/original.png",
  };
  const group = { kind: "course", icon_upload_id: null };

  assert.equal(
    roomPushIconUrl(group, published, storage),
    "https://cdn.example.com/public/thumbnails/m1/240.webp",
    "a published course's picture, at 240 px",
  );
  assert.equal(
    roomPushIconUrl(
      { kind: "course", icon_upload_id: "up1" },
      published,
      storage,
    ),
    null,
    "an admin's icon is private: no picture, not the course's",
  );
  assert.equal(
    roomPushIconUrl(
      { kind: "direct", icon_upload_id: null },
      published,
      storage,
    ),
    null,
  );
  assert.equal(
    roomPushIconUrl(
      group,
      {
        ...published,
        media_storage_key: "protected/thumbnails/m1/original.png",
      },
      storage,
    ),
    null,
    "an unpublished course's picture is private",
  );
  assert.equal(
    roomPushIconUrl(group, published, {
      ...storage,
      isCdnPublicKey: () => false,
    }),
    null,
    "not served publicly by the CDN",
  );
  assert.equal(
    roomPushIconUrl(
      group,
      {
        thumbnail_url: "https://cdn.example.com/old/course.jpg",
        media_id: null,
        media_storage_key: null,
      },
      storage,
    ),
    "https://cdn.example.com/old/course.jpg",
    "an older course with only an address",
  );
  assert.equal(
    roomPushIconUrl(
      group,
      {
        thumbnail_url: "/static/course.png",
        media_id: null,
        media_storage_key: null,
      },
      storage,
    ),
    null,
  );
  assert.equal(
    roomPushIconUrl({ kind: "team", icon_upload_id: null }, undefined, storage),
    null,
  );
});
