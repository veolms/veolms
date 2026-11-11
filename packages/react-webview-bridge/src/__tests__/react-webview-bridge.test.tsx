import "./dom.ts";
import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import { StrictMode, useEffect, useState, type ReactNode } from "react";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { BridgeError, BridgeInitializationError } from "@veolms/webview-bridge";
import {
  BridgeNotReadyError,
  NativeBridgeProvider,
  disposeNativeBridge,
  getBridgeController,
  getNativeBridgeDiagnostics,
  resetNativeBridges,
  useBridgeCall,
  useBridgeEvent,
  useNativeBridge,
  type BridgeInstance,
  type NativeBridgeProviderProps,
} from "../index.ts";
import { installFakeNative, type FakeNative } from "./fake-native.ts";

interface TestContract {
  device: {
    getInfo(): Promise<{ model: string; sdk: number }>;
    vibrate(ms: number): Promise<void>;
  };
  /** Present in the contract, absent from native metadata → NOOP. */
  missing: { feature(): Promise<string | null> };
}
type TestBridge = BridgeInstance<TestContract>;

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

const tick = (ms = 0) =>
  act(() => new Promise<void>((resolve) => setTimeout(resolve, ms)));

function StateProbe() {
  const { state, attempt, error } = useNativeBridge<TestContract>();
  return (
    <div>
      <span data-testid="state">{state}</span>
      <span data-testid="attempt">{attempt}</span>
      <span data-testid="error">{error?.message ?? ""}</span>
    </div>
  );
}

function renderWithProvider(
  children: ReactNode,
  props?: Partial<NativeBridgeProviderProps>,
  strict = false,
) {
  const tree = (
    <NativeBridgeProvider
      retry={{ maxAttempts: 3, initialDelayMs: 5, maxDelayMs: 20 }}
      {...props}
    >
      <StateProbe />
      {children}
    </NativeBridgeProvider>
  );
  return render(strict ? <StrictMode>{tree}</StrictMode> : tree);
}

const stateText = () => screen.getAllByTestId("state")[0]?.textContent;

describe("NativeBridgeProvider", () => {
  it("initializes exactly once under StrictMode and never disposes on the double mount", async () => {
    const native = fake({ replyDelayMs: 5 });
    renderWithProvider(
      <>
        <StateProbe />
        <NativeBridgeProvider>
          <StateProbe />
        </NativeBridgeProvider>
      </>,
      undefined,
      true,
    );
    await waitFor(() => assert.equal(stateText(), "ready"));
    await tick(20);

    const diag = getNativeBridgeDiagnostics();
    assert.equal(diag.buildCalls, 1);
    assert.equal(diag.readyCount, 1);
    assert.equal(diag.disposeCount, 0);
    assert.equal(diag.controllersCreated, 1);
    assert.equal(diag.refCount, 2);
    assert.equal(native.initCount, 1);
    assert.equal(native.listenerCount, 1);
    assert.deepEqual(
      screen.getAllByTestId("state").map((n) => n.textContent),
      ["ready", "ready", "ready"],
    );
  });

  it("disposes the session only after the last provider unmounts (deferred)", async () => {
    const native = fake({ mode: "legacy" });
    const { unmount } = renderWithProvider(null, undefined, true);
    await waitFor(() => assert.equal(stateText(), "ready"));
    assert.equal(
      typeof (window as unknown as Record<string, unknown>)[
        "__NativeBridge_legacy_receive__"
      ],
      "function",
    );

    unmount();
    assert.equal(getNativeBridgeDiagnostics().disposeCount, 0); // deferred by a macrotask
    await tick(5);
    assert.equal(getNativeBridgeDiagnostics().disposeCount, 1);
    assert.equal(
      (window as unknown as Record<string, unknown>)[
        "__NativeBridge_legacy_receive__"
      ],
      undefined,
    );
    assert.equal(native.initCount, 1);
  });

  it("keepAlive keeps the session after unmount", async () => {
    fake();
    const { unmount } = renderWithProvider(null, { keepAlive: true });
    await waitFor(() => assert.equal(stateText(), "ready"));
    unmount();
    await tick(5);
    assert.equal(getNativeBridgeDiagnostics().disposeCount, 0);
    assert.equal(getBridgeController().getSnapshot().state, "ready");
  });
});

