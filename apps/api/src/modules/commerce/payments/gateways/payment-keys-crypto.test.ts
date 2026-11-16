import assert from "node:assert/strict";
import { test } from "node:test";

import {
  decryptPaymentSecretWith,
  encryptPaymentSecretWith,
} from "./payment-keys-crypto.ts";

const KEY = "a-payment-keys-encryption-key-of-at-least-32-chars";
const OTHER_KEY = "another-payment-keys-encryption-key-32-chars-long";
const SECRET = "rzp_secret_value_1234567890";

await test("a payment secret reads back with its key, in the v1 format", () => {
  const stored = encryptPaymentSecretWith(SECRET, KEY);
  assert.match(stored, /^v1:[0-9a-f]{24}:[0-9a-f]{32}:[0-9a-f]+$/u);
  assert.ok(!stored.includes(SECRET));
  assert.equal(decryptPaymentSecretWith(stored, KEY), SECRET);
});

await test("the same secret is stored differently every time", () => {
  assert.notEqual(
    encryptPaymentSecretWith(SECRET, KEY),
    encryptPaymentSecretWith(SECRET, KEY),
  );
});

await test("another key, or a changed value, does not decrypt", () => {
  const stored = encryptPaymentSecretWith(SECRET, KEY);
  assert.throws(() => decryptPaymentSecretWith(stored, OTHER_KEY));
  const parts = stored.split(":");
  const lastChar = parts[3]!.slice(-1) === "0" ? "1" : "0";
  const tampered = [
    ...parts.slice(0, 3),
    parts[3]!.slice(0, -1) + lastChar,
  ].join(":");
  assert.throws(() => decryptPaymentSecretWith(tampered, KEY));
});

await test("values in another format are refused, not guessed at", () => {
  assert.throws(() => decryptPaymentSecretWith("aa:bb:cc", KEY));
  assert.throws(() => decryptPaymentSecretWith("v2:aa:bb:cc", KEY));
});
