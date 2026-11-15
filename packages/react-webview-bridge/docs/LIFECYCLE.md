# Lifecycle — controller, states, ownership

Source: `src/controller.ts` (`BridgeControllerImpl`), `src/provider.tsx`.

## The controller

A **controller** is a plain object in a module-level `Map<endpointName, controller>`, **outside React**. Per endpoint name
there is at most one live controller app-wide (per JS realm, so per document: an iframe has its own). It owns:

- the **init run**: `buildNativeBridge` attempts plus the backoff timer;
- the immutable **snapshot** (`BridgeSnapshot`), which React reads with `useSyncExternalStore`;
- the **waiters**: pending `whenReady`/`call` promises;
- the **owner ref-count**: mounted providers.

React state never holds the bridge. Because of this, re-renders, StrictMode double effects and multiple providers can never cause a
second handshake, and non-React code can use the same session.

## State machine

```text
                       acquire() [first owner]          success
            ┌──────┐   or retry()            ┌──────────────┐ ───────────► ┌───────┐
            │ idle │ ──────────────────────► │ initializing │              │ ready │
            └──────┘                         └──────────────┘ ◄─┐          └───────┘
               ▲                              │   ▲    │        │ timer /      │
               │                 attempt <    │   │    │        │ retry()      │
               │                 maxAttempts  │   └────┘        │ (skips wait) │
               │                 → backoff    └─────────────────┘              │
               │                                   │ attempt == maxAttempts    │
               │                                   ▼                           │
               │                     ┌─────────────┐  ┌───────┐                │
               │                     │ unavailable │  │ error │                │
               │                     └─────────────┘  └───────┘                │
               │                        │ retry() → new run → initializing     │
               │                                                               │
               └──── dispose: disposeNativeBridge / last owner released ───────┘
                     (+1 macrotask) / resetNativeBridges — from ANY state
```

| From                         | Event                                                                                   | To             | Snapshot changes                                                                         |
| ---------------------------- | --------------------------------------------------------------------------------------- | -------------- | ---------------------------------------------------------------------------------------- |
| `idle`                       | first `acquire()` (provider mount) or `retry()`                                         | `initializing` | new run: `attempt` 0 → 1, `error: null`                                                  |
| `initializing`               | attempt succeeds                                                                        | `ready`        | `bridge` set, `error: null`, `endpointPresent: true`, waiters resolved with `{ bridge }` |
| `initializing`               | attempt fails, `attempt < maxAttempts`                                                  | `initializing` | `error` = failure, `nextRetryAt` set, timer scheduled                                    |
| `initializing` (backing off) | timer fires, or `retry()` (skips the rest of the delay)                                 | `initializing` | `attempt + 1`, `nextRetryAt: null`                                                       |
| `initializing`               | attempt fails, `attempt == maxAttempts`, endpoint absent and error is a plain `Error`   | `unavailable`  | waiters rejected (`reason: "unavailable"`)                                               |
| `initializing`               | same, but the error is a `BridgeError` **or** the endpoint is present                   | `error`        | waiters rejected (`reason: "error"`)                                                     |
| `unavailable` / `error`      | `retry()`                                                                               | `initializing` | new run, `attempt` restarts at 1                                                         |
| any                          | `disposeNativeBridge(name)`, last owner released (+1 macrotask), `resetNativeBridges()` | `idle`         | waiters rejected (`"disposed"`), session disposed, fresh idle snapshot                   |
| `ready` / in flight          | `retry()`                                                                               | unchanged      | no-op                                                                                    |

How `unavailable` and `error` are told apart: `buildNativeBridge` returns `null` in both cases. The controller looks at the
error passed to `onInitError`. "No native endpoint object found on window" is a plain `Error`, while handshake failures (timeout,
native error, protocol version mismatch → `BridgeInitializationError`) are `BridgeError`s. The side-effect-free presence probe
`isNativeEndpointPresent` backs this up.

An attempt's duration depends on the cause. A missing endpoint fails immediately. A present endpoint that never answers waits for
the handshake timeout (`options.timeoutMs` if > 0, else 10000 ms) **per attempt**, before the backoff delay. With
`maxAttempts: 5` and no explicit `timeoutMs`, a silent native therefore takes about 5 × 10 s + 1.5 s to reach `error`.

## Calls relative to state

| State                                 | `call(fn)` / `whenReady()` (default options)                                                                |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `ready`                               | `fn(bridge)` runs immediately                                                                               |
| `idle`, `initializing`                | queued; resolves when ready; rejects on terminal state, dispose, abort, or after `timeoutMs` (default 10 s) |
| `unavailable`, `error`                | rejects immediately with that reason                                                                        |
| any, `waitForReady: false`, not ready | rejects immediately with `"not-ready"`                                                                      |

