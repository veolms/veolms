import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Kysely } from "kysely";
import type { Database } from "@veolms/database";
import type {
  FleetProvider,
  WorkerHandle,
  WorkerStatus,
  HealthStatus,
} from "@veolms/fleet-types";
import {
  extractVideoJobEvent,
  runServerlessFleetCycle,
} from "../src/entrypoints/serverless.ts";

function createMockProvider(name = "local"): FleetProvider {
  return {
    name: name as any,
    async createWorker(id: string): Promise<WorkerHandle> {
      return {
        id,
        providerWorkerId: `mock-${id}`,
        provider: name as any,
        status: "processing" as WorkerStatus,
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
    async healthCheck(): Promise<HealthStatus> {
      return { healthy: true, state: "processing" };
    },
  };
}

function createChainableMockDb(): Kysely<Database> {
  const handlerProxy: ProxyHandler<object> = {
    get(_target, prop) {
      if (prop === "execute") {
        return async () => [];
      }
      if (prop === "executeTakeFirst") {
        return async () => undefined;
      }
      if (prop === "destroy") {
        return async () => {};
      }
      return (..._args: unknown[]) => new Proxy({}, handlerProxy);
    },
  };
  return new Proxy({}, handlerProxy) as unknown as Kysely<Database>;
}

describe("Universal Serverless Entrypoint — Video Metadata Probe Support", () => {
  it("should extract videoMetadata from incoming direct event", () => {
    const raw = {
      action: "queue",
      videoKey: "raw/test-video.mp4",
      videoMetadata: {
        width: 1920,
        height: 1080,
        durationSeconds: 120.5,
        codec: "h264",
        fps: 30,
      },
    };
    const event = extractVideoJobEvent(raw);
    assert.equal(event.action, "queue");
    assert.equal(event.videoKey, "raw/test-video.mp4");
    assert.ok(event.videoMetadata);
    assert.equal(event.videoMetadata.width, 1920);
    assert.equal(event.videoMetadata.height, 1080);
    assert.equal(event.videoMetadata.durationSeconds, 120.5);
    assert.equal(event.videoMetadata.codec, "h264");
  });

  it("should extract videoMetadata from HTTP gateway JSON body", () => {
    const raw = {
      body: JSON.stringify({
        action: "queue",
        videoKey: "raw/4k-drone.mp4",
        videoMetadata: {
          width: 3840,
          height: 2160,
          durationSeconds: 300,
        },
      }),
    };
    const event = extractVideoJobEvent(raw);
    assert.equal(event.action, "queue");
    assert.equal(event.videoKey, "raw/4k-drone.mp4");
    assert.ok(event.videoMetadata);
    assert.equal(event.videoMetadata.width, 3840);
    assert.equal(event.videoMetadata.height, 2160);
  });

  it("should execute serverless cycle seamlessly with pre-probed metadata payload", async () => {
    const mockDb = createChainableMockDb();
    const mockProvider = createMockProvider("aws");

    const result = await runServerlessFleetCycle(
      {
        action: "queue",
        videoKey: "raw/lecture-1.mp4",
        qualities: ["1080p", "720p"],
        videoMetadata: {
          width: 1920,
          height: 1080,
          durationSeconds: 60,
        },
      },
      {
        db: mockDb,
        provider: mockProvider,
      },
    );

    assert.equal(result.success, true);
    assert.ok(result.timestamp);
  });

  it("should execute serverless cycle seamlessly without videoMetadata (direct trigger backward compatibility)", async () => {
    const mockDb = createChainableMockDb();
    const mockProvider = createMockProvider("aws");

    const result = await runServerlessFleetCycle(
      {
        action: "queue",
        videoKey: "raw/direct-trigger.mp4",
        qualities: ["720p"],
      },
      {
        db: mockDb,
        provider: mockProvider,
      },
    );

    assert.equal(result.success, true);
    assert.ok(result.timestamp);
  });
});