describe("calls before readiness", () => {
  it("queues calls made before ready and resolves them after init", async () => {
    const native = fake({ replyDelayMs: 20 });
    const results: unknown[] = [];

    function EarlyCaller() {
      const { call, state } = useNativeBridge<TestContract>();
      useEffect(() => {
        // Fired while state is still idle/initializing.
        void call((b) => b.device.getInfo()).then((info) => results.push(info));
      }, [call]);
      return <span data-testid="early-state">{state}</span>;
    }

    renderWithProvider(<EarlyCaller />);
    assert.equal(native.invokeCount, 0);
    await waitFor(() =>
      assert.deepEqual(results, [{ model: "FakePhone", sdk: 34 }]),
    );
    assert.equal(native.invokeCount, 1);
  });

  it("useBridgeCall tracks status and data", async () => {
    fake({ replyDelayMs: 5 });
    let runRef: (() => Promise<unknown>) | null = null;

    function Caller() {
      const info = useBridgeCall((b: TestBridge) => b.device.getInfo());
      useEffect(() => {
        runRef = info.run;
      });
      return (
        <span data-testid="call">
          {info.status}:{info.data?.model ?? ""}
        </span>
      );
    }

    renderWithProvider(<Caller />);
    await act(async () => {
      await runRef!();
    });
    assert.equal(screen.getByTestId("call").textContent, "success:FakePhone");
  });

  it("rejects with BRIDGE_NOT_READY when readiness times out", async () => {
    // No endpoint injected; a long retry run keeps the controller initializing.
    renderWithProvider(null, {
      retry: { maxAttempts: 1000, initialDelayMs: 10, maxDelayMs: 10 },
    });
    const controller = getBridgeController<TestContract>();

    const error = await controller
      .call((b) => b.device.getInfo(), { timeoutMs: 40 })
      .catch((e: unknown) => e);
    assert.ok(error instanceof BridgeNotReadyError);
    assert.ok(error instanceof BridgeError);
    assert.equal((error as BridgeNotReadyError).code, "BRIDGE_NOT_READY");
    assert.equal((error as BridgeNotReadyError).reason, "timeout");
    assert.equal(stateText(), "initializing");

    const immediate = await controller
      .call((b) => b.device.getInfo(), { waitForReady: false })
      .catch((e: unknown) => e);
    assert.equal((immediate as BridgeNotReadyError).reason, "not-ready");
  });

  it("whenReady resolves a wrapper object, not the proxy", async () => {
    fake();
    renderWithProvider(null);
    const ready = await getBridgeController<TestContract>().whenReady();
    assert.deepEqual(Object.keys(ready), ["bridge"]);
    assert.equal(String(ready.bridge), "[NativeBridge NativeBridge]");
  });
});

describe("retry / backoff", () => {
  it("retries while the endpoint is missing and succeeds once it appears", async () => {
    renderWithProvider(null, {
      retry: {
        maxAttempts: 20,
        initialDelayMs: 10,
        factor: 1.5,
        maxDelayMs: 30,
      },
    });
    await tick(35);
    assert.equal(stateText(), "initializing");
    assert.ok(Number(screen.getByTestId("attempt").textContent) > 1);

    const native = fake();
    await waitFor(() => assert.equal(stateText(), "ready"));
    assert.equal(native.initCount, 1);
    assert.ok(getNativeBridgeDiagnostics().buildCalls > 1);
  });

  it("ends in `unavailable` after exhausting retries, rejects waiters, and retry() restarts", async () => {
    let captured: { bridge: TestBridge | null; retry: () => void } | null =
      null;
    function Capture() {
      const { bridge, retry } = useNativeBridge<TestContract>();
      useEffect(() => {
        captured = { bridge, retry };
      });
      return null;
    }
    renderWithProvider(<Capture />, {
      retry: { maxAttempts: 3, initialDelayMs: 5, maxDelayMs: 5 },
    });
    const waiting = getBridgeController()
      .whenReady({ timeoutMs: 0 })
      .catch((e: unknown) => e);

    await waitFor(() => assert.equal(stateText(), "unavailable"));
    assert.equal(screen.getByTestId("attempt").textContent, "3");
    assert.equal(getNativeBridgeDiagnostics().buildCalls, 3);
    assert.equal(
      ((await waiting) as BridgeNotReadyError).reason,
      "unavailable",
    );
    assert.match(
      screen.getByTestId("error").textContent ?? "",
      /No native endpoint object found/,
    );

    fake();
    act(() => captured!.retry());
    await waitFor(() => assert.equal(stateText(), "ready"));
    assert.notEqual(captured!.bridge, null);
  });

  it("ends in `error` when the endpoint exists but the handshake fails", async () => {
    const onInitError = mock.fn();
    const native = fake({ init: "bad-version" });
    renderWithProvider(null, {
      options: { onInitError },
      retry: { maxAttempts: 2, initialDelayMs: 5 },
    });
    await waitFor(() => assert.equal(stateText(), "error"));
    const { error } = getBridgeController().getSnapshot();
    assert.ok(error instanceof BridgeInitializationError);
    assert.equal(onInitError.mock.callCount(), 2);
    assert.equal(native.initCount, 2);
  });
});

