import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadFleetManagerConfig } from "@veolms/config";
import {
  resolveFleetProvider,
  resolveFleetProviderOptions,
} from "../src/core/provider-resolver.ts";
import { AVAILABLE_PROVIDERS } from "../src/provider-select.ts";

describe("Pluggable Provider Resolver", () => {
  it("should attempt to resolve provider package dynamically", async () => {
    // When resolving an unknown provider, it throws a clear actionable error
    await assert.rejects(
      async () => {
        await resolveFleetProvider("nonexistent-cloud");
      },
      (err: Error) => {
        assert.match(
          err.message,
          /Could not load provider "nonexistent-cloud"/,
        );
        assert.match(
          err.message,
          /Run "pnpm fleet:provider" to select and install it/,
        );
        return true;
      },
    );
  });

  it("should resolve PROVIDER from FLEET_PROVIDER when PROVIDER is not explicitly set", () => {
    const config = loadFleetManagerConfig({
      FLEET_PROVIDER: "aws",
    });
    assert.equal(config.PROVIDER, "AWS");
  });

  it("should prioritize explicit PROVIDER over FLEET_PROVIDER", () => {
    const config = loadFleetManagerConfig({
      PROVIDER: "aws",
      FLEET_PROVIDER: "local",
    });
    assert.equal(config.PROVIDER, "AWS");
  });

  it("should normalize uppercase provider names (e.g. AWS) to lowercase package names", async () => {
    const provider = await resolveFleetProvider("AWS");
    assert.ok(provider);
    assert.equal(provider.name, "aws");
    assert.equal(typeof provider.createWorker, "function");
    assert.equal(typeof provider.terminateWorker, "function");
  });

  it("passes Docker socket settings to the Docker provider", () => {
    const config = loadFleetManagerConfig({
      PROVIDER: "docker",
      DATABASE_URL: "postgresql://worker-db.local/veolms",
      DOCKER_TRANSPORT: "socket",
      DOCKER_SOCKET_PATH: "/tmp/docker.sock",
    });

    assert.deepEqual(resolveFleetProviderOptions(config), {
      image: "veolms-media-worker:local",
      network: undefined,
      storageRoot: undefined,
      verificationStorageRoot: undefined,
      workerDatabaseUrl: "postgresql://worker-db.local/veolms",
      transport: "socket",
      socketPath: "/tmp/docker.sock",
      defaultEnv: {
        FLEET_TEST_MODE: "false",
        HEARTBEAT_INTERVAL_MS: "45000",
      },
    });
  });

  it("uses the effective provider override for serverless options", () => {
    const config = loadFleetManagerConfig({ PROVIDER: "aws" });
    const options = resolveFleetProviderOptions(
      config,
      undefined,
      "docker",
    ) as {
      image: string;
      workerDatabaseUrl: string;
      defaultEnv: Record<string, string>;
    };
    assert.equal(options.image, "veolms-media-worker:local");
    assert.equal(options.workerDatabaseUrl, config.DATABASE_URL);
    assert.equal(options.defaultEnv.HEARTBEAT_INTERVAL_MS, "45000");
  });

  it("offers Docker through the interactive provider selector", () => {
    const docker = AVAILABLE_PROVIDERS.find(
      (provider) => provider.id === "docker",
    );
    assert.deepEqual(docker, {
      id: "docker",
      name: "Docker Engine (Local Fleet)",
      pkg: "@veolms/fleet-provider-docker",
      description:
        "One ephemeral media-worker container per job, shared s3-bucket mount, and Docker socket orchestration",
      status: "available",
      requiresInstall: false,
    });
  });
});
