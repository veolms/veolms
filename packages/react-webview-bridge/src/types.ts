import type {
  BridgeEventHandler,
  BridgeValue,
  BuildBridgeOptions,
} from "@veolms/webview-bridge";

/**
 * Lifecycle state of a bridge controller.
 *
 * - `idle`: not started yet (no provider mounted), or reset by {@link disposeNativeBridge}.
 * - `initializing`: an init attempt is in flight, or the controller waits for the next retry.
 * - `ready`: the handshake succeeded; `bridge` is set.
 * - `unavailable`: retries exhausted and the endpoint object was never found on `window`.
 * - `error`: retries exhausted; the endpoint exists but the handshake failed (see `error`).
 */
export type BridgeState =
  "idle" | "initializing" | "ready" | "unavailable" | "error";

/** Terminal (retry-exhausted) states. Leave them with `retry()`. */
export type BridgeTerminalState = "unavailable" | "error";

/**
 * Members every root bridge proxy has in addition to the generated contract `T`.
 * (They are implemented by the `@veolms/webview-bridge` root proxy, not by native.)
 */
export interface NativeBridgeRoot {
  /** Subscribes to a native event; returns the unsubscribe function. */
  onEvent<P = BridgeValue>(
    eventName: string,
    handler: (payload: P) => void,
  ): () => void;
  /**
   * Disposes the session and evicts it from the library cache.
   * Prefer {@link disposeNativeBridge} so the React controller state stays in sync.
   */
  dispose(): void;
  /** Feature detection: whether native exposes `member` (or, without argument, the root). */
  $has(member?: string): boolean;
  /** Reads a property; resolves `null` when native does not expose a readable property. */
  $get(member: string): Promise<BridgeValue | null>;
  /** Writes a property and resolves once native acknowledged it. */
  $set(member: string, value: unknown): Promise<void>;
  /**
   * `true` once the session was disposed (a boolean, not a function). A disposed proxy rejects
   * every call with `BridgeTransportError`; get a fresh one from the controller instead.
   */
  readonly $disposed: boolean;
  toJSON(): {
    endpoint: string;
    sessionId: string | null;
    protocolVersion: number;
  };
}

/** The typed proxy handed to consumers: the generated contract plus the root helpers. */
export type BridgeInstance<T extends object = Record<string, unknown>> = T &
  NativeBridgeRoot;

/** Untyped event handler as used by the library. */
export type { BridgeEventHandler };

/**
 * Exponential backoff used while the endpoint is not injected yet or the handshake fails.
 * Delay before attempt `n + 1` = `min(initialDelayMs * factor^(n - 1), maxDelayMs)`.
 */
export interface RetryPolicy {
  /** Total number of `buildNativeBridge` attempts per run (>= 1). Default 5. */
  maxAttempts: number;
  /** Delay after the first failed attempt. Default 100 ms. */
  initialDelayMs: number;
  /** Multiplier applied per failed attempt. Default 2. */
  factor: number;
  /** Upper bound for a single delay. Default 2000 ms. */
  maxDelayMs: number;
}

/** Options forwarded to `buildNativeBridge` (first controller for an endpoint wins). */
export type NativeBridgeOptions = BuildBridgeOptions;

/** Configuration of a per-endpoint controller. Only the first configuration for a name applies. */
export interface BridgeControllerConfig {
  options?: NativeBridgeOptions;
  retry?: Partial<RetryPolicy>;
}

/**
 * Immutable state snapshot (a new object on every change; safe for `useSyncExternalStore`).
 */
export interface BridgeSnapshot<T extends object = Record<string, unknown>> {
  readonly endpointName: string;
  readonly state: BridgeState;
  /** The proxy when `state === "ready"`, else `null`. Never `await` it or resolve a promise with it. */
  readonly bridge: BridgeInstance<T> | null;
  /** Last init failure (kept while retrying and in terminal states), else `null`. */
  readonly error: Error | null;
  /** 1-based attempt number of the current run; 0 before the first attempt. */
  readonly attempt: number;
  readonly maxAttempts: number;
  /** Whether the endpoint object was present on `window` at the last check. */
  readonly endpointPresent: boolean;
  /** Epoch ms of the scheduled next attempt while backing off, else `null`. */
  readonly nextRetryAt: number | null;
}

/** Options of {@link BridgeController.whenReady} and {@link BridgeController.call}. */
export interface WaitOptions {
  /**
   * Wait (queue) until the bridge is ready when it is not ready yet. Default `true`.
   * With `false` a not-ready bridge rejects immediately with `BridgeNotReadyError`.
   */
  waitForReady?: boolean;
  /**
   * Upper bound for waiting for readiness, in ms. Default 10000. `0` waits without a time limit
   * (still rejected on a terminal state or dispose). Does not limit the native call itself; use
   * `BuildBridgeOptions.timeoutMs` for that.
   */
  timeoutMs?: number;
  /** Abort waiting; rejects with `BridgeNotReadyError` (reason `aborted`). */
  signal?: AbortSignal;
}

/** Wrapper used to hand out the proxy through promises (the proxy itself must never be a resolution value). */
export interface ReadyBridge<T extends object = Record<string, unknown>> {
  readonly bridge: BridgeInstance<T>;
}

/** Public, framework-agnostic surface of a per-endpoint controller. */
export interface BridgeController<T extends object = Record<string, unknown>> {
  readonly endpointName: string;
  /** Subscribe to snapshot changes (for `useSyncExternalStore`). */
  subscribe(listener: () => void): () => void;
  getSnapshot(): BridgeSnapshot<T>;
  /**
   * Starts a fresh run of attempts after a terminal state or a reset, or skips the pending
   * backoff delay. No-op while ready or while an attempt is in flight.
   */
  retry(): void;
  /** Resolves `{ bridge }` once ready. Rejects with `BridgeNotReadyError` (never resolves with the proxy itself). */
  whenReady(options?: WaitOptions): Promise<ReadyBridge<T>>;
  /** Runs `fn(bridge)` now if ready, else after readiness (see {@link WaitOptions}). */
  call<R>(
    fn: (bridge: BridgeInstance<T>) => R | Promise<R>,
    options?: WaitOptions,
  ): Promise<Awaited<R>>;
  /**
   * Registers an owner (a provider). Starts initialization on first use. Returns `release`;
   * when the last owner releases, the session is disposed after a macrotask (so StrictMode's
   * mount → unmount → mount never disposes).
   */
  acquire(): () => void;
}
