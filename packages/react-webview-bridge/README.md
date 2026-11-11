# `@veolms/react-webview-bridge`

React bindings for [`@veolms/webview-bridge`](../webview-bridge/README.md), the zero-dependency TypeScript client for
native capabilities exposed by Android and iOS WebViews (protocol v1, JSBridge 0.2.0).

The package gives you **one shared native bridge session per endpoint** for the whole app, with:

- initialization exactly once, including under StrictMode and with multiple providers;
- retries with exponential backoff, and clear terminal states (`unavailable` when the page runs outside the app, `error` when the handshake fails);
- calls that are **queued until ready**, with bounded waits and typed `BridgeNotReadyError` rejections;
- event subscriptions that clean up after themselves;
- the same session for non-React code, through a framework-agnostic controller.

It is source-only TypeScript (`exports: "./src/index.ts"`, no build step), like `@veolms/webview-bridge`.

> **Docs:** this README is the entry point. Details are in [docs/API.md](docs/API.md) (every export, field by field),
> [docs/LIFECYCLE.md](docs/LIFECYCLE.md) (state machine, ref-counting, StrictMode) and
> [docs/PATTERNS.md](docs/PATTERNS.md) (copy-ready code). AI agents should start with [AGENTS.md](AGENTS.md).

---

## How it relates to `@veolms/webview-bridge`

```text
your components / services
        │  useNativeBridge · useBridgeCall · useBridgeEvent · getBridgeController
        ▼
@veolms/react-webview-bridge   ← per-endpoint controller: state, retries, waiters, ref-count
        │  buildNativeBridge(name, options) · proxy.dispose() · clearNativeBridgeCache() (tests only)
        ▼
@veolms/webview-bridge         ← handshake, typed Proxy, transport, request correlation, events
        ▼
Android (modern / legacy) / iOS WebView endpoint  ←→  native JSBridge
```

- The core library builds the typed proxy (`buildNativeBridge`), and it returns `null` when there is no endpoint or the handshake failed.
  It knows nothing about React, retries, or "not ready yet".
- This package decides **when** to call `buildNativeBridge`, how often, what the UI sees in the meantime, and when to dispose.
  It never changes wire behaviour, and it imports **only** from the bridge's public entry (`src/index.ts`).
- The proxy you call is the library's proxy. Everything in the library's README about the contract, NOOP, `null` vs `void`,
  errors and paths still applies.

## Install / workspace wiring

1. Copy this folder into the monorepo as `packages/react-webview-bridge/`, next to `packages/webview-bridge/`.
   `tsconfig.json` extends `../../tsconfig.base.json`, the same as the bridge package.
2. Add it to the app's dependencies:

   ```json
   {
     "dependencies": {
       "@veolms/react-webview-bridge": "workspace:*",
       "@veolms/webview-bridge": "workspace:*",
       "react": "^19.0.0",
       "react-dom": "^19.0.0"
     }
   }
   ```

3. Install with the workspace's package manager. The app's TypeScript and bundler then consume the `.ts` sources directly. The app's tsconfig
   needs what the bridge package already needs: `moduleResolution: "bundler"`, `allowImportingTsExtensions` (with `noEmit`),
   plus `jsx: "react-jsx"` (this package ships `.tsx`).

**Peer dependencies** (nothing is bundled):

| Peer                     | Range         | Note                                                                                                                                                                                                    |
| ------------------------ | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `react`                  | `>=18`        | Uses `useSyncExternalStore` (React 18+). Tested with React 19.                                                                                                                                          |
| `@veolms/webview-bridge` | `workspace:*` | Chosen because both packages live in the same workspace and are versioned together (0.2.0). With **npm** workspaces, which do not support the `workspace:` protocol, change it to `"0.2.0"` (or `"*"`). |

**Tests** use Node's built-in runner (`node:test` with `node:assert/strict`), like the rest of the monorepo. The dev dependencies
are declared in this package only: `jsdom` and `@testing-library/react` for the React tests (`src/__tests__/dom.ts` installs the
jsdom window), and `tsx` so Node can load the `.tsx` sources. The tests are in `src/__tests__/`. Run them with
`pnpm --filter @veolms/react-webview-bridge test`.

