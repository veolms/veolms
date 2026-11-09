import assert from "node:assert/strict";
import { test } from "node:test";
import { z } from "zod";

import { classifyEmailFailure } from "./email-failure.ts";

function smtpError(
  responseCode: number,
  response: string,
  code = "EENVELOPE",
): Error {
  return Object.assign(new Error(response), { responseCode, response, code });
}

await test("a daily quota reply is a throttle, even as a 550", () => {
  const failure = classifyEmailFailure(
    smtpError(
      550,
      "550-5.4.5 Daily user sending limit exceeded. For more information on Gmail",
    ),
  );
  assert.equal(failure.kind, "throttled");
  assert.equal(failure.pauseLane, true);
  assert.equal(failure.suppress, false);
});

await test("421 and 45x replies pause the lane and keep the message", () => {
  for (const [code, response] of [
    [421, "421 4.7.0 Try again later, closing connection"],
    [451, "451 4.3.0 Temporary system problem"],
    [
      450,
      "450 4.2.1 The user you are trying to contact is receiving mail too quickly",
    ],
  ] as const) {
    const failure = classifyEmailFailure(smtpError(code, response));
    assert.equal(failure.kind, "throttled", response);
    assert.equal(failure.pauseLane, true, response);
  }
});

await test("a dead address is permanent and suppressed", () => {
  const failure = classifyEmailFailure(
    smtpError(
      550,
      "550-5.1.1 The email account that you tried to reach does not exist.",
    ),
  );
  assert.equal(failure.kind, "permanent");
  assert.equal(failure.suppress, true);
  assert.equal(failure.pauseLane, false);
});

await test("a policy refusal is permanent for the message and rests the lane", () => {
  const failure = classifyEmailFailure(
    smtpError(
      550,
      "550-5.7.26 This mail has been blocked because the sender is unauthenticated.",
    ),
  );
  assert.equal(failure.kind, "permanent");
  assert.equal(failure.suppress, false);
  assert.equal(failure.pauseLane, true);
});

await test("a full mailbox is tried again later", () => {
  const failure = classifyEmailFailure(
    smtpError(552, "552 5.2.2 Mailbox full"),
  );
  assert.equal(failure.kind, "transient");
  assert.equal(failure.suppress, false);
});

await test("broken credentials rest the lane instead of failing every message", () => {
  const failure = classifyEmailFailure(
    Object.assign(new Error("Invalid login"), {
      code: "EAUTH",
      responseCode: 535,
    }),
  );
  assert.equal(failure.kind, "throttled");
  assert.equal(failure.pauseLane, true);
});

await test("network errors keep the usual backoff", () => {
  const failure = classifyEmailFailure(
    Object.assign(new Error("connect ETIMEDOUT"), { code: "ETIMEDOUT" }),
  );
  assert.equal(failure.kind, "transient");
  assert.equal(failure.pauseLane, false);
  assert.equal(failure.suppress, false);
});

await test("an invalid queued payload is permanent and does not touch the address", () => {
  const result = z.strictObject({ subject: z.string() }).safeParse({});
  assert.equal(result.success, false);
  const failure = classifyEmailFailure(result.error);
  assert.equal(failure.kind, "permanent");
  assert.equal(failure.suppress, false);
});
