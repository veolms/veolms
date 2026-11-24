import assert from "node:assert/strict";
import { test } from "node:test";

import type { FastifyRequest } from "fastify";

import { assistantTokenOf, sha256Hex, tokenMatches } from "./assistant.http.ts";

function requestWith(authorization?: string) {
  return { headers: authorization ? { authorization } : {} } as FastifyRequest;
}

const token = "a".repeat(64);
const hash = sha256Hex(token);

await test("assistant agent token: reads only the Assistant scheme", () => {
  assert.equal(assistantTokenOf(requestWith(`Assistant ${token}`)), token);
  assert.equal(assistantTokenOf(requestWith(`Bearer ${token}`)), "");
  assert.equal(assistantTokenOf(requestWith("Assistant")), "");
  assert.equal(assistantTokenOf(requestWith()), "");
});

await test("assistant agent token: accepts the token whose SHA-256 is configured", () => {
  assert.equal(tokenMatches(token, hash), true);
});

await test("assistant agent token: refuses a wrong token, an empty token and a missing hash", () => {
  assert.equal(tokenMatches(`${token}x`, hash), false);
  assert.equal(tokenMatches("", hash), false);
  assert.equal(tokenMatches(token, undefined), false);
});