describe("useBridgeEvent", () => {
  it("delivers to the latest handler and unsubscribes on unmount", async () => {
    const native = fake();
    const received: string[] = [];

    function Listener({ tag }: { tag: string }) {
      useBridgeEvent<{ n: number }>("tick", (payload) =>
        received.push(`${tag}:${payload.n}`),
      );
      return null;
    }
    function Harness() {
      const [show, setShow] = useState(true);
      const [tag, setTag] = useState("a");
      return (
        <>
          {show && <Listener tag={tag} />}
          <button onClick={() => setTag("b")}>retag</button>
          <button onClick={() => setShow(false)}>hide</button>
        </>
      );
    }

    renderWithProvider(<Harness />);
    await waitFor(() => assert.equal(stateText(), "ready"));
    await tick();

    act(() => native.emit("tick", { n: 1 }));
    act(() => screen.getByText("retag").click());
    act(() => native.emit("tick", { n: 2 }));
    act(() => screen.getByText("hide").click());
    act(() => native.emit("tick", { n: 3 }));

    assert.deepEqual(received, ["a:1", "b:2"]);
  });
});

describe("bridge semantics", () => {
  it("NOOP: a contract member missing from native metadata resolves null without a request", async () => {
    const native = fake();
    renderWithProvider(null);
    const controller = getBridgeController<TestContract>();
    const before = native.requests.length;
    assert.equal(await controller.call((b) => b.missing.feature()), null);
    assert.equal(native.requests.length, before);
    assert.equal(await controller.call((b) => b.$has("missing")), false);
    assert.equal(await controller.call((b) => b.device.vibrate(10)), undefined);
  });

  it("disposeNativeBridge resets to idle; retry() builds a fresh session", async () => {
    const native = fake();
    renderWithProvider(null);
    await waitFor(() => assert.equal(stateText(), "ready"));
    const old = getBridgeController<TestContract>().getSnapshot().bridge!;
    assert.equal(old.$disposed, false);

    let disposed = false;
    act(() => {
      disposed = disposeNativeBridge();
    });
    assert.equal(disposed, true);
    assert.equal(stateText(), "idle");
    assert.equal(native.listenerCount, 0);
    assert.equal(old.$disposed, true);
    await assert.rejects(old.device.getInfo(), { code: "TRANSPORT_ERROR" });

    act(() => getBridgeController().retry());
    await waitFor(() => assert.equal(stateText(), "ready"));
    assert.equal(native.initCount, 2);
    assert.equal(native.listenerCount, 1);
  });
});

describe("review fixes", () => {
  const SLOW_RETRY = { maxAttempts: 20, initialDelayMs: 5, maxDelayMs: 5 };

  it("a provider mounted again during the handshake keeps the shared session", async () => {
    fake({ replyDelayMs: 20 });
    const first = renderWithProvider(null);
    first.unmount();
    await tick(5); // the first controller is disposed while the handshake is in flight

    renderWithProvider(null);
    await waitFor(() => assert.equal(stateText(), "ready"));
    const info = await getBridgeController<TestContract>().call((b) =>
      b.device.getInfo(),
    );
    assert.deepEqual(info, { model: "FakePhone", sdk: 34 });
  });

  it("useBridgeCall runs the function of the render that started the run", async () => {
    let runRef: (() => Promise<string>) | null = null;
    function Caller({ label }: { label: string }) {
      const call = useBridgeCall((_b: TestBridge) => label);
      useEffect(() => {
        runRef = call.run;
      });
      return null;
    }
    const tree = (label: string) => (
      <NativeBridgeProvider retry={SLOW_RETRY}>
        <Caller label={label} />
      </NativeBridgeProvider>
    );

    // No endpoint yet, so the run waits for readiness.
    const view = render(tree("A"));
    let result: Promise<string> | null = null;
    act(() => {
      result = runRef!();
    });
    view.rerender(tree("B"));
    fake();
    assert.equal(await result!, "A");
  });

  it("releases the kept owner when keepAlive turns false", async () => {
    fake();
    const tree = (keepAlive: boolean) => (
      <NativeBridgeProvider keepAlive={keepAlive}>
        <StateProbe />
      </NativeBridgeProvider>
    );
    const view = render(tree(true));
    await waitFor(() => assert.equal(stateText(), "ready"));
    view.rerender(tree(false));
    view.unmount();
    await tick(5);
    assert.equal(getNativeBridgeDiagnostics().disposeCount, 1);
  });
});
