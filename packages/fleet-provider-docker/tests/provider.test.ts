import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import {
  buildDockerCreateRequest,
  buildDockerRunArgs,
  createDockerProvider,
} from "../src/provider.ts";
import {
  configureEnv,
  isReadlineInterface,
  provisionInfra,
  runInfraSetup,
} from "../src/setup/index.ts";
import { destroyInfra, runDestroy } from "../src/setup/destroy.ts";
import { triggerTest, runTrigger } from "../src/trigger.ts";

describe("Docker Fleet Provider", () => {
  it("builds an ephemeral worker container with limits, labels, and storage mount", () => {
    const args = buildDockerRunArgs({
      workerId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
      image: "veolms-media-worker:local",
      storageRoot: "/repo/s3-bucket",
      network: "veolms_default",
      workerDatabaseUrl: "postgresql://veolms@postgres:5432/veolms",
      spec: {
        cpu: 2,
        memoryMb: 4096,
        architecture: "x86_64",
        storageGb: 30,
        region: "local",
        environmentVariables: { DATABASE_URL: "postgres://db" },
      },
    });

    assert.ok(!args.includes("--rm"));
    assert.ok(args.includes("--cpus"));
    assert.ok(args.includes("4096m"));
    assert.ok(args.includes("veolms.managed=true"));
    assert.ok(
      args.includes("type=bind,src=/repo/s3-bucket,dst=/app/s3-bucket"),
    );
    assert.ok(args.includes("WORKER_MAX_JOBS=1"));
    assert.ok(args.includes("host.docker.internal:host-gateway"));
    assert.ok(
      args.includes("DATABASE_URL=postgresql://veolms@postgres:5432/veolms"),
    );
  });

  it("builds a Docker Engine API payload for a Lambda socket fallback", () => {
    const request = buildDockerCreateRequest({
      workerId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
      image: "veolms-media-worker:local",
      storageRoot: "/repo/s3-bucket",
      network: "veolms-fleet",
      workerDatabaseUrl: "postgresql://veolms@postgres:5432/veolms",
      spec: {
        cpu: 2,
        memoryMb: 4096,
        architecture: "x86_64",
        storageGb: 30,
        region: "local",
        environmentVariables: {},
      },
    });

    assert.equal(request.name, "veolms-worker-a0eebc99-9c0");
    assert.deepEqual(request.body.HostConfig, {
      AutoRemove: false,
      NanoCpus: 2_000_000_000,
      Memory: 4_294_967_296,
      Binds: ["/repo/s3-bucket:/app/s3-bucket:rw"],
      ExtraHosts: ["host.docker.internal:host-gateway"],
      NetworkMode: "veolms-fleet",
    });
    assert.deepEqual(request.body.Labels, {
      "veolms.managed": "true",
      "veolms.worker-id": "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
    });
  });

  it("exports the 4 mandatory lifecycle modules defined in AGENTS.md", () => {
    assert.equal(typeof configureEnv, "function");
    assert.equal(typeof provisionInfra, "function");
    assert.equal(typeof runInfraSetup, "function");
    assert.equal(typeof destroyInfra, "function");
    assert.equal(typeof runDestroy, "function");
    assert.equal(typeof triggerTest, "function");
    assert.equal(typeof runTrigger, "function");
  });

  it("safely guards readline interfaces", () => {
    assert.equal(isReadlineInterface(null), false);
    assert.equal(isReadlineInterface(undefined), false);
    assert.equal(isReadlineInterface({}), false);
    assert.equal(isReadlineInterface({ question: "not-a-fn" }), false);
    assert.equal(isReadlineInterface({ question: () => {} }), true);
  });

  it("implements the FleetProvider interface contracts", () => {
    const provider = createDockerProvider();
    assert.equal(provider.name, "docker");
    assert.equal(typeof provider.createWorker, "function");
    assert.equal(typeof provider.getWorker, "function");
    assert.equal(typeof provider.getWorkerStatus, "function");
    assert.equal(typeof provider.terminateWorker, "function");
    assert.equal(typeof provider.execute, "function");
    assert.equal(typeof provider.healthCheck, "function");
    assert.equal(typeof provider.listActiveInstances, "function");
    assert.equal(typeof provider.verifyJobOutput, "function");
  });

  it("verifies job output with prefix normalization", async () => {
    const testDir = join(tmpdir(), `veolms-test-${randomUUID()}`);
    const outputDir = join(testDir, "output", "job-1");
    await mkdir(outputDir, { recursive: true });
    await writeFile(
      join(outputDir, "master.m3u8"),
      "#EXTM3U\n#EXT-X-STREAM-INF\n240p/240p.m3u8\n",
      "utf-8",
    );

    const provider = createDockerProvider({
      verificationStorageRoot: testDir,
    });

    try {
      const verifiedDirect = await provider.verifyJobOutput!("output/job-1");
      assert.equal(verifiedDirect, true);

      const verifiedPrefixed = await provider.verifyJobOutput!(
        "s3-bucket/output/job-1",
      );
      assert.equal(verifiedPrefixed, true);

      const missing = await provider.verifyJobOutput!("output/nonexistent");
      assert.equal(missing, false);
    } finally {
      await rm(testDir, { recursive: true, force: true });
    }
  });

  it("executes configureEnv in non-interactive mode", async () => {
    const result = await configureEnv({ nonInteractive: true });
    assert.equal(result.provider, "docker");
    assert.ok(result.envFiles.length >= 2);
  });
});
