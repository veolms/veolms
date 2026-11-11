import {
  BridgeError,
  buildNativeBridge,
  clearNativeBridgeCache,
} from "@veolms/webview-bridge";
import { BridgeNotReadyError, type BridgeNotReadyReason } from "./errors.ts";
import { isNativeEndpointPresent, normalizeEndpointName } from "./presence.ts";
import { computeRetryDelay, resolveRetryPolicy } from "./retry.ts";
import type {
  BridgeController,
  BridgeControllerConfig,
  BridgeInstance,
  BridgeSnapshot,
  BridgeState,
  NativeBridgeOptions,
  ReadyBridge,
  RetryPolicy,
  WaitOptions,
} from "./types.ts";

/** Default `timeoutMs` for waiting on readiness in `call`/`whenReady`. */
export const DEFAULT_READY_TIMEOUT_MS = 10000;

type AnyBridge = BridgeInstance<Record<string, unknown>>;

interface Waiter {
  resolve(value: ReadyBridge<Record<string, unknown>>): void;
  reject(error: BridgeNotReadyError): void;
}

/** Counters per endpoint name; they survive controller disposal (cleared by `resetNativeBridges`). */
export interface NativeBridgeDiagnostics {
  readonly endpointName: string;
  /** Number of `buildNativeBridge` invocations made by this SDK (including retries). */
  readonly buildCalls: number;
  /** Number of times a controller reached `ready`. */
  readonly readyCount: number;
  /** Number of sessions this SDK disposed. */
  readonly disposeCount: number;
  /** Number of controllers created for this name. */
  readonly controllersCreated: number;
  /** Current owners (mounted providers) of the live controller, 0 if none. */
  readonly refCount: number;
  /** State of the live controller, `idle` if none. */
  readonly state: BridgeState;
}

interface MutableCounters {
  buildCalls: number;
  readyCount: number;
  disposeCount: number;
  controllersCreated: number;
}

const registry = new Map<string, BridgeControllerImpl>();
const counters = new Map<string, MutableCounters>();

function countersFor(name: string): MutableCounters {
  let entry = counters.get(name);
  if (!entry) {
    entry = {
      buildCalls: 0,
      readyCount: 0,
      disposeCount: 0,
      controllersCreated: 0,
    };
    counters.set(name, entry);
  }
  return entry;
}

function toError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}

function isTerminal(state: BridgeState): state is "unavailable" | "error" {
  return state === "unavailable" || state === "error";
}

/**
 * Per-endpoint store living outside React: owns the init run (attempts + backoff), the snapshot,
 * readiness waiters and the owner ref-count.
 */
class BridgeControllerImpl implements BridgeController<
  Record<string, unknown>
