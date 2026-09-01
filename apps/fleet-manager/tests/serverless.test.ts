import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
  handler,
} from "../src/entrypoints/serverless.ts";
import {
  bundleServerless,
  parseBuildArgs,
} from "../scripts/build-serverless.ts";

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

function createChainableMockDb(
  options: { claimableJob?: boolean } = {},
): Kysely<Database> {
  const mockJob = {
    id: "job-1",
    video_id: "vid-1",
    status: "queued",
    video_key: "key.mp4",
    output_prefix: "out/",
    qualities: ["1080p"],
    video_size: 100,
    attempts: 0,
    max_attempts: 3,
    created_at: new Date(),
  };

  const handlerProxy: ProxyHandler<object> = {
    get(_target, prop) {
      if (prop === "execute") {
        return async () => [mockJob];
      }
      if (prop === "executeTakeFirst") {
        return async () => (options.claimableJob ? mockJob : undefined);
      }
      if (prop === "destroy") {
        return async () => {};
      }
      return (..._args: unknown[]) => new Proxy({}, handlerProxy);
    },
  };
  return new Proxy({}, handlerProxy) as unknown as Kysely<Database>;
}

describe("Universal Serverless Entrypoint — Event Parsing", () => {
  it("should extract direct VideoJobEvent fields correctly", () => {
    const raw = {
      action: "queue",
      videoKey: "raw/lecture.mp4",
      videoId: "vid-1",
      qualities: ["1080p", "720p"],
    };
    const event = extractVideoJobEvent(raw);
    assert.equal(event.action, "queue");
    assert.equal(event.videoKey, "raw/lecture.mp4");
    assert.equal(event.videoId, "vid-1");
    assert.deepEqual(event.qualities, ["1080p", "720p"]);
  });

  it("should extract JSON string payload from HTTP event.body (Function URL / API Gateway)", () => {
    const raw = {
      body: JSON.stringify({
        action: "monitor",
      }),
      headers: { "content-type": "application/json" },
    };
    const event = extractVideoJobEvent(raw);
    assert.equal(event.action, "monitor");
  });

  it("should extract base64-encoded body from HTTP event when isBase64Encoded is true", () => {
    const payload = JSON.stringify({
      action: "queue",
      videoKey: "encoded.mp4",
    });
    const base64Body = Buffer.from(payload, "utf-8").toString("base64");
    const raw = {
      body: base64Body,
      isBase64Encoded: true,
    };
    const event = extractVideoJobEvent(raw);
    assert.equal(event.action, "queue");
    assert.equal(event.videoKey, "encoded.mp4");
  });

  it("should return empty object for invalid or empty events without throwing", () => {
    assert.deepEqual(extractVideoJobEvent(null), {});
    assert.deepEqual(extractVideoJobEvent(undefined), {});
    assert.deepEqual(extractVideoJobEvent("invalid string"), {});
    assert.deepEqual(extractVideoJobEvent({ body: "invalid json string" }), {});
  });
});

describe("Universal Serverless Entrypoint — Execution Lifecycle", () => {
  it("should run MONITOR cycle when action is MONITOR", async () => {
    const provider = createMockProvider();
    const db = createChainableMockDb();

    const result = await runServerlessFleetCycle(
      { action: "monitor" },
      { provider, db },
    );

    assert.equal(result.success, true);
    assert.ok(result.monitorResult);
    assert.equal(result.jobClaimed, undefined);
    assert.ok(result.timestamp);
  });

  it("should run default tick/claim cycle when no action is specified", async () => {
    const provider = createMockProvider();
    const db = createChainableMockDb();

    const result = await runServerlessFleetCycle({}, { provider, db });

    assert.equal(result.success, true);
    assert.equal(typeof result.jobClaimed, "boolean");
    assert.ok(result.monitorResult);
  });

  it("should queue a job when action is QUEUE with videoKey", async () => {
    const provider = createMockProvider();
    const db = createChainableMockDb();

    const result = await runServerlessFleetCycle(
      {
        action: "queue",
        videoKey: "courses/intro.mp4",
        videoId: "v-123",
        qualities: ["1080p"],
      },
      { provider, db },
    );

    assert.equal(result.success, true);
    assert.ok(result.monitorResult);
  });

  it("should propagate unexpected database error in runServerlessFleetCycle", async () => {
    const provider = createMockProvider();
    const brokenDb = {
      selectFrom: () => {
        throw new Error("Database connection lost");
      },
      destroy: async () => {},
    } as unknown as Kysely<Database>;

    await assert.rejects(async () => {
      await runServerlessFleetCycle({}, { provider, db: brokenDb });
    }, /Database connection lost/);
  });
});

describe("Universal Serverless Builder — Packaging & CLI Argument Parser", () => {
  it("should parse CLI arguments correctly", () => {
    const args = [
      "--provider=local",
      "--target=node24",
      "--format=esm",
      "--outdir=/tmp/out",
      "--no-zip",
    ];
    const parsed = parseBuildArgs(args);
    assert.equal(parsed.provider, "local");
    assert.equal(parsed.target, "node24");
    assert.equal(parsed.format, "esm");
    assert.equal(parsed.outDir, "/tmp/out");
    assert.equal(parsed.createZip, false);
  });

  it("should bundle serverless artifact to specified output directory", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "veolms-build-test-"));
    try {
      const result = bundleServerless({
        provider: "local",
        outDir: tempDir,
        createZip: true,
        log: false,
      });

      assert.equal(result.provider, "local");
      assert.ok(existsSync(result.outfile));
      assert.ok(result.zipPath);
      assert.ok(existsSync(result.zipPath));
      assert.ok(result.sizeBytes > 0);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("should bundle AWS provider and produce function.zip when provider is aws", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "veolms-build-aws-test-"));
    try {
      const result = bundleServerless({
        provider: "aws",
        outDir: tempDir,
        createZip: true,
        log: false,
      });

      assert.equal(result.provider, "aws");
      assert.ok(existsSync(result.outfile));
      assert.ok(result.bundledFiles.includes("index.js"));
      assert.ok(result.zipPath);
      assert.ok(existsSync(result.zipPath));
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
