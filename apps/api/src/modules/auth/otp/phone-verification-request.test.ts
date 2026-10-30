import assert from "node:assert/strict";
import { test } from "node:test";

import {
  authUserSchema,
  phoneVerificationSendRequestSchema,
  phoneVerificationVerifyRequestSchema,
} from "@veolms/contracts";

// An international number is at most "+" and 15 digits. First-admin setup
// and the code service accept that; the profile's verification requests
// stopped at 15 characters, one short, so such a number could be stored at
// setup and never confirmed.

const fifteenDigits = `+${"4".repeat(15)}`;
const sixteenDigits = `+${"4".repeat(16)}`;

await test("a 15-digit number can be sent a verification code", () => {
  assert.equal(fifteenDigits.length, 16);
  assert.equal(
    phoneVerificationSendRequestSchema.safeParse({ phoneNo: fifteenDigits })
      .success,
    true,
  );
});

await test("a 15-digit number can be verified", () => {
  assert.equal(
    phoneVerificationVerifyRequestSchema.safeParse({
      phoneNo: fifteenDigits,
      code: "123456",
    }).success,
    true,
  );
});

await test("a 16-digit number is still refused", () => {
  assert.equal(
    phoneVerificationSendRequestSchema.safeParse({ phoneNo: sixteenDigits })
      .success,
    false,
  );
});

await test("a response can carry a stored 15-digit number", () => {
  assert.equal(
    authUserSchema.shape.phoneNo.safeParse(fifteenDigits).success,
    true,
  );
});
