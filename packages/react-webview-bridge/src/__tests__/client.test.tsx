import "./dom.ts";
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { act, cleanup, render } from "@testing-library/react";
import {
  NativeBridgeProvider,
  getBridgeClient,
  hasBridgeController,
  resetNativeBridges,
} from "../index.ts";
import { installFakeNative, type FakeNative } from "./fake-native.ts";

interface TestContract {
  device: {
    getInfo(): Promise<{ model: string; sdk: number }>;
    vibrate(ms: number): Promise<number>;
  };
  app: { readonly version: Promise<string> };
}

const fakes: FakeNative[] = [];
function fake(options?: Parameters<typeof installFakeNative>[0]): FakeNative {
  const f = installFakeNative(options);
  fakes.push(f);
  return f;
}

afterEach(() => {
  cleanup();
  resetNativeBridges();
  for (const f of fakes.splice(0)) f.uninstall();
});

const FAST_RETRY = { maxAttempts: 2, initialDelayMs: 5, maxDelayMs: 5 };
const tick = (ms = 0) =>
  act(() => new Promise<void>((resolve) => setTimeout(resolve, ms)));

describe("getBridgeClient", () => {
  it("waits for the connection, then calls nested functions with their arguments", async () => {
    const native = fake({
      replyDelayMs: 5,
      handlers: {
        "device:getInfo": () => ({ model: "FakePhone", sdk: 34 }),
        "device:vibrate": (ms) => ms,
      },
    });
    const client = getBridgeClient<TestContract>();
    // Called before any provider exists: queued until the bridge is ready.
    const info = client.device.getInfo();
    const vibrated = client.device.vibrate(40);
    render(<NativeBridgeProvider retry={FAST_RETRY} />);

    assert.deepEqual(await info, { model: "FakePhone", sdk: 34 });
    assert.equal(await vibrated, 40);
    assert.equal(native.initCount, 1);
    assert.deepEqual(
      native.requests
        .filter((r) => r.operation === "invoke")
        .map((r) => [r.payload.path, r.payload.args]),
      [
        ["device:getInfo", []],
        ["device:vibrate", [40]],
      ],
    );
  });

  it("rejects with reason unavailable in a plain browser by default", async () => {
    render(<NativeBridgeProvider retry={FAST_RETRY} />);
    await assert.rejects(getBridgeClient<TestContract>().device.getInfo(), {
      code: "BRIDGE_NOT_READY",
      reason: "unavailable",
    });
  });

  it('resolves null in a plain browser with unavailable: "null"', async () => {
    render(<NativeBridgeProvider retry={FAST_RETRY} />);
    const client = getBridgeClient<TestContract>(undefined, {
      unavailable: "null",
    });
    assert.equal(await client.device.getInfo(), null);
  });

  it("answers at once on the server, without creating a controller", async () => {
    const globals = globalThis as unknown as Record<string, unknown>;
    const win = globals["window"];
    delete globals["window"];
    try {
      await assert.rejects(getBridgeClient<TestContract>().device.getInfo(), {
        reason: "unavailable",
      });
      const nullClient = getBridgeClient<TestContract>(undefined, {
        unavailable: "null",
      });
      assert.equal(await nullClient.device.getInfo(), null);
      assert.equal(hasBridgeController(), false);
    } finally {
      globals["window"] = win;
    }
  });

  it("keeps working after the provider unmounts and mounts again", async () => {
    fake();
    const client = getBridgeClient<TestContract>();
    const first = render(<NativeBridgeProvider />);
    assert.equal((await client.device.getInfo()).model, "FakePhone");
    first.unmount();
    await tick(5); // the first controller is disposed and dropped

    render(<NativeBridgeProvider />);
    assert.equal((await client.device.getInfo()).model, "FakePhone");
  });

  it("is never a thenable and never calls native for then/toJSON", async () => {
    const native = fake();
    render(<NativeBridgeProvider />);
    const client = getBridgeClient<TestContract>();
    const namespace = client.device as unknown as Record<string, unknown>;
    assert.equal(namespace["then"], undefined);
    assert.equal(namespace["toJSON"], undefined);
    // `await` on a namespace gives the namespace back instead of waiting forever.
    assert.equal(await namespace, namespace);
    await tick(5);
    assert.equal(native.invokeCount, 0);
  });

  it("is typed by the contract", () => {
    const client = getBridgeClient<TestContract>();
    const typed: () => Promise<number> = () => client.device.vibrate(1);
    // @ts-expect-error wrong argument type
    const wrongArg = () => client.device.vibrate("1");
    // @ts-expect-error properties are left out (read them inside controller.call)
    const property = () => client.app.version;
    // @ts-expect-error a function the contract does not have
    const missing = () => client.device.nope();
    assert.equal(typeof typed, "function");
    void wrongArg;
    void property;
    void missing;
  });
});
