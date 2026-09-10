import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadModuleFunction } from "../src/core/dynamic-module.ts";

describe("loadModuleFunction", () => {
  it("should successfully load an exported function from a module", async () => {
    const fn = await loadModuleFunction<(...args: string[]) => string>(
      "node:path",
      "join",
    );
    assert.equal(typeof fn, "function");
    assert.equal(typeof fn("a", "b"), "string");
  });

  it("should throw a descriptive error when module does not export the function", async () => {
    await assert.rejects(
      async () => {
        await loadModuleFunction("node:path", "nonExistentFunction");
      },
      (err: Error) => {
        assert.match(
          err.message,
          /Module "node:path" does not export a function named "nonExistentFunction"/,
        );
        return true;
      },
    );
  });

  it("should use custom notExportedMessage when provided", async () => {
    await assert.rejects(
      async () => {
        await loadModuleFunction(
          "node:path",
          "nonExistentFunction",
          "Custom error message",
        );
      },
      (err: Error) => {
        assert.equal(err.message, "Custom error message");
        return true;
      },
    );
  });

  const providers = ["aws", "docker", "local"] as const;

  for (const provider of providers) {
    describe(`Provider standard exports for "${provider}"`, () => {
      it(`should load "createProvider" from @veolms/fleet-provider-${provider}`, async () => {
        const fn = await loadModuleFunction<(...args: unknown[]) => unknown>(
          `@veolms/fleet-provider-${provider}`,
          "createProvider",
        );
        assert.equal(typeof fn, "function");
      });

      it(`should load "provisionInfra" from @veolms/fleet-provider-${provider}/setup`, async () => {
        const fn = await loadModuleFunction<(...args: unknown[]) => unknown>(
          `@veolms/fleet-provider-${provider}/setup`,
          "provisionInfra",
        );
        assert.equal(typeof fn, "function");
      });

      it(`should load "destroyInfra" from @veolms/fleet-provider-${provider}/destroy`, async () => {
        const fn = await loadModuleFunction<(...args: unknown[]) => unknown>(
          `@veolms/fleet-provider-${provider}/destroy`,
          "destroyInfra",
        );
        assert.equal(typeof fn, "function");
      });

      it(`should load "triggerTest" from @veolms/fleet-provider-${provider}/trigger`, async () => {
        const fn = await loadModuleFunction<(...args: unknown[]) => unknown>(
          `@veolms/fleet-provider-${provider}/trigger`,
          "triggerTest",
        );
        assert.equal(typeof fn, "function");
      });
    });
  }
});