> This package was verified outside the monorepo with a harness that lives **next to** it, not in it:
> `captures/packages/{local-check.sh, package.json, vitest.local-check.config.ts}` plus a stand-in `captures/tsconfig.base.json`.
> Nothing inside `react-webview-bridge/` refers to it, so do not copy it.

## Quick start

```tsx
// main.tsx
import { NativeBridgeProvider } from "@veolms/react-webview-bridge";

const BRIDGE_OPTIONS = { timeoutMs: 15000 } as const; // module-level: options are read once

root.render(
  <StrictMode>
    <NativeBridgeProvider options={BRIDGE_OPTIONS}>
      <App />
    </NativeBridgeProvider>
  </StrictMode>,
);
```

```tsx
// Some component
import {
  useBridgeCall,
  useBridgeEvent,
  useNativeBridge,
  type BridgeInstance,
} from "@veolms/react-webview-bridge";
import type { NativeBridgeContract } from "./native/native-bridge-contracts"; // generated by the native build

type B = BridgeInstance<NativeBridgeContract>;

export function DeviceCard() {
  const { state, retry, call } = useNativeBridge<NativeBridgeContract>();
  const platform = useBridgeCall((b: B) => b.platform());
  const [battery, setBattery] = useState<number | null>(null);
  useBridgeEvent<{ level: number } | null>("battery", (p) =>
    setBattery(p?.level ?? null),
  );

  if (state === "unavailable") return <p>Open this page in the app.</p>;
  if (state === "error") return <button onClick={retry}>Reconnect</button>;

  return (
    <>
      <button onClick={() => void platform.run().catch(() => undefined)}>
        Load platform
      </button>
      {platform.data && (
        <p>
          {platform.data.type} / SDK {platform.data.sdkVersion}
        </p>
      )}
      <button
        onClick={() => void call((b) => b.showToast("Hi")).catch(console.warn)}
      >
        Toast
      </button>
      {battery !== null && <p>Battery {battery}%</p>}
    </>
  );
}
```

Calls made before the bridge is ready (`call`, `run`) wait for it, by default up to 10 s.

---

## Concepts

### The controller

The bridge does **not** live in React state. For each endpoint name there is one **controller**, a plain object in a
module-level registry outside React. It owns the init run (attempts and backoff), an immutable state **snapshot**, pending
`whenReady`/`call` waiters, and an **owner ref-count**. Providers and hooks only read it, with `useSyncExternalStore`. As a result,
re-renders, StrictMode and multiple providers can never cause a second handshake, and non-React code
(`getBridgeController`) shares the same session. There is one registry per JS realm, so each iframe has its own.

### Lifecycle states

| State          | Meaning                                                                                                    | `bridge` |
| -------------- | ---------------------------------------------------------------------------------------------------------- | -------- |
| `idle`         | Not started (no provider has acquired yet), or disposed/reset                                              | `null`   |
| `initializing` | An attempt is in flight, or the controller is backing off before the next one (`error`, `nextRetryAt` set) | `null`   |
| `ready`        | Handshake succeeded                                                                                        | proxy    |
| `unavailable`  | Retries exhausted and the endpoint object never appeared on `window` (a normal browser)                    | `null`   |
| `error`        | Retries exhausted, the endpoint exists but the handshake failed (`error` is a `BridgeError`)               | `null`   |

```text
idle ──acquire()/retry()──► initializing ──success──► ready
                              │  ▲  fail & attempts left: backoff, then next attempt (retry() skips the wait)
                              │  └──┘
                              └─ fail & no attempts left ─► unavailable | error ──retry()──► initializing
any state ──disposeNativeBridge / last provider unmounted (+1 macrotask) / resetNativeBridges──► idle
```

`retry()` is a no-op while `ready` or while an attempt is in flight. The full transition table is in [docs/LIFECYCLE.md](docs/LIFECYCLE.md).

### Ref-counting and deferred dispose

Each mounted provider `acquire()`s the controller (+1). The first acquire on an `idle` controller starts initialization.
Unmounting releases its reference (−1). When the count reaches 0, the session is disposed **one macrotask later**, and any re-acquire
before then cancels that. `keepAlive` providers never release.