A queued call rejects with `"timeout"` whenever readiness takes longer than its `timeoutMs`. That happens:

- while initialization runs longer than the wait, for example a present but silent endpoint: each attempt waits for the
  handshake timeout (10 s by default), so the default 10 s readiness wait ends before the first attempt fails;
- while `idle` with **no owner** (no provider mounted, nothing called `acquire()`), because nothing starts initialization.
  Make sure a provider (or an `acquire()`) exists.

On the server (no `window`) nothing ever connects, so `getBridgeClient()` calls answer at once (rejecting `"unavailable"`, or
`null` with `unavailable: "null"`) and create no controller. `call`/`whenReady` have no such shortcut, so don't use them on the server.

## Ref-counting and deferred dispose

- Every mounted `NativeBridgeProvider` calls `acquire()` in an effect, which is +1 owner. The effect cleanup calls the returned `release()`
  (−1). `release()` is idempotent.
- When the count reaches 0, `release()` schedules `setTimeout(0)`. If the count is still 0 when it fires, the controller disposes the
  session (state `idle`) and removes itself from the registry. A later provider mount creates a **new** controller, which reads
  `options`/`retry` again.
- Any `acquire()` before the timer fires cancels it, so the session survives.
- A `keepAlive` provider keeps its reference after it unmounts, so the session lives until `disposeNativeBridge`/`resetNativeBridges`.
  It holds at most one reference, and turning `keepAlive` off while mounted hands it back.
- If the last owner releases while a handshake is in flight and a new provider mounts before it settles, the new controller
  joins the same library initialization (the library shares one session per name). The old controller's late result then
  never disposes that session: it disposes only when no newer controller for the name is initializing or ready.

## StrictMode

In development, StrictMode renders twice and runs effects as mount → cleanup → mount.

- Render twice: `getBridgeController(name)` returns the same registry entry, so no new controller is created.
- Effects: `acquire()` (+1, starts the run) → `release()` (0, schedules dispose) → `acquire()` (+1, **cancels** the timer). Both
  happen synchronously in the same commit, before the macrotask. Result: exactly **one** `buildNativeBridge` call and **zero**
  disposals. This is asserted in the tests and on device (`getNativeBridgeDiagnostics`: `buildCalls 1, readyCount 1,
disposeCount 0, controllersCreated 1`).
- Your own effects that issue calls also run twice. `call` is safe to repeat, but for effects with side effects on native (e.g.
  "show toast on mount"), guard with a ref (`if (done.current) return; done.current = true;`).

## "First call wins"

`options` and `retry` are read **once**, when the controller for a name is created (the first provider render or the first
`getBridgeController(name, config)` or `getBridgeClient(name, config)` call). Later providers or calls with different values are silently ignored until that
controller is gone (last owner released or `disposeNativeBridge` with no owners). This matches the library's own session cache,
where the options of the first successful `buildNativeBridge` apply. Define options as **module-level constants** so every
provider passes the same object.

## The `then`-undefined proxy rule

The bridge is a `Proxy` on which **every** property name produces something: a nested proxy, or a native `get` request for
properties. The library guarantees that `proxy.then` is `undefined`, so an accidental `await bridge` does not hang and the proxy is
never treated as a thenable. On top of that, the SDK follows this rule: **the proxy never travels as a promise resolution value.**

- `whenReady()` resolves `{ bridge }` (a box), not the proxy.
- From `call(fn)` / `useBridgeCall(fn)`, return **values** (`b => b.device.getInfo()`), never `b => b` or `b => b.device`.
  A returned nested proxy would be stored as `data`. Inspecting or serializing it (devtools, `JSON.stringify`, deep equality)
  enumerates native capabilities and can issue native `get` requests.
- To keep the proxy, read it from the snapshot (`useNativeBridge().bridge`, `controller.getSnapshot().bridge`) or from the box.

## Disposal semantics

- `disposeNativeBridge(name)` → the controller disposes via the root proxy's `dispose()`. The library session disposes its
  transport and endpoint (listeners, `window.__<name>_*_receive__` callbacks) and evicts only that name from its cache.
  Afterwards the old proxy has `$disposed === true`, and every call on it rejects with `BridgeTransportError`.
- Do **not** call `bridge.dispose()` or the library's `clearNativeBridgeCache()` yourself while providers are mounted. The
  controller cannot observe either, and it would keep serving the dead proxy (in state `ready`) until you call `disposeNativeBridge`.
- `resetNativeBridges()` is the only SDK function that calls `clearNativeBridgeCache()`. That disposes **all** endpoints and
  aborts in-flight library inits, which is fine for tests and wrong for production teardown of a single endpoint.
