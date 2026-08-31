import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolveDefaultUploadConcurrency } from "@veolms/config";
import { sampleResourceUsage } from "../src/resource-monitor.ts";

describe("sampleResourceUsage", () => {
  it("returns CPU and memory percentages within a valid 0-100 range", async () => {
    const usage = await sampleResourceUsage(20);

    assert.ok(usage.cpuPercent >= 0 && usage.cpuPercent <= 100);
    assert.ok(usage.memoryPercent >= 0 && usage.memoryPercent <= 100);
  });
});

describe("resolveDefaultUploadConcurrency", () => {
  it("stays within the floor/ceiling regardless of the running machine's specs", () => {
    const { maxConcurrency, minConcurrency } =
      resolveDefaultUploadConcurrency();

    assert.ok(Number.isInteger(maxConcurrency));
    assert.ok(Number.isInteger(minConcurrency));
    assert.ok(maxConcurrency >= 4 && maxConcurrency <= 32);
    assert.ok(minConcurrency >= 2);
    assert.ok(minConcurrency < maxConcurrency);
  });
});
