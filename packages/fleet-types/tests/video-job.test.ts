import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  estimateJobHardware,
  resolveJobHardware,
  resolveMachineProfile,
  videoJobStatusSchema,
  JOB_STATUSES,
} from "../src/video-job.ts";
import {
  workerStatusSchema,
  workerSpecSchema,
  WORKER_STATUSES,
} from "../src/worker.ts";
import { progressUpdateSchema } from "../src/monitoring.ts";

describe("Job & Worker Schemas and Contracts", () => {
  it("should validate all job statuses", () => {
    for (const status of JOB_STATUSES) {
      assert.equal(videoJobStatusSchema.parse(status), status);
    }
  });

  it("should validate all worker statuses", () => {
    for (const status of WORKER_STATUSES) {
      assert.equal(workerStatusSchema.parse(status), status);
    }
  });

  it("estimates baseline hardware for a small standard-quality job", () => {
    const hw = estimateJobHardware(0, ["720p"]);
    assert.equal(hw.minCpu, 2);
    assert.equal(hw.minMemoryMb, 4096);
    assert.equal(hw.storageGb, 30);
    assert.equal(hw.architecture, "arm64");
    assert.equal(hw.profile, "micro");
  });

  it("scales cpu/memory/storage up for 2160p regardless of size", () => {
    const hw = estimateJobHardware(0, ["2160p", "1080p"]);
    assert.equal(hw.minCpu, 8);
    assert.equal(hw.minMemoryMb, 16384);
    assert.equal(hw.storageGb, 80);
    assert.equal(hw.profile, "medium");
  });

  it("scales up when 5+ qualities are requested even without 1440p/2160p", () => {
    const hw = estimateJobHardware(0, [
      "1080p",
      "720p",
      "480p",
      "360p",
      "240p",
    ]);
    assert.equal(hw.minCpu, 4);
    assert.equal(hw.minMemoryMb, 8192);
    assert.equal(hw.profile, "small");
  });

  describe("resolveMachineProfile — metadata-driven sizing", () => {
    it("falls back to the exact legacy qualities-only profile when no metadata is available", () => {
      assert.equal(resolveMachineProfile(["720p"]), "micro");
      assert.equal(resolveMachineProfile(["1440p", "1080p"]), "small");
      assert.equal(resolveMachineProfile(["2160p"]), "medium");
      assert.equal(resolveMachineProfile(["720p"], null), "micro");
      assert.equal(resolveMachineProfile(["720p"], undefined), "micro");
    });

    it("bumps a low-quality-count job up when the source is 4K/60fps/HEVC — a heavier decode than the requested output implies", () => {
      const profile = resolveMachineProfile(["480p"], {
        width: 3840,
        height: 2160,
        fps: 60,
        codec: "hevc",
      });
      assert.equal(profile, "large");
    });

    it("never lets qualities alone imply nano — only confirmed-small metadata can", () => {
      // Same low qualities count, but no metadata: stays at the legacy
      // micro floor, never guesses down to nano.
      assert.equal(resolveMachineProfile(["360p"]), "micro");
    });

    it("steps down to nano only when metadata confirms a small, simple source with a low quality count", () => {
      const profile = resolveMachineProfile(["360p"], {
        width: 640,
        height: 360,
        fps: 24,
        codec: "h264",
      });
      assert.equal(profile, "nano");
    });

    it("does not step down to nano when 3+ qualities are requested even for a small source", () => {
      const profile = resolveMachineProfile(["480p", "360p", "240p"], {
        width: 640,
        height: 360,
        fps: 24,
        codec: "h264",
      });
      assert.equal(profile, "micro");
    });

    it("clamps at large instead of exceeding it for an extreme 8K/120fps/AV1 source", () => {
      const profile = resolveMachineProfile(["2160p"], {
        width: 7680,
        height: 4320,
        fps: 120,
        codec: "av1",
      });
      assert.equal(profile, "large");
    });
  });

  describe("estimateJobHardware — with videoMetadata", () => {
    it("uses videoMetadata.durationSeconds when no explicit duration is given", () => {
      const hw = estimateJobHardware(0, ["720p"], {
        videoMetadata: { durationSeconds: 3600 },
      });
      assert.equal(hw.estimatedDurationSeconds, 3600);
    });

    it("prefers an explicit durationSeconds over videoMetadata.durationSeconds", () => {
      const hw = estimateJobHardware(0, ["720p"], {
        durationSeconds: 1200,
        videoMetadata: { durationSeconds: 3600 },
      });
      assert.equal(hw.estimatedDurationSeconds, 1200);
    });
  });

  describe("resolveJobHardware", () => {
    it("is a pure function of (video_size, qualities, video_metadata) — same row, same result", () => {
      const job = {
        video_size: 0,
        qualities: ["480p"] as const,
        video_metadata: { width: 3840, height: 2160, fps: 60, codec: "hevc" },
      };
      const first = resolveJobHardware(job);
      const second = resolveJobHardware(job);
      assert.deepEqual(first, second);
      assert.equal(first.profile, "large");
    });

    it("treats a null video_metadata (not probed) the same as absent metadata", () => {
      const hw = resolveJobHardware({
        video_size: 0,
        qualities: ["720p"],
        video_metadata: null,
      });
      assert.equal(hw.profile, "micro");
    });
  });

  it("scales storage and estimated duration up for a large source video", () => {
    const small = estimateJobHardware(1024, ["720p"]);
    const large = estimateJobHardware(50 * 1024 ** 3, ["720p"]);
    assert.ok(large.storageGb > small.storageGb);
    assert.ok(large.estimatedDurationSeconds > small.estimatedDurationSeconds);
  });

  it("calculates storage correctly for a 1GB, 2-hour video producing multiple HLS qualities", () => {
    // 1 GB file, 2 hours (7200 seconds) duration, qualities: 1080p, 720p, 480p, 360p
    const oneGb = 1024 ** 3;
    const durationSeconds = 7200; // 2 hours
    const qualities = ["1080p", "720p", "480p", "360p"] as const;

    const hw = estimateJobHardware(oneGb, qualities, durationSeconds);

    // 1080p (4628kbps) + 720p (2528kbps) + 480p (1296kbps) + 360p (896kbps) = 9348 kbps
    // Output = 7200s * (9348000 / 8) bytes = ~7.83 GB
    // Source = 1 GB
    // Safety margin = 10 GB
    // Total = ceil(1 + 7.83 + 10) = 19 GB (clamped to baseline 30 GB)
    assert.equal(hw.storageGb, 30);
    assert.equal(hw.estimatedDurationSeconds, 7200);

    // If requesting 2160p (4K), 1440p, 1080p, 720p for a 4-hour video (14400s)
    const long4kDuration = 14400; // 4 hours
    const highQualities = ["2160p", "1440p", "1080p", "720p"] as const;
    const hw4k = estimateJobHardware(
      5 * 1024 ** 3,
      highQualities,
      long4kDuration,
    );

    // Total bitrate = 14192 + 8192 + 4628 + 2528 = 29540 kbps = 3.6925 MB/s
    // Output = 14400 * 3.6925 MB = ~53.17 GB
    // Source = 5 GB
    // Margin = 10 GB
    // Total = ceil(5 + 53.17 + 10) = 69 GB (clamped to 4K baseline min 80 GB)
    assert.ok(hw4k.storageGb >= 80);
    assert.equal(hw4k.minCpu, 8);
    assert.equal(hw4k.minMemoryMb, 16384);
  });

  it("should validate worker spec schema", () => {
    const spec = {
      cpu: 2,
      memoryMb: 4096,
      architecture: "arm64",
      storageGb: 30,
      region: "us-east-1",
      environmentVariables: {
        WORKER_ID: "11111111-1111-1111-1111-111111111111",
        DATABASE_URL: "postgresql://localhost:5432/veolms",
      },
    };

    const parsed = workerSpecSchema.parse(spec);
    assert.equal(parsed.cpu, 2);
    assert.equal(parsed.architecture, "arm64");
    assert.equal(
      parsed.environmentVariables["WORKER_ID"],
      "11111111-1111-1111-1111-111111111111",
    );
  });

  it("should validate progress update schema", () => {
    const update = {
      workerId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
      jobId: "b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22",
      progressPercent: 45.5,
      processedSeconds: 273,
      totalDurationSeconds: 600,
      fps: 58.2,
      speed: 1.94,
      currentQuality: "720p",
    };

    const parsed = progressUpdateSchema.parse(update);
    assert.equal(parsed.progressPercent, 45.5);
    assert.equal(parsed.currentQuality, "720p");
  });
});
