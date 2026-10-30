import assert from "node:assert/strict";
import { test } from "node:test";
import { fetchWithRetry, redactUrl } from "./http.ts";

await test("does not retry non-transient HTTP responses", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return new Response("bad request", { status: 400 });
  };
  try {
    await assert.rejects(
      fetchWithRetry("https://example.com/invalid", {
        attempts: 3,
        timeoutMs: 1000,
      }),
      /HTTP 400/,
    );
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

await test("stops retrying as soon as the import is cancelled", async () => {
  const originalFetch = globalThis.fetch;
  const controller = new AbortController();
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    controller.abort();
    return new Response("busy", { status: 503 });
  };
  try {
    await assert.rejects(
      fetchWithRetry("https://example.com/busy", {
        attempts: 5,
        signal: controller.signal,
      }),
    );
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

await test("keeps signed query strings out of error messages", () => {
  assert.equal(
    redactUrl(
      "https://rr1.googlevideo.com/videoplayback/seg.ts?sig=SECRET&expire=1",
    ),
    "https://rr1.googlevideo.com/videoplayback/seg.ts",
  );
});
