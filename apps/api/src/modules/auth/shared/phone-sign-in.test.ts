import assert from "node:assert/strict";
import { test } from "node:test";
import { otpSendRequestSchema } from "@veolms/contracts";
import {
  refusesPhoneSignInCode,
  refusesUnconfirmedPhoneSignIn,
} from "./auth.utils.ts";

const confirmed = new Date("2026-10-01T00:00:00Z");

await test("a student added by staff cannot sign in with the number staff typed", () => {
  // A mistyped number must not open the account to whoever holds it.
  assert.equal(
    refusesUnconfirmedPhoneSignIn("phone", { phone_verified_at: null }),
    true,
  );
});

await test("a confirmed number signs in", () => {
  assert.equal(
    refusesUnconfirmedPhoneSignIn("phone", { phone_verified_at: confirmed }),
    false,
  );
});

await test("an email sign-in is never refused by this rule", () => {
  assert.equal(
    refusesUnconfirmedPhoneSignIn("email", { phone_verified_at: null }),
    false,
  );
});

await test("phone sign-in sends a code to a confirmed number", () => {
  assert.equal(
    refusesPhoneSignInCode(
      { is_deleted: false, phone_verified_at: confirmed },
      true,
    ),
    false,
  );
});

await test("phone sign-in sends nothing to a number nobody confirmed", () => {
  assert.equal(
    refusesPhoneSignInCode(
      { is_deleted: false, phone_verified_at: null },
      true,
    ),
    true,
  );
});

await test("phone sign-in sends nothing to a number with no account", () => {
  assert.equal(refusesPhoneSignInCode(undefined, true), true);
});

await test("phone sign-in sends nothing to a deactivated account's number", () => {
  assert.equal(
    refusesPhoneSignInCode(
      { is_deleted: true, phone_verified_at: confirmed },
      true,
    ),
    true,
  );
});

await test("the sign-up form still sends a code to a new number", () => {
  assert.equal(refusesPhoneSignInCode(undefined, false), false);
});

await test("the sign-up form sends nothing to an account's unconfirmed number", () => {
  assert.equal(
    refusesPhoneSignInCode(
      { is_deleted: false, phone_verified_at: null },
      false,
    ),
    true,
  );
});

await test("a code request can say it is for signing in only", () => {
  assert.equal(
    otpSendRequestSchema.safeParse({
      phoneNo: "+919876543210",
      intent: "sign_in",
    }).success,
    true,
  );
});

await test("an unknown intent is refused", () => {
  assert.equal(
    otpSendRequestSchema.safeParse({ phoneNo: "+919876543210", intent: "x" })
      .success,
    false,
  );
});
