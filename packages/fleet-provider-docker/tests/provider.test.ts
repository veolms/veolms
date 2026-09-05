import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildDockerCreateRequest,
  buildDockerRunArgs,
} from "../src/provider.ts";

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
      args.includes("type=bind,src=/repo/s3-bucket,dst=/app/s3-bucket,rw"),
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
});
