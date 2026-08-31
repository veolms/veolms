import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadFleetManagerConfig } from "@veolms/config";
import { resolveFleetProvider } from "../src/core/provider-resolver.ts";

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
});