### StrictMode

StrictMode's mount → unmount → mount runs acquire → release → acquire synchronously in one commit. The deferred dispose is
cancelled, so you get **one** `buildNativeBridge` call and **zero** disposals. This was verified in unit tests and on device with
`getNativeBridgeDiagnostics()`. Your own side-effecting effects still run twice, so guard them with a ref.

### "First call wins"

`options` and `retry` are read **once**, when the controller for a name is created, by the first provider render or the first
`getBridgeController(name, config)`. Changing them later does nothing until the controller is gone. This matches the library's
session cache. Keep them in module-level constants.

### The `then`-undefined proxy rule

The proxy answers **every** property name (nested proxies, native `get`s). The library guarantees `proxy.then === undefined`,
so it is never treated as a thenable. On top of that, this SDK never passes the proxy as a promise value: `whenReady()` resolves
`{ bridge }`. Follow the same rule: return **values** from `call`/`useBridgeCall` functions, never the proxy or a namespace
(`b => b.device` is wrong; `b => b.device.getInfo()` is right).

### Contract vs runtime metadata

`T` (your generated contract) is compile-time only. The handshake's capability metadata decides at runtime. A contract member
that native does not expose is a **NOOP**: it resolves `null` and nothing is sent. Use `bridge.$has("ns:member")` to detect features.

---

## API reference

Every export, in short. Field-by-field details, defaults and error tables are in **[docs/API.md](docs/API.md)**.

