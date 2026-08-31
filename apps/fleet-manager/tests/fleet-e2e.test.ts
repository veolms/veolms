import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Kysely } from "kysely";
import type { Database } from "@veolms/database";
import type {
  FleetProvider,
  WorkerHandle,
  WorkerSpec,
  WorkerStatus,
} from "@veolms/fleet-types";
import { createScheduler } from "../src/core/scheduler.ts";
import { createWorkerManager } from "../src/core/worker-manager.ts";
import { loadFleetManagerConfig } from "@veolms/config";

describe("Fleet Manager End-to-End Core Integration", () => {
  const config = loadFleetManagerConfig();
  const scheduler = createScheduler(config);

  it("should correctly compute hardware spec from requested quality array", () => {
    const mockProvider: FleetProvider = {
      name: "local",
      async createWorker(id: string, _spec: WorkerSpec): Promise<WorkerHandle> {
        return {
          id,
          providerWorkerId: `local-proc-999`,
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

    const workerManager = createWorkerManager({
      provider: mockProvider,
      db: {} as unknown as Kysely<Database>,
      scheduler,
      config,
    });

    const job: Job = {
      id: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
      status: "queued",
      videoKey: "videos/lecture.mp4",
      outputPrefix: "hls/lecture",
      videoSize: 0,
      qualities: ["1080p", "720p", "480p", "360p"],
      workerId: null,
      attempts: 0,
      maxAttempts: 3,
      errorMessage: null,
      createdAt: new Date(),
      startedAt: null,
      completedAt: null,
      failedAt: null,
      updatedAt: new Date(),
    };

    const spec = workerManager.calculateWorkerSpec(job);
    assert.equal(spec.cpu, 2);
    assert.equal(spec.memoryMb, 4096);
    assert.equal(spec.architecture, "arm64");
    assert.equal(spec.environmentVariables["JOB_ID"], job.id);
  });
});
