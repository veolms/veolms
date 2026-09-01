import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Kysely, Selectable } from "kysely";
import type { Database, VideoJobTable } from "@veolms/database";
import type {
  FleetProvider,
  WorkerHandle,
  WorkerSpec,
  WorkerStatus,
} from "@veolms/fleet-types";
import { createScheduler } from "../src/core/scheduler.ts";
import { createWorkerManager } from "../src/core/worker-manager.ts";
import { loadFleetManagerConfig } from "@veolms/config";

describe("Worker Manager Spec Calculations", () => {
  const config = loadFleetManagerConfig();
  const scheduler = createScheduler(config);

  const mockProvider: FleetProvider = {
    name: "local",
    async createWorker(id: string, _spec: WorkerSpec): Promise<WorkerHandle> {
      return {
        id,
        providerWorkerId: `mock-${id}`,
        provider: "local",
        status: "starting",
        privateIp: "127.0.0.1",
        publicIp: null,
        createdAt: new Date(),
      };
    },
    async getWorker(): Promise<WorkerHandle | null> {
      return null;
    },
    async getWorkerStatus(): Promise<WorkerStatus> {
      return "processing";
    },
    async terminateWorker(): Promise<void> {},
    async healthCheck() {
      return { healthy: true, state: "processing" as WorkerStatus };
    },
  };

  // Mock DB for spec unit tests
  const mockDb = {} as unknown as Kysely<Database>;

  const workerManager = createWorkerManager({
    provider: mockProvider,
    db: mockDb,
    scheduler,
    config,
  });

  it("should scale hardware spec up for 4K video requests", () => {
    const job4k: Selectable<VideoJobTable> = {
      id: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
      video_id: "media-4k-1",
      status: "queued",
      video_key: "raw/4k-intro.mp4",
      output_prefix: "transcoded/4k-intro",
      video_size: 0,
      qualities: ["2160p", "1080p", "720p"],
      worker_id: null,
      progress_percent: 0,
      attempts: 0,
      max_attempts: 3,
      error_message: null,
      hardware_profile: null,
      video_metadata: null,
      created_at: new Date(),
      started_at: null,
      completed_at: null,
      failed_at: null,
      updated_at: new Date(),
    };

    const spec = workerManager.calculateWorkerSpec(job4k);
    assert.equal(spec.cpu, 8);
    assert.equal(spec.memoryMb, 16384);
    assert.equal(spec.storageGb, 80);
    assert.equal(spec.architecture, "arm64");
  });

  it("should use standard hardware spec for standard 1080p / 720p requests", () => {
    const jobStandard: Selectable<VideoJobTable> = {
      id: "b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22",
      video_id: "media-std-1",
      status: "queued",
      video_key: "raw/lesson1.mp4",
      output_prefix: "transcoded/lesson1",
      video_size: 0,
      qualities: ["1080p", "720p", "480p"],
      worker_id: null,
      progress_percent: 0,
      attempts: 0,
      max_attempts: 3,
      error_message: null,
      hardware_profile: null,
      video_metadata: null,
      created_at: new Date(),
      started_at: null,
      completed_at: null,
      failed_at: null,
      updated_at: new Date(),
    };

    const spec = workerManager.calculateWorkerSpec(jobStandard);
    assert.equal(spec.cpu, 2);
    assert.equal(spec.memoryMb, 4096);
    assert.equal(spec.storageGb, 30);
  });

  it("scales up a low-quality-count job when probed source metadata confirms a demanding 4K/60fps/HEVC source", () => {
    const jobLowQualityRichSource: Selectable<VideoJobTable> = {
      id: "c2eebc99-9c0b-4ef8-bb6d-6bb9bd380a33",
      video_id: "media-4k-hevc-1",
      status: "queued",
      video_key: "raw/drone-4k.mp4",
      output_prefix: "transcoded/drone-4k",
      video_size: 0,
      // Only a single low-effort output rendition requested — the old,
      // qualities-only heuristic would size this as the smallest tier.
      qualities: ["480p"],
      worker_id: null,
      progress_percent: 0,
      attempts: 0,
      max_attempts: 3,
      error_message: null,
      hardware_profile: null,
      video_metadata: {
        width: 3840,
        height: 2160,
        fps: 60,
        codec: "hevc",
        durationSeconds: 120,
      },
      created_at: new Date(),
      started_at: null,
      completed_at: null,
      failed_at: null,
      updated_at: new Date(),
    };

    const spec = workerManager.calculateWorkerSpec(jobLowQualityRichSource);
    // 4K resolution floor (medium) + codec bump (hevc) clamps at large.
    assert.equal(spec.cpu, 16);
    assert.equal(spec.memoryMb, 32768);
  });

  it("steps a small, simple, low-quality-count job down to the nano tier when metadata confirms it", () => {
    const jobTinySource: Selectable<VideoJobTable> = {
      id: "d3eebc99-9c0b-4ef8-bb6d-6bb9bd380a44",
      video_id: "media-tiny-1",
      status: "queued",
      video_key: "raw/tiny-clip.mp4",
      output_prefix: "transcoded/tiny-clip",
      video_size: 0,
      qualities: ["240p"],
      worker_id: null,
      progress_percent: 0,
      attempts: 0,
      max_attempts: 3,
      error_message: null,
      hardware_profile: null,
      video_metadata: {
        width: 640,
        height: 360,
        fps: 24,
        codec: "h264",
        durationSeconds: 30,
      },
      created_at: new Date(),
      started_at: null,
      completed_at: null,
      failed_at: null,
      updated_at: new Date(),
    };

    const spec = workerManager.calculateWorkerSpec(jobTinySource);
    assert.equal(spec.cpu, 1);
    assert.equal(spec.memoryMb, 2048);
  });
});
