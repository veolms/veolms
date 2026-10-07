import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  isKnownNotificationPreferenceType,
  LEGACY_NOTIFICATION_TYPE_ALIASES,
  OPTIONAL_NOTIFICATION_TYPES,
} from "@veolms/contracts";

// The handlers build their intents inside functions that need a parsed
// event, so the type/mandatory pairs are read from the source instead.
const handlersSource = readFileSync(
  new URL("./notifications.handlers.ts", import.meta.url),
  "utf8",
);
const emitted = [
  ...handlersSource.matchAll(
    /\btype: "([^"]+)",[\s\S]*?\bmandatory: (true|false),/g,
  ),
].map((match) => ({ type: match[1]!, mandatory: match[2] === "true" }));

void describe("optional notification types", () => {
  void it("finds the notification types the handlers emit", () => {
    assert.ok(emitted.length >= 20, `only found ${emitted.length}`);
  });

  void it("lists every notification the server can send as optional", () => {
    const missing = emitted
      .filter((intent) => !intent.mandatory)
      .map((intent) => intent.type)
      .filter((type) => !OPTIONAL_NOTIFICATION_TYPES.includes(type));
    assert.deepEqual(
      missing,
      [],
      "add these to OPTIONAL_NOTIFICATION_GROUPS, or users cannot turn them off",
    );
  });

  void it("lists nothing the server does not send, and nothing mandatory", () => {
    const optionalEmitted = new Set(
      emitted
        .filter((intent) => !intent.mandatory)
        .map((intent) => intent.type),
    );
    const stale = OPTIONAL_NOTIFICATION_TYPES.filter(
      (type) => !optionalEmitted.has(type),
    );
    assert.deepEqual(stale, [], "these toggles would control nothing");
  });

  void it("has no type in two groups", () => {
    assert.equal(
      new Set(OPTIONAL_NOTIFICATION_TYPES).size,
      OPTIONAL_NOTIFICATION_TYPES.length,
    );
  });

  void it("maps legacy names only from real types", () => {
    for (const [current, legacy] of Object.entries(
      LEGACY_NOTIFICATION_TYPE_ALIASES,
    )) {
      assert.ok(OPTIONAL_NOTIFICATION_TYPES.includes(current), current);
      assert.ok(!OPTIONAL_NOTIFICATION_TYPES.includes(legacy), legacy);
    }
  });

  void it("accepts current and legacy names for preferences, nothing else", () => {
    assert.equal(isKnownNotificationPreferenceType("learning.reminder"), true);
    assert.equal(isKnownNotificationPreferenceType("comment.replied"), true);
    assert.equal(isKnownNotificationPreferenceType("auth.mfa_enabled"), false);
    assert.equal(isKnownNotificationPreferenceType("anything.else"), false);
  });
});
