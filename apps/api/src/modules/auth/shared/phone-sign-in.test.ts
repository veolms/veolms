import assert from "node:assert/strict";
import { test } from "node:test";
import { refusesUnconfirmedPhoneSignIn } from "./auth.utils.ts";

const confirmed = new Date("2026-10-01T00:00:00Z");

await test("a student added by staff cannot sign in with the number staff typed", () => {
  // Email and number both unconfirmed: a mistyped number must not open the
  // account to whoever holds it.
  assert.equal(
    refusesUnconfirmedPhoneSignIn("phone", {
      email: "ada@example.com",
      phone_verified_at: null,
    }),
    true,
  );
});

await test("an unconfirmed number is refused when the email is confirmed too", () => {
  assert.equal(
    refusesUnconfirmedPhoneSignIn("phone", {
      email: "ada@example.com",
      phone_verified_at: null,
    }),
    true,
  );
});

await test("a confirmed number signs in", () => {
  assert.equal(
    refusesUnconfirmedPhoneSignIn("phone", {
      email: "ada@example.com",
      phone_verified_at: confirmed,
    }),
    false,
  );
});

await test("an account with no email keeps its number as its way in", () => {
  assert.equal(
    refusesUnconfirmedPhoneSignIn("phone", {
      email: null,
      phone_verified_at: null,
    }),
    false,
  );
});

await test("an email sign-in is never refused by this rule", () => {
  assert.equal(
    refusesUnconfirmedPhoneSignIn("email", {
      email: "ada@example.com",
      phone_verified_at: null,
    }),
    false,
  );
});
