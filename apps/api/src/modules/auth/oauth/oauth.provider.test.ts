import assert from "node:assert/strict";
import { test } from "node:test";

import {
  fetchOauthProfile,
  googleIdTokenToProfile,
  normalizeOauthProfile,
  type OauthProfile,
} from "./oauth.provider.ts";

// A provider returns an address in whatever case its owner entered it, and
// accounts are stored and looked up in lower case. Unchanged, a provider's
// "Ada@Example.com" matched no "ada@example.com" account and the sign-in
// created a second one.

const profile: OauthProfile = {
  email: "Ada@Example.com",
  name: "Ada Lovelace",
  username: "AdaL",
  providerUserId: "GH-00123-AbC",
  pictureUrl: "https://example.com/a.png",
};

await test("a provider profile's email address is lower-cased", () => {
  assert.equal(normalizeOauthProfile(profile).email, "ada@example.com");
});

await test("spaces around the email address are removed", () => {
  assert.equal(
    normalizeOauthProfile({ ...profile, email: "  Ada@Example.COM \n" }).email,
    "ada@example.com",
  );
});

await test("every spelling of an address becomes the one stored form", () => {
  const spellings = [
    "ada@example.com",
    "Ada@Example.com",
    "ADA@EXAMPLE.COM",
    " ada@Example.com ",
  ];
  const seen = new Set(
    spellings.map(
      (email) => normalizeOauthProfile({ ...profile, email }).email,
    ),
  );
  assert.deepEqual([...seen], ["ada@example.com"]);
});

await test("nothing else changes: the provider's id and the username keep their case", () => {
  assert.deepEqual(normalizeOauthProfile(profile), {
    ...profile,
    email: "ada@example.com",
  });
});

await test("a profile already in stored form is returned as it is", () => {
  const stored = { ...profile, email: "ada@example.com" };
  assert.equal(normalizeOauthProfile(stored), stored);
});

await test("a Google ID token's address comes out lower-cased", () => {
  const result = googleIdTokenToProfile(
    {
      iss: "https://accounts.google.com",
      aud: "client-id",
      sub: "1234567890",
      email: "Ada.Lovelace@Example.com",
      email_verified: true,
      name: "Ada Lovelace",
    },
    "client-id",
  );
  assert.equal(result.email, "ada.lovelace@example.com");
  assert.equal(result.providerUserId, "1234567890");
});

await test("the code-exchange path's address comes out lower-cased (mock code, no network)", async () => {
  const result = await fetchOauthProfile({
    provider: "github",
    code: "mock_Ada@Example.com",
    credentials: {},
    allowMockCodes: true,
  });
  assert.equal(result.email, "ada@example.com");
});

await test("a Google ID token's nonce claim is carried through to the profile", () => {
  const result = googleIdTokenToProfile(
    {
      iss: "https://accounts.google.com",
      aud: "client-id",
      sub: "1234567890",
      email: "Ada.Lovelace@Example.com",
      email_verified: true,
      name: "Ada Lovelace",
      nonce: "cryptographic_random_nonce_123",
    },
    "client-id",
  );
  assert.equal(result.nonce, "cryptographic_random_nonce_123");
});