> {
  public readonly endpointName: string;
  private readonly options: NativeBridgeOptions;
  private readonly policy: RetryPolicy;
  private snapshot: BridgeSnapshot<Record<string, unknown>>;
  private readonly listeners = new Set<() => void>();
  private readonly waiters = new Set<Waiter>();
  /** Bumped by every new run and by dispose; stale attempts/timers compare against it. */
  private runId = 0;
  /** Run id of the attempt currently awaiting `buildNativeBridge`, or `null`. */
  private inFlightRun: number | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private refCount = 0;
  private releaseTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    endpointName: string,
    config: BridgeControllerConfig | undefined,
  ) {
    this.endpointName = endpointName;
    this.options = { ...config?.options };
    this.policy = resolveRetryPolicy(config?.retry);
    this.snapshot = this.idleSnapshot();
    countersFor(endpointName).controllersCreated++;
  }

  get owners(): number {
    return this.refCount;
  }

  private idleSnapshot(): BridgeSnapshot<Record<string, unknown>> {
    return {
      endpointName: this.endpointName,
      state: "idle",
      bridge: null,
      error: null,
      attempt: 0,
      maxAttempts: this.policy.maxAttempts,
      endpointPresent: isNativeEndpointPresent(this.endpointName),
      nextRetryAt: null,
    };
  }

  private update(
    patch: Partial<BridgeSnapshot<Record<string, unknown>>>,
  ): void {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const listener of Array.from(this.listeners)) {
      try {
        listener();
      } catch (error) {
        console.error("[react-webview-bridge] snapshot listener threw:", error);
      }
    }
  }

  // ---- external store ----------------------------------------------------------------------

  public readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  public readonly getSnapshot = (): BridgeSnapshot<Record<string, unknown>> =>
    this.snapshot;

  // ---- ownership ---------------------------------------------------------------------------

  public readonly acquire = (): (() => void) => {
    this.refCount++;
    if (this.releaseTimer !== null) {
      clearTimeout(this.releaseTimer);
      this.releaseTimer = null;
    }
    if (this.snapshot.state === "idle" && !this.isCurrentRunInFlight()) {
      this.beginRun();
    }
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.release();
    };
  };

  private release(): void {
    this.refCount = Math.max(0, this.refCount - 1);
    if (this.refCount > 0 || this.releaseTimer !== null) {
      return;
    }
    // Deferred by a macrotask: StrictMode (and fast remounts / key changes) re-acquire synchronously
    // in the same commit, which cancels this timer, so the shared session survives.
    this.releaseTimer = setTimeout(() => {
      this.releaseTimer = null;
      if (this.refCount === 0) {
        this.dispose();
        if (registry.get(this.endpointName) === this) {
          registry.delete(this.endpointName);
        }
      }
    }, 0);
  }

  // ---- init runs ---------------------------------------------------------------------------

  public readonly retry = (): void => {
    const { state } = this.snapshot;
    if (state === "ready" || this.isCurrentRunInFlight()) {
      return;
    }
    if (state === "initializing" && this.retryTimer !== null) {
      // Skip the remaining backoff delay of the current run.
      this.clearRetryTimer();
      void this.attemptInit(this.runId);
      return;
    }
    this.beginRun();
  };

  private isCurrentRunInFlight(): boolean {
    return this.inFlightRun !== null && this.inFlightRun === this.runId;
  }

  private beginRun(): void {
    this.clearRetryTimer();
    this.runId++;
    this.update({ attempt: 0, error: null, nextRetryAt: null });
    void this.attemptInit(this.runId);
  }

  private clearRetryTimer(): void {
    if (this.retryTimer !== null) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
  }

  private async attemptInit(run: number): Promise<void> {
    if (run !== this.runId) return;
    const attempt = this.snapshot.attempt + 1;
    this.inFlightRun = run;
    this.update({ state: "initializing", attempt, nextRetryAt: null });
    countersFor(this.endpointName).buildCalls++;

    let initError: Error | null = null;
    let bridge: AnyBridge | null = null;
    try {
      bridge = await buildNativeBridge<AnyBridge>(this.endpointName, {
        ...this.options,
        onInitError: (error: Error) => {
          initError = error;
          try {
            this.options.onInitError?.(error);
          } catch (callbackError) {
            console.error(
              "[react-webview-bridge] onInitError threw:",
              callbackError,
            );
          }
        },
      });
    } catch (error) {
      // buildNativeBridge is documented not to throw; be defensive anyway.
      initError = toError(error);
      bridge = null;
    }
    // A `{ bridge }` box is used below on purpose: `bridge` must never travel as a promise value.

    if (this.inFlightRun === run) {
      this.inFlightRun = null;
    }
    if (run !== this.runId) {
      // Disposed/reset while in flight. The library shares one session per name, so a newer run
      // that started meanwhile, in this controller or in a replacement one, joined the same init
      // (in-flight dedupe) or will get it from the library's cache, and owns it. Release the
      // session only when no one does.
      const current = registry.get(this.endpointName);
      const ownedElsewhere =
        current !== undefined &&
        current !== this &&
        current.getSnapshot().state !== "idle";
      if (bridge && this.snapshot.state === "idle" && !ownedElsewhere) {
        this.disposeProxy(bridge);
      }
      return;
    }

    if (bridge) {
      countersFor(this.endpointName).readyCount++;
      this.update({
        state: "ready",
        bridge,
        error: null,
        endpointPresent: true,
        nextRetryAt: null,
      });
      const box: ReadyBridge<Record<string, unknown>> = { bridge };
      for (const waiter of Array.from(this.waiters)) {
        waiter.resolve(box);
      }
      return;
    }

    const present = isNativeEndpointPresent(this.endpointName);
    const error: Error =
      initError ??
      new Error(
        `Native bridge "${this.endpointName}" could not be initialized.`,
      );
    // A BridgeError means the endpoint existed and the handshake failed; the "endpoint missing"
    // failure of buildNativeBridge is a plain Error.
    const terminalState: "unavailable" | "error" =
      error instanceof BridgeError || present ? "error" : "unavailable";

    if (attempt < this.policy.maxAttempts) {
      const delay = computeRetryDelay(this.policy, attempt);
      this.update({
        error,
        endpointPresent: present,
        nextRetryAt: Date.now() + delay,
      });
      this.retryTimer = setTimeout(() => {
        this.retryTimer = null;
        void this.attemptInit(run);
      }, delay);
      return;
    }

    this.update({
      state: terminalState,
      error,
      endpointPresent: present,
      nextRetryAt: null,
    });
    this.rejectWaiters(terminalState, error);
  }

  private rejectWaiters(
    reason: BridgeNotReadyReason,
    cause: Error | null,
  ): void {
    const { state } = this.snapshot;
    for (const waiter of Array.from(this.waiters)) {
      waiter.reject(
        new BridgeNotReadyError(this.endpointName, reason, state, cause),
      );
    }
  }

  // ---- readiness / calls -------------------------------------------------------------------

  public readonly whenReady = (
    options?: WaitOptions,
  ): Promise<ReadyBridge<Record<string, unknown>>> => {
    const snap = this.snapshot;
    if (snap.state === "ready" && snap.bridge) {
      return Promise.resolve({ bridge: snap.bridge });
    }
    if (options?.waitForReady === false) {
      return Promise.reject(
        new BridgeNotReadyError(
          this.endpointName,
          "not-ready",
          snap.state,
          snap.error,
        ),
      );
    }
    if (isTerminal(snap.state)) {
      return Promise.reject(
        new BridgeNotReadyError(
          this.endpointName,
          snap.state,
          snap.state,
          snap.error,
        ),
      );
    }
    const signal = options?.signal;
    if (signal?.aborted) {
      return Promise.reject(
        new BridgeNotReadyError(
          this.endpointName,
          "aborted",
          snap.state,
          snap.error,
        ),
      );
    }

    const timeoutMs = options?.timeoutMs ?? DEFAULT_READY_TIMEOUT_MS;
    return new Promise<ReadyBridge<Record<string, unknown>>>(
      (resolve, reject) => {
        let timer: ReturnType<typeof setTimeout> | null = null;
        const onAbort = () => settle(() => reject(this.notReady("aborted")));
        const settle = (fn: () => void) => {
          if (!this.waiters.delete(waiter)) return;
          if (timer !== null) clearTimeout(timer);
          signal?.removeEventListener("abort", onAbort);
          fn();
        };
        const waiter: Waiter = {
          resolve: (box) => settle(() => resolve(box)),
          reject: (error) => settle(() => reject(error)),
        };
        this.waiters.add(waiter);
        if (timeoutMs > 0) {
          timer = setTimeout(() => {
            const { state, error } = this.snapshot;
            settle(() =>
              reject(
                new BridgeNotReadyError(
                  this.endpointName,
                  "timeout",
                  state,
                  error,
                  `Native bridge "${this.endpointName}" was not ready within ${timeoutMs}ms (state: ${state})`,
                ),
              ),
            );
          }, timeoutMs);
        }
        signal?.addEventListener("abort", onAbort, { once: true });
      },
    );
  };

  private notReady(reason: BridgeNotReadyReason): BridgeNotReadyError {
    const { state, error } = this.snapshot;
    return new BridgeNotReadyError(this.endpointName, reason, state, error);
  }

  public readonly call = async <R>(
    fn: (bridge: AnyBridge) => R | Promise<R>,
    options?: WaitOptions,
  ): Promise<Awaited<R>> => {
    const snap = this.snapshot;
    const bridge =
      snap.state === "ready" && snap.bridge
        ? snap.bridge
        : (await this.whenReady(options)).bridge;
    return await fn(bridge);
  };

  // ---- teardown ----------------------------------------------------------------------------

  /**
   * Cancels timers and waiters, disposes the session through the proxy's own `dispose()` and
   * returns to `idle`. Returns whether a live session was disposed.
   */
  public dispose(): boolean {
    this.runId++;
    this.clearRetryTimer();
    const bridge = this.snapshot.bridge;
    this.rejectWaiters("disposed", null);
    this.snapshot = this.idleSnapshot();
    this.update({});
    if (bridge) {
      this.disposeProxy(bridge);
      return true;
    }
    return false;
  }

  private disposeProxy(bridge: AnyBridge): void {
    countersFor(this.endpointName).disposeCount++;
    try {
      bridge.dispose();
    } catch (error) {
      console.warn(
        `[react-webview-bridge] disposing "${this.endpointName}" threw:`,
        error,
      );
    }
  }

  /** Used by `resetNativeBridges`: drop everything without deferring. */
  public destroy(): void {
    if (this.releaseTimer !== null) {
      clearTimeout(this.releaseTimer);
      this.releaseTimer = null;
    }
    this.dispose();
  }
}

