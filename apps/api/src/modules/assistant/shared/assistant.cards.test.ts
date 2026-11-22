import assert from "node:assert/strict";
import { test } from "node:test";

import { CHAT_BODY_MAX_BYTES, CHAT_BODY_MAX_CHARS } from "@veolms/contracts";

import { isFinishedState, renderCardBody } from "./assistant.cards.ts";

const base = {
  kind: "fix" as const,
  title: "Lesson 42 freezes at 39:26",
  state: "running" as const,
  steps: [
    { label: "Queued", state: "done" as const },
    { label: "Reading the code", state: "active" as const },
    { label: "Testing", state: "pending" as const },
  ],
  links: [
    { label: "Pull request", url: "https://github.com/veolms/veolms/pull/1" },
  ],
  stopRequested: false,
};

await test("renderCardBody: shows the kind, state, title, steps and links as chat text", () => {
  const body = renderCardBody(base);
  assert.equal(
    body,
    [
      "*Bug fix* · Working",
      "Lesson 42 freezes at 39:26",
      "",
      "✓ Queued",
      "… Reading the code",
      "○ Testing",
      "",
      "[Pull request](https://github.com/veolms/veolms/pull/1)",
    ].join("\n"),
  );
});

await test("renderCardBody: says Stopping while a stop is asked for and the work still runs", () => {
  assert.match(renderCardBody({ ...base, stopRequested: true }), /· Stopping/);
  assert.match(
    renderCardBody({ ...base, state: "done", stopRequested: true }),
    /· Done/,
  );
});

await test("renderCardBody: keeps a card with many long steps inside one chat message", () => {
  const steps = Array.from({ length: 20 }, (_, i) => ({
    label: `${"Step with a long description ".repeat(2)}${i}`.slice(0, 80),
    state: "done" as const,
  }));
  const links = Array.from({ length: 10 }, (_, i) => ({
    label: `Link ${i}`,
    url: `https://example.com/${"x".repeat(300)}/${i}`,
  }));
  const body = renderCardBody({ ...base, steps, links });
  assert.ok(body.length <= CHAT_BODY_MAX_CHARS);
  assert.ok(Buffer.byteLength(body) <= CHAT_BODY_MAX_BYTES);
  assert.match(body, /earlier steps/);
  assert.match(
    body,
    /Step with a long description Step with a long description 19/,
  );
});

await test("renderCardBody: removes brackets from link labels so links stay links", () => {
  const body = renderCardBody({
    ...base,
    links: [{ label: "PR [draft]", url: "https://github.com/x" }],
  });
  assert.match(body, /\[PR draft\]\(https:\/\/github\.com\/x\)/);
});

await test("isFinishedState: treats done, failed and stopped as finished", () => {
  assert.deepEqual(
    ["queued", "running", "waiting", "done", "failed", "stopped"].map((s) =>
      isFinishedState(s as never),
    ),
    [false, false, false, true, true, true],
  );
});
