import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CONTACT_CHANGE_TTL_MS,
  contactChangeStep,
  maskEmail,
  maskPhone,
} from "./contact-change.rules.ts";

const created = new Date("2026-11-08T10:00:00Z");
const change = {
  current_proven_at: null as Date | null,
  new_value: null as string | null,
  expires_at: new Date(created.getTime() + CONTACT_CHANGE_TTL_MS),
  completed_at: null as Date | null,
};
const at = (ms: number) => new Date(created.getTime() + ms);

await test("a new change first proves the current value", () => {
  assert.equal(contactChangeStep(change, at(0)), "prove_current");
});

await test("once the current value is proven, the new one is chosen", () => {
  assert.equal(
    contactChangeStep({ ...change, current_proven_at: at(1) }, at(2)),
    "confirm_new",
  );
});

await test("a change lasts 15 minutes", () => {
  assert.equal(CONTACT_CHANGE_TTL_MS, 15 * 60 * 1000);
  assert.equal(
    contactChangeStep(change, at(CONTACT_CHANGE_TTL_MS - 1)),
    "prove_current",
  );
  assert.equal(contactChangeStep(change, at(CONTACT_CHANGE_TTL_MS)), "expired");
});

await test("a completed change is done for good, even before it would expire", () => {
  assert.equal(
    contactChangeStep(
      { ...change, current_proven_at: at(1), completed_at: at(2) },
      at(3),
    ),
    "completed",
  );
});

await test("an email is shown with most of its name hidden", () => {
  assert.equal(maskEmail("nilesh@getgtm.ai"), "n*****@getgtm.ai");
  assert.equal(maskEmail("a@b.co"), "a*@b.co");
});

await test("a number is shown with only its last four digits", () => {
  assert.equal(maskPhone("+919876543210"), "+91 •••••• 3210");
  assert.equal(maskPhone("+14155550123"), "+1 •••••• 0123");
});

await test("a number's calling code is read, not guessed from its length", () => {
  // Nine national digits: "all but the last ten" would have said "+9".
  assert.equal(maskPhone("+971501234567"), "+971 •••••• 4567");
  assert.equal(maskPhone("+61412345678"), "+61 •••••• 5678");
});

await test("a number with a calling code not on the list shows no code", () => {
  assert.equal(maskPhone("+99912345678"), "•••••• 5678");
});