/**
 * Returns the app-wide controller for `endpointName`, creating it on first use.
 * `config` only applies when this call creates the controller ("first configuration wins",
 * matching `buildNativeBridge`'s session cache). Creating a controller does not start init;
 * `acquire()` (done by `NativeBridgeProvider`) does.
 */
export function getBridgeController<T extends object = Record<string, unknown>>(
  endpointName?: string,
  config?: BridgeControllerConfig,
): BridgeController<T> {
  const name = normalizeEndpointName(endpointName);
  let controller = registry.get(name);
  if (!controller) {
    controller = new BridgeControllerImpl(name, config);
    registry.set(name, controller);
  }
  return controller as unknown as BridgeController<T>;
}

/** Whether a controller for `endpointName` currently exists. */
export function hasBridgeController(endpointName?: string): boolean {
  return registry.has(normalizeEndpointName(endpointName));
}

/**
 * Disposes the session of ONE endpoint via the root proxy's `dispose()` (which disposes the
 * transport/endpoint and evicts only that name from the library cache), rejects pending waiters,
 * and resets the controller to `idle`. Mounted consumers then see `idle`; call `retry()` (or
 * remount the provider) to initialize a fresh session.
 *
 * Deliberately not `clearNativeBridgeCache()`: that disposes the sessions of ALL endpoints
 * (including ones other providers/iframes use) and bumps a global generation that aborts unrelated
 * in-flight initializations.
 *
 * @returns whether a live session was disposed.
 */
