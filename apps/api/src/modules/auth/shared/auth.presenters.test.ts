import assert from "node:assert/strict";
import { test } from "node:test";

import {
  loginResponseSchema,
  userProfileResponseSchema,
} from "@veolms/contracts";

import { presentLogin, presentUserProfile } from "./auth.presenters.ts";
import type { MfaState, SessionUser } from "./auth.types.ts";
import { toUserProfileFields } from "./auth.utils.ts";

// An account created before names were bounded on write can hold a username
// over 30 characters or a display name over 100. The login and profile
// responses allow no more, so sent as stored every sign-in and every
// /auth/me for that account failed.

const mfa: MfaState = {
  mfaRequired: false,
  mfaMandatory: false,
  totpEnabled: false,
  passkeyEnabled: false,
};

function storedUser(username: string, displayName: string): SessionUser {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    username,
    display_name: displayName,
    email: "ada@example.com",
    phone_no: null,
    email_verified_at: new Date(),
    phone_verified_at: null,
    avatar_data_url: null,
    bio: null,
    email_public: false,
    mobile_public: false,
    linkedin_url: null,
    linkedin_public: false,
    github_url: null,
    github_public: false,
    website_url: null,
    website_public: false,
    is_deleted: false,
    mfa_mandatory: false,
    roles: ["student"],
  };
}

const longUsername = "a".repeat(40);
const longDisplayName = "N".repeat(150);

await test("a login payload for an over-long stored name fits its response", () => {
  const payload = presentLogin(storedUser(longUsername, longDisplayName), mfa);

  assert.equal(payload.user.username, "a".repeat(30));
  assert.equal(payload.user.displayName, "N".repeat(100));
  assert.equal(loginResponseSchema.safeParse(payload).success, true);
});

await test("a profile payload for an over-long stored name fits its response", () => {
  const user = storedUser(longUsername, longDisplayName);
  const payload = presentUserProfile(toUserProfileFields(user), ["student"], {
    mfaVerified: false,
    totpEnabled: false,
    passkeyEnabled: false,
    mfaMandatory: false,
  });

  assert.equal(payload.username.length, 30);
  assert.equal(payload.displayName.length, 100);
  assert.equal(userProfileResponseSchema.safeParse(payload).success, true);
});

await test("names within the limits are sent as stored", () => {
  const payload = presentLogin(storedUser("ada_lovelace", "Ada Lovelace"), mfa);

  assert.equal(payload.user.username, "ada_lovelace");
  assert.equal(payload.user.displayName, "Ada Lovelace");
});

await test("names exactly at the limits are not cut", () => {
  const payload = presentLogin(
    storedUser("b".repeat(30), "M".repeat(100)),
    mfa,
  );

  assert.equal(payload.user.username, "b".repeat(30));
  assert.equal(payload.user.displayName, "M".repeat(100));
});
