import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BridgeError, buildNativeBridge } from "@veolms/webview-bridge";
import * as sdk from "../index.ts";
import { installFakeNative } from "./fake-native.ts";

// These tests render nothing, so a plain global object stands in for `window` (no DOM needed).
(globalThis as unknown as Record<string, unknown>)["window"] ??= globalThis;

describe("public API", () => {
  it("resolves @veolms/webview-bridge through its public entry", () => {
    assert.equal(typeof buildNativeBridge, "function");
    assert.ok(
      new sdk.BridgeNotReadyError("X", "timeout", "initializing") instanceof
        BridgeError,
    );
  });

  it("exports exactly the documented runtime values", () => {
    assert.deepEqual(
      Object.keys(sdk).sort(),
      [
        "BridgeErrorBoundary",
        "BridgeNotReadyError",
        "DEFAULT_ENDPOINT_NAME",
        "DEFAULT_READY_TIMEOUT_MS",
        "DEFAULT_RETRY_POLICY",
        "NativeBridgeContext",
        "NativeBridgeProvider",
        "computeRetryDelay",
        "disposeNativeBridge",
        "getBridgeClient",
        "getBridgeController",
        "getNativeBridgeDiagnostics",
        "hasBridgeController",
        "isBridgeNotReadyError",
        "isNativeEndpointPresent",
        "normalizeEndpointName",
        "resetNativeBridges",
        "resolveRetryPolicy",
        "useBridgeCall",
        "useBridgeController",
        "useBridgeEvent",
        "useNativeBridge",
      ].sort(),
    );
    assert.equal(sdk.DEFAULT_ENDPOINT_NAME, "NativeBridge");
    assert.equal(sdk.DEFAULT_READY_TIMEOUT_MS, 10000);
    assert.deepEqual(sdk.DEFAULT_RETRY_POLICY, {
      maxAttempts: 5,
      initialDelayMs: 100,
      factor: 2,
      maxDelayMs: 2000,
    });
  });

  it("retry helpers clamp and compute the documented backoff", () => {
    const policy = sdk.resolveRetryPolicy({
      maxAttempts: 0.5,
      initialDelayMs: -1,
      factor: Number.NaN,
    });
    assert.deepEqual(policy, {
      maxAttempts: 1,
      initialDelayMs: 0,
      factor: 2,
      maxDelayMs: 2000,
    });
    const d = sdk.resolveRetryPolicy();
    assert.deepEqual(
      [1, 2, 3, 4, 5, 6].map((n) => sdk.computeRetryDelay(d, n)),
      [100, 200, 400, 800, 1600, 2000],
    );
  });

  it("normalizes names and probes presence without side effects", () => {
    assert.equal(sdk.normalizeEndpointName(undefined), "NativeBridge");
    assert.equal(sdk.normalizeEndpointName("  Foo "), "Foo");
    assert.equal(sdk.isNativeEndpointPresent("ProbeBridge"), false);
    const fake = installFakeNative({ name: "ProbeBridge", mode: "legacy" });
    assert.equal(sdk.isNativeEndpointPresent("ProbeBridge"), true);
    // No receive callback was installed by probing.
    assert.equal(
      (window as unknown as Record<string, unknown>)[
        "__ProbeBridge_legacy_receive__"
      ],
      undefined,
    );
    fake.uninstall();
  });

  it("isBridgeNotReadyError recognises the error by code across bundles", () => {
    assert.equal(sdk.isBridgeNotReadyError({ code: "BRIDGE_NOT_READY" }), true);
    assert.equal(sdk.isBridgeNotReadyError(new Error("x")), false);
  });
});
