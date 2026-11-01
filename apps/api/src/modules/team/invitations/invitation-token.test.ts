import assert from "node:assert/strict";
import { test } from "node:test";
import {
  hashInvitationToken,
  invitationStatus,
  maskEmail,
  newInvitationToken,
} from "./invitation-token.ts";

const now = new Date("2026-10-19T12:00:00Z");
const later = new Date("2026-10-26T12:00:00Z");
const earlier = new Date("2026-10-12T12:00:00Z");

await test("a token is 32 random bytes and only its hash is kept", () => {
  const { token, tokenHash } = newInvitationToken();
  assert.equal(Buffer.from(token, "base64url").length, 32);
  assert.match(token, /^[A-Za-z0-9_-]+$/);
  assert.equal(tokenHash, hashInvitationToken(token));
  assert.notEqual(tokenHash, token);
  assert.notEqual(newInvitationToken().token, token);
});

await test("status: accepted and revoked win over expiry", () => {
  const base = { accepted_at: null, revoked_at: null, expires_at: later };
  assert.equal(invitationStatus(base, now), "pending");
  assert.equal(
    invitationStatus({ ...base, expires_at: earlier }, now),
    "expired",
  );
  assert.equal(
    invitationStatus(
      { ...base, expires_at: earlier, accepted_at: earlier },
      now,
    ),
    "accepted",
  );
  assert.equal(
    invitationStatus({ ...base, revoked_at: earlier }, now),
    "revoked",
  );
});

await test("the email hint shows a little of the address", () => {
  assert.equal(maskEmail("nilesh@getgtm.ai"), "ni***@getgtm.ai");
  assert.equal(maskEmail("ab@x.io"), "a***@x.io");
  assert.equal(maskEmail("a@x.io"), "a***@x.io");
});
