import assert from "node:assert/strict";
import { test } from "node:test";

import { directKey } from "./chat.access.ts";
import { presentMessage, preview } from "./chat.presenters.ts";
import type { MessageRow } from "./chat.repository.ts";

function row(overrides: Partial<MessageRow> = {}): MessageRow {
  return {
    room_id: "0b0b8c7e-4a8f-4bb0-9d2e-3a1c2b4d5e6f",
    seq: "4",
    id: "9a9a9a9a-1111-4111-8111-111111111111",
    version_seq: "10",
    sender_id: "11111111-1111-4111-8111-111111111111",
    sender_role: "learner",
    kind: "text",
    body: "secret text",
    reply_to_seq: null,
    mentions: ["22222222-2222-4222-8222-222222222222"],
    mention_all: false,
    reaction_counts: { "👍": 3 },
    attachments: [],
    pinned_at: null,
    created_at: new Date("2026-11-08T10:00:00Z"),
    edited_at: null,
    deleted_at: null,
    deleted_by: null,
    deleted_reason: null,
    sender_name: "Neha",
    sender_avatar: null,
    sender_deleted: false,
    deleted_by_name: null,
    reply_body: null,
    reply_attachments: null,
    reply_deleted_at: null,
    reply_sender_name: null,
    ...overrides,
  };
}

await test("a deleted message never carries its text, mentions or reactions", () => {
  const message = presentMessage(
    row({
      deleted_at: new Date(),
      deleted_by: "33333333-3333-4333-8333-333333333333",
      deleted_reason: "admin",
      deleted_by_name: "Vikram",
      pinned_at: new Date(),
    }),
  );
  assert.equal(message.body, "");
  assert.deepEqual(message.mentions, []);
  assert.deepEqual(message.reactions, {});
  assert.equal(message.pinned, false);
  assert.deepEqual(message.deleted, {
    by: "admin",
    byName: "Vikram",
    restorable: true,
  });
});

await test("an admin deletion stops being restorable after 7 days or once purged", () => {
  const old = presentMessage(
    row({
      deleted_at: new Date(Date.now() - 8 * 24 * 3600 * 1000),
      deleted_reason: "admin",
    }),
  );
  assert.equal(old.deleted?.restorable, false);
  const purged = presentMessage(
    row({ deleted_at: new Date(), deleted_reason: "admin", body: "" }),
  );
  assert.equal(purged.deleted?.restorable, false);
  const own = presentMessage(
    row({ deleted_at: new Date(), deleted_reason: "self" }),
  );
  assert.deepEqual(own.deleted, {
    by: "self",
    byName: null,
    restorable: false,
  });
});

await test("a deleted sender shows as Deleted user; replies to deleted messages hide their text", () => {
  const message = presentMessage(
    row({
      sender_deleted: true,
      sender_avatar: "https://example.invalid/a.png",
      reply_to_seq: "2",
      reply_body: "old",
      reply_deleted_at: new Date(),
      reply_sender_name: "Arjun",
    }),
  );
  assert.equal(message.sender?.name, "Deleted user");
  assert.equal(message.sender?.avatarUrl, null);
  assert.deepEqual(message.replyTo, {
    seq: 2,
    senderName: "Arjun",
    preview: "",
    deleted: true,
  });
});

await test("numbers arrive as numbers; previews are single-line and short", () => {
  const message = presentMessage(row());
  assert.equal(message.seq, 4);
  assert.equal(message.eventSeq, 10);
  assert.equal(preview("a\n\n  b"), "a b");
  assert.equal(preview("x".repeat(300)).length, 120);
});

await test("a private chat key is the same whoever starts it", () => {
  const a = "11111111-1111-4111-8111-111111111111";
  const b = "22222222-2222-4222-8222-222222222222";
  assert.equal(directKey(a, b), directKey(b, a));
  assert.equal(directKey(a, b), `${a}:${b}`);
});

await test("a reply to a photo carries the photo for the quote; a deleted one does not", () => {
  const photo = {
    id: "33333333-3333-4333-8333-333333333333",
    kind: "image" as const,
    name: "notes.jpg",
    mimeType: "image/jpeg",
    size: 1000,
    width: 800,
    height: 600,
    durationMs: null,
    waveform: null,
  };
  const quoted = presentMessage(
    row({ reply_to_seq: "2", reply_body: "", reply_attachments: [photo] }),
  );
  assert.equal(quoted.replyTo?.media?.kind, "image");
  assert.equal(quoted.replyTo?.media?.count, 1);
  assert.ok(quoted.replyTo?.media?.url.includes(photo.id));
  const gone = presentMessage(
    row({
      reply_to_seq: "2",
      reply_body: "",
      reply_attachments: [photo],
      reply_deleted_at: new Date(),
    }),
  );
  assert.equal(gone.replyTo?.media ?? null, null);
});
