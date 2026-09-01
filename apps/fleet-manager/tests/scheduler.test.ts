import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createScheduler } from "../src/core/scheduler.ts";
import { loadFleetManagerConfig } from "@veolms/config";

describe("Fleet Manager Dynamic Scheduler", () => {
  const config = loadFleetManagerConfig({
    MIN_CHECK_INTERVAL_SECONDS: "15",
    MAX_CHECK_INTERVAL_SECONDS: "300",
    DEFAULT_CHECK_INTERVAL_SECONDS: "30",
  });

  const scheduler = createScheduler(config);

  it("should schedule initial check at halfway of estimated duration", () => {
    // 600s estimated duration at 0% progress -> remaining 600s -> half is 300s (max bound)
    const result = scheduler.calculateNextCheck({
      estimatedDurationSec: 600,
      progressPercent: 0,
    });

    assert.equal(result.checkIntervalSec, 300);
    assert.ok(result.nextCheckAt.getTime() > Date.now());
  });

  it("should dynamically calculate intermediate check as progress advances", () => {
    // 600s estimated at 60% progress -> remaining 240s -> half is 120s
    const result = scheduler.calculateNextCheck({
      estimatedDurationSec: 600,
      progressPercent: 60,
    });

    assert.equal(result.checkIntervalSec, 120);
  });

  it("should clamp next check to minimum interval when nearing completion", () => {
    // 600s estimated at 95% progress -> remaining 30s -> half is 15s (min bound)
    const result = scheduler.calculateNextCheck({
      estimatedDurationSec: 600,
      progressPercent: 95,
    });

    assert.equal(result.checkIntervalSec, 15);
  });

  it("should immediately clamp to min interval when progress is >= 99%", () => {
    const result = scheduler.calculateNextCheck({
      estimatedDurationSec: 1000,
      progressPercent: 99.5,
    });

    assert.equal(result.checkIntervalSec, 15);
  });
});