| Export                       | Signature                                                                                                                                                  | Returns / notes                                                                                                                                                                                             |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NativeBridgeProvider`       | `({ endpointName? = "NativeBridge", options?: NativeBridgeOptions, retry?: Partial<RetryPolicy>, keepAlive? = false, children? })`                         | Creates or gets the controller, `acquire()`s it in an effect, and provides it. Does not block rendering. `options`/`retry` are read once.                                                                   |
| `useNativeBridge<T>()`       | `() => UseNativeBridgeResult<T>`                                                                                                                           | `{ endpointName, state, bridge, error, attempt, maxAttempts, endpointPresent, nextRetryAt, isReady, retry, call, whenReady }`. Re-renders on state change. Throws outside a provider.                       |
| `useBridgeCall`              | `<T, A extends unknown[], R>(fn: (bridge: BridgeInstance<T>, ...args: A) => R \| Promise<R>, options?: WaitOptions) => UseBridgeCallResult<A, Awaited<R>>` | `{ run(...args): Promise<R>, status: "idle"\|"pending"\|"success"\|"error", data, error, reset() }`. `run` rejects on failure. Only the latest run updates state.                                           |
| `useBridgeEvent`             | `<P = BridgeValue>(eventName: string, handler: (payload: P) => void, options?: { enabled?: boolean = true }) => void`                                      | Subscribes once ready, uses the latest handler, and cleans up on unmount, name/enabled change and new session.                                                                                              |
| `useBridgeController<T>()`   | `() => BridgeController<T>`                                                                                                                                | Nearest provider's controller, **no** re-render subscription. Throws outside a provider.                                                                                                                    |
| `NativeBridgeContext`        | `Context<BridgeController \| null>`                                                                                                                        | Raw context (`null` outside a provider).                                                                                                                                                                    |
| `getBridgeController<T>`     | `(endpointName?: string, config?: { options?, retry? }) => BridgeController<T>`                                                                            | App-wide controller, created on first use (config applies only then). It does **not** start init; `acquire()` does.                                                                                         |
| `BridgeController<T>`        | `{ endpointName, subscribe(l), getSnapshot(), retry(), whenReady(opts?), call(fn, opts?), acquire() }`                                                     | `call` and `whenReady` are **controller methods** (also returned by `useNativeBridge`), not top-level exports.                                                                                              |
| `controller.call`            | `<R>(fn: (bridge) => R \| Promise<R>, options?: WaitOptions) => Promise<Awaited<R>>`                                                                       | Runs now if ready, else queues. Rejects `BridgeNotReadyError` or the call's own error. Never throws synchronously.                                                                                          |
| `controller.whenReady`       | `(options?: WaitOptions) => Promise<{ bridge }>`                                                                                                           | Resolves the **box**, never the proxy.                                                                                                                                                                      |
| `controller.acquire`         | `() => () => void`                                                                                                                                         | Adds an owner (and starts init if idle). Returns an idempotent `release`.                                                                                                                                   |
| `disposeNativeBridge`        | `(endpointName?: string) => boolean`                                                                                                                       | Disposes **one** endpoint's session via `proxy.dispose()`, rejects waiters (`"disposed"`), and sets state to `idle`. `true` if a ready session was disposed. Nothing restarts until `retry()` or a remount. |
| `resetNativeBridges`         | `() => void`                                                                                                                                               | Tests and hard reset: all controllers, `clearNativeBridgeCache()`, counters.                                                                                                                                |
| `getNativeBridgeDiagnostics` | `(endpointName?: string) => { endpointName, buildCalls, readyCount, disposeCount, controllersCreated, refCount, state }`                                   | Counters survive dispose and are cleared by `resetNativeBridges`.                                                                                                                                           |
| `hasBridgeController`        | `(endpointName?: string) => boolean`                                                                                                                       | Whether a controller exists (not whether it is ready).                                                                                                                                                      |
| `BridgeNotReadyError`        | `class extends BridgeError` with `code = "BRIDGE_NOT_READY"`, `name`, `endpointName`, `reason`, `state`, `cause?`                                          | `reason`: `"not-ready" \| "timeout" \| "unavailable" \| "error" \| "disposed" \| "aborted"`.                                                                                                                |
| `isBridgeNotReadyError`      | `(e: unknown) => e is BridgeNotReadyError`                                                                                                                 | `instanceof` **or** `code === "BRIDGE_NOT_READY"` (works across bundles).                                                                                                                                   |
| `BridgeErrorBoundary`        | `({ fallback: ReactNode \| (error, reset) => ReactNode, onError?, resetKeys?, children? })`                                                                | Catches render-time errors only. Async call errors must be rethrown in render.                                                                                                                              |
| `DEFAULT_RETRY_POLICY`       | `Readonly<RetryPolicy>`                                                                                                                                    | `{ maxAttempts: 5, initialDelayMs: 100, factor: 2, maxDelayMs: 2000 }`                                                                                                                                      |
| `resolveRetryPolicy`         | `(partial?: Partial<RetryPolicy>) => RetryPolicy`                                                                                                          | Fills defaults and clamps invalid values.                                                                                                                                                                   |
| `computeRetryDelay`          | `(policy: RetryPolicy, failedAttempt: number) => number`                                                                                                   | `min(initialDelayMs · factor^(n−1), maxDelayMs)`                                                                                                                                                            |
| `DEFAULT_READY_TIMEOUT_MS`   | `10000`                                                                                                                                                    | Default `WaitOptions.timeoutMs`.                                                                                                                                                                            |
| `DEFAULT_ENDPOINT_NAME`      | `"NativeBridge"`                                                                                                                                           | Mirrors the bridge's unexported `DEFAULT_BRIDGE_NAME`.                                                                                                                                                      |
| `normalizeEndpointName`      | `(name: string \| undefined) => string`                                                                                                                    | Trims, and `""` becomes `"NativeBridge"`, the same as `buildNativeBridge`.                                                                                                                                  |
| `isNativeEndpointPresent`    | `(name? = "NativeBridge") => boolean`                                                                                                                      | Side-effect-free presence probe.                                                                                                                                                                            |

`WaitOptions = { waitForReady?: boolean = true; timeoutMs?: number = 10000 (0 = unlimited); signal?: AbortSignal }`.
`timeoutMs` bounds only the wait for readiness. The native call itself is bounded by the provider's `options.timeoutMs`
(library default 30000; also the handshake timeout when > 0, else 10000).

**Types:** `BridgeState`, `BridgeTerminalState`, `BridgeSnapshot<T>`, `BridgeInstance<T>` (`T & NativeBridgeRoot`),
`NativeBridgeRoot` (`onEvent`, `dispose`, `$has`, `$get`, `$set`, `$disposed`, `toJSON`), `BridgeController<T>`,
`BridgeControllerConfig`, `NativeBridgeOptions` (= `BuildBridgeOptions`: `debug`, `timeoutMs`, `onInitError`, `onError`),
`RetryPolicy`, `WaitOptions`, `ReadyBridge<T>`, `NativeBridgeProviderProps`, `UseNativeBridgeResult<T>`,
`UseBridgeCallResult<A, R>`, `BridgeCallStatus`, `UseBridgeEventOptions`, `BridgeErrorBoundaryProps`,
`NativeBridgeDiagnostics`, `BridgeNotReadyReason`.

Errors of the calls themselves come from `@veolms/webview-bridge`: `BridgeNativeError` (native error; the `code` comes from native),
`BridgeTimeoutError` (`TIMEOUT_ERROR`), `BridgeTransportError` (`TRANSPORT_ERROR`, e.g. a disposed session),
`BridgeReadOnlyError` (`READ_ONLY_PROPERTY`), `BridgeProtocolError`. All have a stable `code`, so branch on `code`.

---

## When to use what

| You want to…                                                     | Use                                                                                  |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Make the bridge available to the app                             | One `<NativeBridgeProvider>` at the root (above the router)                          |
| Render based on connection state, or show retry UI               | `useNativeBridge()` → `state`, `error`, `retry`                                      |
| Call native from an event handler or effect                      | `useNativeBridge().call(fn)` (or `await` it)                                         |
| Call native and render `pending`/`success`/`error`               | `useBridgeCall(fn)` → `run`, `status`, `data`, `error`                               |
| React to native events in a component                            | `useBridgeEvent(name, handler)`                                                      |
| Call native without re-rendering on state changes                | `useBridgeController().call(fn)`                                                     |
| Use the bridge from services, stores, or non-React modules       | `getBridgeController(name).call(fn)` (+ `acquire()` if no provider)                  |
| Get the proxy itself, e.g. for several calls in a row            | `const { bridge } = await whenReady()`, or `useNativeBridge().bridge` when `isReady` |
| Skip an optional action when not ready yet                       | `call(fn, { waitForReady: false })`, which rejects `"not-ready"`                     |
| Wait as long as it takes                                         | `call(fn, { timeoutMs: 0 })`                                                         |
| Cancel waiting on unmount                                        | `call(fn, { signal })`                                                               |
| Check whether native supports X                                  | `bridge.$has("ns:member")` (sync, no native call)                                    |
| Check whether we run inside the app at all, without side effects | `isNativeEndpointPresent()`, or `state === "unavailable"` once settled               |
| Read or write a native property and await it                     | `call(b => b.ns.prop)` / `call(b => b.$set("ns:prop", v))`                           |
| Tear down one endpoint (logout, reset)                           | `disposeNativeBridge(name)`, then `retry()`                                          |
| Keep the session when the provider unmounts                      | `<NativeBridgeProvider keepAlive>`                                                   |
| Reset everything between tests                                   | `resetNativeBridges()` in `afterEach`                                                |
| Assert "initialized once" in a test or debug view                | `getNativeBridgeDiagnostics()`                                                       |
| Branch on "not ready" failures                                   | `isBridgeNotReadyError(e)` + `e.reason`                                              |

## Implementation patterns

The code for each pattern is in **[docs/PATTERNS.md](docs/PATTERNS.md)**: typed contract · one provider at the root · gating UI on
state · fire-and-forget vs awaited calls · calls before ready · events · properties (`$get`/`$set`, assignment) · feature detection
(`$has`, NOOP `null`) · non-React code via the controller · multiple endpoints · iframes · re-navigation/dispose · testing with
the fake native.

## Pitfalls

**Do**

- Mount **one** provider per endpoint at the root, with options and retry policy as **module-level constants**.
- Use the **generated** contract type for `T`.
- Treat `unavailable` as a normal state (the page runs in a browser) and keep non-native UI working.
- Return **values** from `call`/`useBridgeCall` functions.
- Attach a `.catch` to every fire-and-forget `call(...)` and `run(...)`.
- Branch on `error.code` / `isBridgeNotReadyError(e)` + `reason`, never on `message` or `name`.
- Feature-detect with `$has` when a `null` result could mean "not supported".
- Type event payloads as `X | null` when native may send none.
- In tests: `afterEach(() => { cleanup(); resetNativeBridges(); fake.uninstall(); })`.

**Don't**

- Don't call `buildNativeBridge()` yourself in a React app. Use the provider or controller (one session, one state).
- Don't put the proxy into a promise (`resolve(bridge)`, `return bridge` from an `async` function or `call`), `useState`, or
  `JSON.stringify`.
- Don't read bridge properties during render. Each read is a native request that returns a promise.
- Don't call `bridge.dispose()` or `clearNativeBridgeCache()` while providers are mounted. Use `disposeNativeBridge(name)`. The
  controller cannot see those calls and would keep serving a dead proxy.
- Don't probe for the native endpoint by constructing one (the library's internal `createNativeEndpoint`). That installs window
  receive callbacks, and disposing the probe removes the **live** session's legacy-Android/iOS callback. Use `isNativeEndpointPresent`.
- Don't pass inline `options`/`retry` objects and expect changes to apply ("first call wins").
- Don't expect events emitted before ready, or while `enabled: false`, to be delivered later.
- Don't use native root member names `toString`, `toJSON`, `onEvent`, `dispose`. The root proxy reserves them. The Kotlin compiler
  rejects them, but hand-written or iOS natives must avoid them too.
- Don't rely on a legacy-Android iframe getting async replies (see [Known issues](#known-library-issues)).

## Known library issues

All findings from building and device-testing this SDK against JSBridge 0.2.0:

| #   | Issue                                                                                                                                  | Status                                                                                                                                                                                                                                       |
| --- | -------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Library error classes used `this.constructor.name`, which is mangled by minifiers (`err.name === "he"`).                               | **Fixed** in `@veolms/webview-bridge`: each class sets a literal `name`. `code` was always reliable.                                                                                                                                         |
| 2   | The root proxy reserves `toString`/`toJSON`/`onEvent`/`dispose`, and this was undocumented.                                            | **Fixed (documented)**: `RESERVED_ROOT_NAMES`. The metadata registry warns once if native exposes one. The Kotlin compiler rejects them.                                                                                                     |
| 3   | Events without a `payload` key were dropped silently.                                                                                  | **Fixed**: a missing payload is delivered as `null`.                                                                                                                                                                                         |
| 4   | A disposed session was undetectable from its proxy (stale `sessionId`, `$has` still true).                                             | **Fixed**: `$disposed`, `sessionId` cleared, `$has` false, and calls (NOOP ones included) reject with `BridgeTransportError` after dispose. The controller still cannot _observe_ a direct `bridge.dispose()`, so use `disposeNativeBridge`. |
| —   | **Android legacy iframes**: async native replies go only to the main frame, so a frame's handshake times out (`error`).                | Platform behaviour, not a bug. Same as the vanilla client. Modern endpoints route per document.                                                                                                                                              |
| —   | Not exported from the bridge's public entry: `DEFAULT_BRIDGE_NAME`, `RESERVED_ROOT_NAMES`, `PROTOCOL_VERSION`, `createNativeEndpoint`. | This package mirrors the default name (`DEFAULT_ENDPOINT_NAME`) and the endpoint detection order (`isNativeEndpointPresent`). It needs no deep imports.                                                                                      |

**Verification** (2026-11-11): typecheck clean and 18/18 unit tests pass for this package. On the Android emulator with JSBridge 0.2.0
(debug APK), the React demo app built on this SDK matched the vanilla suite exactly: modern 32/32 PASS, legacy 31 PASS + 1 INFO
(the legacy iframe row), and 6/6 SDK checks in both modes (StrictMode single init, queued call before ready, `waitForReady:false`
rejection, `whenReady` box with a non-thenable proxy, event unsubscribe on unmount, missing endpoint → `unavailable` → `retry()`).
Earlier runs also covered R8 release builds and legacy-sync mode, with identical results.
