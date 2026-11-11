# API reference — `@veolms/react-webview-bridge` 0.2.0

Every export of `src/index.ts`, with its signature, parameters, return shape, errors, and when to use it.
The signatures are copied from the source. If this file and the code ever disagree, the code wins, so fix this file.

Contents:
[Components](#components) ·
[Hooks](#hooks) ·
[Controller (framework-agnostic)](#controller-framework-agnostic) ·
[Teardown & diagnostics](#teardown--diagnostics) ·
[Errors](#errors) ·
[Retry helpers](#retry-helpers) ·
[Presence helpers & constants](#presence-helpers--constants) ·
[Types](#types)

Throughout, `T` is your bridge contract, normally the generated `NativeBridgeContract` (see
[PATTERNS.md § typed contract](PATTERNS.md#1-typed-contract)). `T` defaults to `Record<string, unknown>`.

---

## Components

### `NativeBridgeProvider`

```ts
function NativeBridgeProvider(props: NativeBridgeProviderProps): JSX.Element;

interface NativeBridgeProviderProps {
  endpointName?: string; // default "NativeBridge"
  options?: NativeBridgeOptions; // = BuildBridgeOptions of @veolms/webview-bridge
  retry?: Partial<RetryPolicy>; // merged with DEFAULT_RETRY_POLICY
  keepAlive?: boolean; // default false
  children?: ReactNode;
}
```

| Prop           | Required | Default                | Meaning                                                                                                                                                                                                                           |
| -------------- | -------- | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `endpointName` | no       | `"NativeBridge"`       | Name of the native endpoint object on `window`. It is trimmed, and an empty string falls back to the default. One controller exists per name.                                                                                     |
| `options`      | no       | `{}`                   | Passed to `buildNativeBridge`: `debug`, `timeoutMs` (per-request timeout, default 30000; also the handshake timeout when > 0, else 10000), `onInitError`, `onError`. **Read once**, when the controller for this name is created. |
| `retry`        | no       | `DEFAULT_RETRY_POLICY` | Backoff for init attempts. **Read once**, like `options`.                                                                                                                                                                         |
| `keepAlive`    | no       | `false`                | `true` means this provider never releases its reference, so the session outlives the provider.                                                                                                                                    |
| `children`     | no       | —                      | —                                                                                                                                                                                                                                 |

Behaviour:

- During render, it gets or creates the module-level controller for `endpointName` (`getBridgeController(name, { options, retry })`).
  The `useMemo` depends on `name` only, so changing `options` or `retry` later has no effect.
- In an effect, it calls `controller.acquire()`. The first acquire on an `idle` controller starts initialization. The
  effect's cleanup releases the reference, except with `keepAlive`.
- It provides the controller through `NativeBridgeContext`.
- Several providers for the same name share one controller and one session. Providers for different names are independent.
- It renders `children` immediately. It does **not** block rendering until the bridge is ready, so gate the UI yourself on `state`.

Use exactly one at the app root (and one at the root of each iframe document that needs the bridge). Nested providers for the
same name are allowed, but they add nothing.

### `BridgeErrorBoundary`

```ts
class BridgeErrorBoundary extends Component<BridgeErrorBoundaryProps> {
  reset(): void;
}

interface BridgeErrorBoundaryProps {
  fallback: ReactNode | ((error: Error, reset: () => void) => ReactNode); // required
  onError?: (error: Error, info: ErrorInfo) => void;
  resetKeys?: readonly unknown[];
  children?: ReactNode;
}
```

- It catches **render-time** errors in its subtree. Bridge calls are async, so a rejected `call` or `useBridgeCall.run` reaches
  the boundary only if you rethrow the error during render (for example `if (status === "error") throw error;`).
- A non-`Error` thrown value is wrapped as `new Error(String(value))`.
- `onError` is called once per caught error, from `componentDidCatch`.
- When any entry of `resetKeys` changes (shallow `Object.is` per index, or a length change), the boundary resets. You can also call `reset` from the
  function `fallback`.

Use it around bridge-dependent screens that prefer to throw instead of branching on state.

---

## Hooks

All hooks must be used under a `NativeBridgeProvider`. Otherwise they throw
`Error("[react-webview-bridge] No <NativeBridgeProvider> found. Wrap your app (or iframe root) in one.")`.

### `useNativeBridge<T>()`

```ts
function useNativeBridge<
  T extends object = Record<string, unknown>,
>(): UseNativeBridgeResult<T>;

interface UseNativeBridgeResult<T> extends BridgeSnapshot<T> {
  readonly isReady: boolean;
  readonly retry: () => void;
  readonly call: BridgeController<T>["call"];
  readonly whenReady: (options?: WaitOptions) => Promise<ReadyBridge<T>>;
}
```

It subscribes to the controller with `useSyncExternalStore`, so it re-renders on every snapshot change.

| Field             | Type                                             | Meaning                                                                                                       |
| ----------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| `endpointName`    | `string`                                         | Normalized endpoint name.                                                                                     |
| `state`           | `BridgeState`                                    | `"idle" \| "initializing" \| "ready" \| "unavailable" \| "error"`. See [LIFECYCLE.md](LIFECYCLE.md).          |
| `bridge`          | `BridgeInstance<T> \| null`                      | The typed proxy when `state === "ready"`, else `null`.                                                        |
| `error`           | `Error \| null`                                  | Last init failure. It is kept while retrying and in terminal states, and cleared on success and on a new run. |
| `attempt`         | `number`                                         | 1-based attempt number of the current run, `0` before the first attempt.                                      |
| `maxAttempts`     | `number`                                         | From the resolved retry policy.                                                                               |
| `endpointPresent` | `boolean`                                        | Whether `window[endpointName]` (or the iOS handler) existed at the last check.                                |
| `nextRetryAt`     | `number \| null`                                 | Epoch ms of the next scheduled attempt while backing off, else `null`.                                        |
| `isReady`         | `boolean`                                        | `state === "ready" && bridge !== null`.                                                                       |
| `retry`           | `() => void`                                     | Same as [`controller.retry()`](#bridgecontrollert).                                                           |
| `call`            | see [`controller.call`](#bridgecontrollert)      | Stable identity (the controller's bound method).                                                              |
| `whenReady`       | see [`controller.whenReady`](#bridgecontrollert) | Stable identity.                                                                                              |

The result object is memoized per snapshot. `retry`, `call` and `whenReady` are stable for the controller's lifetime, so they are safe
in effect dependency arrays.

Use it for gating UI on state, for showing retry UI, and for getting `call`/`whenReady` inside components.

### `useBridgeCall(fn, options?)`

```ts
function useBridgeCall<T extends object, A extends unknown[], R>(
  fn: (bridge: BridgeInstance<T>, ...args: A) => R | Promise<R>,
  options?: WaitOptions,
): UseBridgeCallResult<A, Awaited<R>>;

type BridgeCallStatus = "idle" | "pending" | "success" | "error";

interface UseBridgeCallResult<A extends unknown[], R> {
  readonly run: (...args: A) => Promise<R>;
  readonly status: BridgeCallStatus;
  readonly data: R | undefined;
  readonly error: unknown;
  readonly reset: () => void;
}
```

| Param     | Required | Meaning                                                                                                                                                                                                                                                                                       |
| --------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `fn`      | yes      | Receives the ready proxy plus `run`'s arguments. It is read through a ref, so an inline arrow is fine and does not change `run`. Annotate the first parameter (`(b: BridgeInstance<MyContract>, id: string) => …`) so `T` and `A` are inferred. **Never return the proxy or a nested proxy.** |
| `options` | no       | `WaitOptions` used by every `run` (latest value, read through a ref).                                                                                                                                                                                                                         |

| Result field   | Meaning                                                                                                                                                                                                                                                                                                    |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `run(...args)` | Calls `controller.call(b => fn(b, ...args), options)`. Before the call it sets `status: "pending"` and clears `error`, but keeps the previous `data`. It **returns a promise that rejects on failure**, so handle it or prefix it with `void` and rely on `status`/`error`. It never throws synchronously. |
| `status`       | `"idle"` → `"pending"` → `"success"` / `"error"`.                                                                                                                                                                                                                                                          |
| `data`         | Result of the latest successful run. It is kept on later errors and pending states, and cleared only by `reset()`.                                                                                                                                                                                         |
| `error`        | Rejection of the latest run: a `BridgeNotReadyError`, a library `BridgeError` from the call, or whatever `fn` threw.                                                                                                                                                                                       |
| `reset()`      | Back to `idle`, with `data` and `error` cleared. An in-flight run no longer updates state, but its promise still settles.                                                                                                                                                                                  |

Only the **latest** run updates state, and no state updates happen after unmount. Earlier runs still resolve or reject their own promises.

Use it for user-triggered calls whose status you render (buttons, forms, "load" actions).

### `useBridgeEvent(eventName, handler, options?)`

```ts
function useBridgeEvent<P = BridgeValue>(
  eventName: string,
  handler: (payload: P) => void,
  options?: UseBridgeEventOptions,
): void;

interface UseBridgeEventOptions {
  enabled?: boolean;
} // default true
```

- It subscribes with `bridge.onEvent(eventName, …)` once `state === "ready"` and `enabled` is true.
- The **latest** `handler` is always called, because it is kept in a ref. A new inline handler on every render does not resubscribe.
- It unsubscribes on unmount, when `eventName` or `enabled` changes, and when the bridge instance changes (dispose plus a new session).
- Events emitted before the subscription exists (before ready, or while disabled) are **not** buffered.
- `P` is not checked at runtime. Native may deliver `null` (an explicit `null` or an omitted payload), so type it as `X | null` when
  that can happen.

Use it for every native → web event in components.

### `useBridgeController<T>()`

```ts
function useBridgeController<
  T extends object = Record<string, unknown>,
>(): BridgeController<T>;
```

Returns the controller of the nearest provider **without subscribing** to state, so it causes no re-renders. It throws outside a
provider. Use it when a component only needs `call`/`whenReady`/`retry` and must not re-render on state changes, or to pass the
controller to non-React code.

### `NativeBridgeContext`

```ts
const NativeBridgeContext: React.Context<BridgeController | null>; // null outside a provider
```

This is the raw context. Prefer `useBridgeController()`. Read it directly only for an optional-provider pattern
(`useContext(NativeBridgeContext) ?? fallback`).

---

## Controller (framework-agnostic)

### `getBridgeController<T>(endpointName?, config?)`

```ts
function getBridgeController<T extends object = Record<string, unknown>>(
  endpointName?: string, // default "NativeBridge" (normalized)
  config?: BridgeControllerConfig, // { options?: NativeBridgeOptions; retry?: Partial<RetryPolicy> }
): BridgeController<T>;
```

- It returns the app-wide controller for the name, creating it on first use. `config` applies **only when this call creates the
  controller** ("first call wins"). Later calls ignore `config`.
- Creating a controller does **not** start initialization. `acquire()` does, which is what the provider calls. Without any
  provider, non-React code must call `acquire()` itself (see [PATTERNS.md § non-React code](PATTERNS.md#9-non-react-code)).
- The controller is removed from the registry when its last owner releases (after the deferred dispose) or on
  `disposeNativeBridge` while it has no owners. The next `getBridgeController` then creates a fresh controller, which reads `config` again.

Never throws.

### `BridgeController<T>`

```ts
interface BridgeController<T extends object = Record<string, unknown>> {
  readonly endpointName: string;
  subscribe(listener: () => void): () => void;
  getSnapshot(): BridgeSnapshot<T>;
  retry(): void;
  whenReady(options?: WaitOptions): Promise<ReadyBridge<T>>;
  call<R>(
    fn: (bridge: BridgeInstance<T>) => R | Promise<R>,
    options?: WaitOptions,
  ): Promise<Awaited<R>>;
  acquire(): () => void;
}
```

All methods are bound arrow properties, so you can pass them around detached (`const { call } = controller`).

| Member                | Contract                                                                                                                                                                                                                                                                                                                   |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `subscribe(listener)` | Called after every snapshot change. Returns the unsubscribe function. A throwing listener is caught and logged with `console.error`.                                                                                                                                                                                       |
| `getSnapshot()`       | Current immutable `BridgeSnapshot<T>`. A new object on every change, so it works with `useSyncExternalStore`.                                                                                                                                                                                                              |
| `retry()`             | **No-op** when `ready` or while an attempt is in flight. While backing off (`initializing`, timer pending), it skips the delay and runs the next attempt of the same run now (`attempt` keeps counting). From `idle`, `unavailable` or `error`, it starts a **new run** (`attempt` resets, `error` cleared). Never throws. |
| `whenReady(options?)` | Resolves `{ bridge }` (a [`ReadyBridge`](#readybridget) box, never the proxy itself) immediately if ready, else when ready. Rejects with `BridgeNotReadyError` (see the table below). Never throws synchronously.                                                                                                          |
| `call(fn, options?)`  | If ready, it runs `fn(bridge)` right away. Otherwise it awaits `whenReady(options)` first. It resolves with `fn`'s awaited result and rejects with `BridgeNotReadyError` or whatever `fn`/the native call rejected with. It never disposes or restarts anything.                                                           |
| `acquire()`           | Adds an owner, cancels a pending deferred dispose, and starts a run if the state is `idle` and nothing is in flight. Returns an idempotent `release()`. When the owner count drops to 0, the session is disposed **one macrotask later** (`setTimeout 0`) unless something re-acquires first.                              |

`WaitOptions` and the rejection reasons of `whenReady`/`call`:

```ts
interface WaitOptions {
  waitForReady?: boolean; // default true
  timeoutMs?: number; // default DEFAULT_READY_TIMEOUT_MS = 10000; 0 = no time limit
  signal?: AbortSignal;
}
```

| Situation (bridge not ready)                      | `BridgeNotReadyError.reason` | When                        |
| ------------------------------------------------- | ---------------------------- | --------------------------- |
| `waitForReady: false`                             | `"not-ready"`                | immediately (checked first) |
| state is `unavailable` / `error`                  | `"unavailable"` / `"error"`  | immediately                 |
| `signal` already aborted                          | `"aborted"`                  | immediately                 |
| run ends in `unavailable` / `error` while waiting | `"unavailable"` / `"error"`  | at that moment              |
| controller disposed or reset while waiting        | `"disposed"`                 | at that moment              |
| `signal` aborts while waiting                     | `"aborted"`                  | at that moment              |
| `timeoutMs` elapsed (`> 0`)                       | `"timeout"`                  | after `timeoutMs`           |

`timeoutMs` only bounds the **wait for readiness**. The native call itself is bounded by `options.timeoutMs` of the provider
(`BuildBridgeOptions`, default 30000 ms), and when it expires it rejects with the library's `BridgeTimeoutError`.

Errors that come from the call itself, not from readiness, are the library's classes from `@veolms/webview-bridge`:
`BridgeNativeError` (native returned an error; the `code` comes from native), `BridgeTimeoutError` (`TIMEOUT_ERROR`),
`BridgeTransportError` (`TRANSPORT_ERROR`, for example a disposed session), `BridgeReadOnlyError` (`READ_ONLY_PROPERTY`,
`$set` on a read-only property) and `BridgeProtocolError`. All of them extend `BridgeError` and have a stable `code`.

---

## Teardown & diagnostics

### `disposeNativeBridge(endpointName?)`

```ts
function disposeNativeBridge(endpointName?: string): boolean;
```

For **one** endpoint, it:

1. cancels timers and invalidates in-flight attempts;
2. rejects pending waiters with reason `"disposed"`;
3. resets the snapshot to `idle`;
4. disposes the session through the root proxy's `dispose()`. That disposes the transport and endpoint, removes the window
   callbacks and listeners, and evicts only this name from the library cache.

It returns `true` if a live (ready) session was disposed, and `false` if there was no controller or it was not ready. When the
controller has no owners, it is also removed from the registry.

Mounted consumers then see `idle`. Nothing restarts automatically. Call `retry()` or remount the provider to build a fresh
session. Other endpoints are untouched. Never throws.

### `resetNativeBridges()`

```ts
function resetNativeBridges(): void;
```

Hard reset for **tests** and full teardown. It destroys every controller (without deferral), clears the registry, calls the
library's `clearNativeBridgeCache()` (which disposes every library session, including ones created outside this SDK, and aborts
in-flight library inits), and clears the diagnostics counters. Do not call it while providers are mounted unless you remount them.
Typical use: `afterEach(() => { cleanup(); resetNativeBridges(); })`.

### `getNativeBridgeDiagnostics(endpointName?)`

```ts
function getNativeBridgeDiagnostics(
  endpointName?: string,
): NativeBridgeDiagnostics;

interface NativeBridgeDiagnostics {
  readonly endpointName: string;
  readonly buildCalls: number; // buildNativeBridge invocations by this SDK (incl. retries)
  readonly readyCount: number; // times a controller reached ready
  readonly disposeCount: number; // sessions disposed by this SDK
  readonly controllersCreated: number; // controllers created for this name
  readonly refCount: number; // owners of the live controller (0 if none)
  readonly state: BridgeState; // live controller's state, "idle" if none
}
```

The counters survive controller disposal and are cleared only by `resetNativeBridges()`. Use them in tests and debug screens,
for example to assert a single init under StrictMode (`buildCalls === 1 && disposeCount === 0`).

### `hasBridgeController(endpointName?)`

```ts
function hasBridgeController(endpointName?: string): boolean;
```

Whether a controller for the name currently exists in the registry. This does not tell you whether it is ready, so use
`getSnapshot().state` for that.

---

## Errors

### `BridgeNotReadyError`

```ts
class BridgeNotReadyError extends BridgeError {
  // BridgeError from @veolms/webview-bridge
  static readonly CODE = "BRIDGE_NOT_READY";
  readonly code: "BRIDGE_NOT_READY"; // (typed as string, inherited)
  readonly name: "BridgeNotReadyError"; // literal; survives minification
  readonly endpointName: string;
  readonly reason: BridgeNotReadyReason;
  readonly state: BridgeState; // controller state at rejection time
  readonly cause: Error | undefined; // underlying init failure, when known
  constructor(
    endpointName: string,
    reason: BridgeNotReadyReason,
    state: BridgeState,
    cause?: Error | null,
    message?: string,
  );
}

type BridgeNotReadyReason =
  "not-ready" | "timeout" | "unavailable" | "error" | "disposed" | "aborted";
```

| `reason`        | Meaning                                                                                                                                                 | Typical handling                                 |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `"not-ready"`   | `waitForReady: false` and not ready                                                                                                                     | Skip the optional action.                        |
| `"timeout"`     | Not ready within `WaitOptions.timeoutMs`                                                                                                                | Show "still connecting" and let the user retry.  |
| `"unavailable"` | Retries exhausted, endpoint never injected (running in a normal browser)                                                                                | Hide native features.                            |
| `"error"`       | Retries exhausted, endpoint present but handshake failed (`cause` is a `BridgeError`, e.g. `BridgeInitializationError` for a protocol version mismatch) | Report it and offer `retry()`.                   |
| `"disposed"`    | `disposeNativeBridge`/`resetNativeBridges`/last provider unmount happened while waiting                                                                 | Usually ignore it (the component is going away). |
| `"aborted"`     | Your `AbortSignal` fired                                                                                                                                | Ignore it.                                       |

`instanceof BridgeError` holds. Branch on `reason` (or `code`), never on `message`.

### `isBridgeNotReadyError(error)`

```ts
function isBridgeNotReadyError(error: unknown): error is BridgeNotReadyError;
```

Returns true for `instanceof BridgeNotReadyError`, **or** any object whose `code === "BRIDGE_NOT_READY"`, so it works across
duplicated bundles. Prefer it to `instanceof`.

---

## Retry helpers

```ts
interface RetryPolicy {
  maxAttempts: number; // total buildNativeBridge attempts per run, >= 1     (default 5)
  initialDelayMs: number; // delay after the 1st failed attempt, >= 0          (default 100)
  factor: number; // multiplier per failed attempt, >= 1               (default 2)
  maxDelayMs: number; // cap for a single delay, >= 0                      (default 2000)
}

const DEFAULT_RETRY_POLICY: Readonly<RetryPolicy>; // { 5, 100, 2, 2000 } (frozen)
function resolveRetryPolicy(partial?: Partial<RetryPolicy>): RetryPolicy;
function computeRetryDelay(policy: RetryPolicy, failedAttempt: number): number;
```

- `resolveRetryPolicy` fills in the defaults. Non-finite or missing values use the default. Values below the minimum are clamped
  (`maxAttempts` is then floored, so `0.5` becomes `1`).
- `computeRetryDelay(policy, n)` = `min(initialDelayMs · factor^(n−1), maxDelayMs)`, the delay after the n-th (1-based)
  failed attempt. With the defaults that is 100, 200, 400, 800 ms, about 1.5 s of backoff before `unavailable`.
  The backoff is additive to each attempt's own duration. An absent endpoint fails instantly, while a present but silent native
  waits for the handshake timeout each attempt (`options.timeoutMs` if > 0, else 10000 ms).

You only need these to display a countdown or to test a policy. The provider applies them for you.

---

## Presence helpers & constants

```ts
const DEFAULT_ENDPOINT_NAME = "NativeBridge";
const DEFAULT_READY_TIMEOUT_MS = 10000;
function normalizeEndpointName(endpointName: string | undefined): string; // trim, "" → "NativeBridge"
function isNativeEndpointPresent(name?: string): boolean; // default "NativeBridge"
```

- `DEFAULT_ENDPOINT_NAME` mirrors the bridge's `DEFAULT_BRIDGE_NAME`, which `@veolms/webview-bridge` does not export.
- `normalizeEndpointName` normalizes exactly like `buildNativeBridge`.
- `isNativeEndpointPresent` is a **side-effect-free** probe: iOS `window.webkit.messageHandlers[name].postMessage`, else
  Android `window[name].postMessage`. It returns `false` without `window` and never throws. Use it for cheap "are we inside the app?"
  checks. **Never** probe by constructing an endpoint (see [Pitfalls](../README.md#pitfalls)).

---

## Types

| Type                                                                                                                                                                                                             | Definition / meaning                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `BridgeState`                                                                                                                                                                                                    | `"idle" \| "initializing" \| "ready" \| "unavailable" \| "error"`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `BridgeTerminalState`                                                                                                                                                                                            | `"unavailable" \| "error"`. You leave them with `retry()`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `BridgeSnapshot<T>`                                                                                                                                                                                              | `{ endpointName, state, bridge, error, attempt, maxAttempts, endpointPresent, nextRetryAt }`, all `readonly`. Fields as in [`useNativeBridge`](#usenativebridget).                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `BridgeInstance<T>`                                                                                                                                                                                              | `T & NativeBridgeRoot`, the proxy you call.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `NativeBridgeRoot`                                                                                                                                                                                               | Root helpers the library proxy implements: `onEvent<P>(name, handler): () => void`, `dispose(): void` (prefer `disposeNativeBridge`), `$has(member?): boolean`, `$get(member): Promise<BridgeValue \| null>`, `$set(member, value): Promise<void>`, `readonly $disposed: boolean`, `toJSON(): { endpoint, sessionId, protocolVersion }`. `$has`/`$get`/`$set`/`$disposed` also exist on every nested namespace proxy at runtime, but your contract `T` has to type them there if you want to use them (`(b.fix as unknown as NativeBridgeRoot).$has("x")`, or call the root form with a full path, e.g. `b.$has("fix:tags")`). |
| `BridgeController<T>`                                                                                                                                                                                            | See [above](#bridgecontrollert).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `BridgeControllerConfig`                                                                                                                                                                                         | `{ options?: NativeBridgeOptions; retry?: Partial<RetryPolicy> }`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `NativeBridgeOptions`                                                                                                                                                                                            | Alias of `BuildBridgeOptions`: `{ debug?, timeoutMs?, onInitError?, onError? }`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `RetryPolicy`                                                                                                                                                                                                    | See [Retry helpers](#retry-helpers).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `WaitOptions`                                                                                                                                                                                                    | `{ waitForReady?: boolean = true; timeoutMs?: number = 10000; signal?: AbortSignal }`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| <a id="readybridget"></a>`ReadyBridge<T>`                                                                                                                                                                        | `{ readonly bridge: BridgeInstance<T> }`, the box `whenReady` resolves.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `NativeBridgeProviderProps`, `UseNativeBridgeResult<T>`, `UseBridgeCallResult<A, R>`, `BridgeCallStatus`, `UseBridgeEventOptions`, `BridgeErrorBoundaryProps`, `NativeBridgeDiagnostics`, `BridgeNotReadyReason` | Documented with their API above.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |

Not exported, on purpose: the controller class (use the interface), the registry, and the fake native used by the tests
(`src/__tests__/fake-native.ts`; see [PATTERNS.md § testing](PATTERNS.md#13-testing-with-the-fake-native)).
