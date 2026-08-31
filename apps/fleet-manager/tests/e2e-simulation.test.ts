import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { calculateNextCheckInterval } from "../src/core/scheduler.ts";
import { calculateWorkerSpec } from "../src/core/worker-manager.ts";
import {
  DEFAULT_VIDEO_QUALITIES,
  type VideoQualityLevel,
} from "@veolms/fleet-types";

describe("Fleet Manager End-to-End Workflow Simulation", () => {
  it("should simulate a full lifecycle of multi-quality transcode workflow", () => {
    // 1. Client specifies requested qualities array
    const requestedQualities: readonly VideoQualityLevel[] = [
      "2160p",
      "1080p",
      "720p",
    ];

    // 2. Worker manager calculates scaled spec for 4K video
    const spec = calculateWorkerSpec({
      videoSize: 0,
      qualities: requestedQualities,
    });

    assert.equal(spec.cpu, 8); // Scaled up to 8 vCPU for 4K
    assert.equal(spec.memoryMb, 16384); // Scaled up to 16GB RAM
    assert.equal(spec.architecture, "arm64");

    // 3. Dynamic scheduler determines check intervals across progress milestones
    const estimatedDuration = 600; // 10 minutes

    // At 0% progress -> check at halfway (300s -> clamped to max 120s)
    const interval0 = calculateNextCheckInterval({
      progressPercentage: 0,
      estimatedDurationSeconds: estimatedDuration,
      minIntervalSeconds: 15,
      maxIntervalSeconds: 120,
    });
    assert.equal(interval0, 120);

    // At 50% progress -> remaining 300s / 2 = 150s -> clamped to max 120s
    const interval50 = calculateNextCheckInterval({
      progressPercentage: 50,
      estimatedDurationSeconds: estimatedDuration,
      minIntervalSeconds: 15,
      maxIntervalSeconds: 120,
    });
    assert.equal(interval50, 120);

    // At 90% progress -> remaining 60s / 2 = 30s
    const interval90 = calculateNextCheckInterval({
      progressPercentage: 90,
      estimatedDurationSeconds: estimatedDuration,
      minIntervalSeconds: 15,
      maxIntervalSeconds: 120,
    });
    assert.equal(interval90, 30);

    // At 99% progress -> clamped immediately to min interval (15s)
    const interval99 = calculateNextCheckInterval({
      progressPercentage: 99.5,
      estimatedDurationSeconds: estimatedDuration,
      minIntervalSeconds: 15,
      maxIntervalSeconds: 120,
    });
    assert.equal(interval99, 15);
  });

  it("should handle default standard quality transcode lifecycle correctly", () => {
    const spec = calculateWorkerSpec({
      videoSize: 0,
      qualities: DEFAULT_VIDEO_QUALITIES,
    });

    assert.equal(spec.cpu, 2);
    assert.equal(spec.memoryMb, 4096);
  });
});
