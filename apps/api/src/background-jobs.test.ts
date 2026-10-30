import assert from "node:assert/strict";
import { test } from "node:test";
import { loadCoreBackgroundJobs } from "@veolms/api-core";

/**
 * The cloud API gets core's background jobs only through this loader, which
 * finds this app's background-jobs.ts by path. If the file moves or the export
 * is renamed, cloud silently loses the payment webhook queue and notification
 * delivery, so the path is pinned here.
 */
await test("loadCoreBackgroundJobs returns this app's registerBackgroundJobs", async () => {
  const { registerBackgroundJobs } = await import("./background-jobs.ts");
  const loaded = await loadCoreBackgroundJobs();
  assert.equal(loaded, registerBackgroundJobs);
});
