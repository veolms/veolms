import assert from "node:assert/strict";
import { test } from "node:test";
import { createVeoLMSApi } from "@veolms/api-core";
import { courseSlugSchema } from "@veolms/contracts";

import { config } from "./config.ts";

/**
 * Fastify's router rejects a path parameter over 100 characters with a 414
 * before any route runs. Course slugs can be longer, so a published course
 * with one was listed but its detail page could not be opened. The factory
 * raises the router's limit; this pins it above the longest slug a course
 * may have.
 */
await test("the API routes a course slug of the longest allowed length", async () => {
  const longestSlug = "a".repeat(courseSlugSchema.maxLength ?? 0);
  assert.ok(longestSlug.length > 100);

  const app = await createVeoLMSApi({
    database: {} as never,
    logger: false,
    config,
    modulesDir: "",
  });
  app.get("/probe/:slug", async (request) => ({
    length: (request.params as { slug: string }).slug.length,
  }));

  try {
    const response = await app.inject(`/probe/${longestSlug}`);
    assert.equal(response.statusCode, 200);
    assert.equal(response.json().data.length, longestSlug.length);
  } finally {
    await app.close();
  }
});