export function disposeNativeBridge(endpointName?: string): boolean {
  const name = normalizeEndpointName(endpointName);
  const controller = registry.get(name);
  if (!controller) return false;
  const disposed = controller.dispose();
  if (controller.owners === 0) {
    registry.delete(name);
  }
  return disposed;
}

/**
 * Hard reset for tests and full teardown: destroys every controller, then calls the library's
 * `clearNativeBridgeCache()` (so sessions created outside this SDK are disposed too) and clears
 * the diagnostics counters. Do not call while providers are mounted unless you remount them.
 */
export function resetNativeBridges(): void {
  for (const controller of Array.from(registry.values())) {
    controller.destroy();
  }
  registry.clear();
  clearNativeBridgeCache();
  counters.clear();
}

/** Diagnostic counters for `endpointName` (e.g. to assert a single init under StrictMode). */
export function getNativeBridgeDiagnostics(
  endpointName?: string,
): NativeBridgeDiagnostics {
  const name = normalizeEndpointName(endpointName);
  const c = countersFor(name);
  const controller = registry.get(name);
  return {
    endpointName: name,
    buildCalls: c.buildCalls,
    readyCount: c.readyCount,
    disposeCount: c.disposeCount,
    controllersCreated: c.controllersCreated,
    refCount: controller?.owners ?? 0,
    state: controller?.getSnapshot().state ?? "idle",
  };
}
