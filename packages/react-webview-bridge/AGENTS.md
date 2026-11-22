`@veolms/react-webview-bridge` is the **React layer** over `@veolms/webview-bridge`. It manages one shared bridge session per
endpoint (state, retries, queued calls, events, disposal). It contains no native APIs, no wire protocol, and no application policy.

Read [README.md](README.md) first. The details are in [docs/API.md](docs/API.md), [docs/LIFECYCLE.md](docs/LIFECYCLE.md) and [docs/PATTERNS.md](docs/PATTERNS.md).

## Invariants (do not break)

1. **One session per endpoint name.** All initialization goes through the module-level controller
   (`src/controller.ts`). App code never calls `buildNativeBridge()` directly.
2. **The bridge is not React state.** Hooks read the controller's snapshot through `useSyncExternalStore`, and the proxy is never stored in
   `useState`/`useReducer`/context values.
3. **The proxy never travels as a promise value.** `whenReady()` resolves `{ bridge }`. Functions passed to `call`/`useBridgeCall` return
   values, never the proxy or a namespace proxy. The library keeps `proxy.then === undefined`, and the SDK does not rely on it.
4. **StrictMode-safe ownership.** Providers `acquire()` in an effect, and the last `release()` disposes after one macrotask, so a
   synchronous re-acquire cancels it. Do not make disposal synchronous.
5. **"First call wins".** `options`/`retry` are read only when a controller is created. Do not add props that re-create the
   controller on change.
6. **Calls never throw synchronously and never dispose or restart anything.** Readiness failures reject with
   `BridgeNotReadyError` (`code: "BRIDGE_NOT_READY"`, `reason` ∈ not-ready/timeout/unavailable/error/disposed/aborted).
7. **Per-endpoint teardown only.** `disposeNativeBridge(name)` disposes via `proxy.dispose()`. Only `resetNativeBridges()` (tests) may
   call `clearNativeBridgeCache()`, which kills all endpoints.
8. **No endpoint construction for probing.** Presence checks use `isNativeEndpointPresent` (`src/presence.ts`), never
   `createNativeEndpoint`.
9. **Public entry only.** Import the bridge only from `"@veolms/webview-bridge"`, with no deep paths. If something is missing there,
   mirror it locally and document it (as with `DEFAULT_ENDPOINT_NAME`), or ask for it to be exported. Do not reach into its `src/`.
10. **Source-only TS style.** Use explicit `.ts`/`.tsx` import extensions, `import type` for types (`verbatimModuleSyntax`), and no `enum`,
    `namespace` or constructor parameter properties (`erasableSyntaxOnly`). Treat indexed access as possibly `undefined`
    (`noUncheckedIndexedAccess`). Error classes set a literal `name`.
11. **Zero runtime dependencies** besides the peers `react` and `@veolms/webview-bridge`.

## Do / don't when implementing in a webapp

| Do                                                                            | Don't                                                                                          |
| ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| One `<NativeBridgeProvider>` per endpoint at the app root, above the router   | Mount providers per page or per component                                                      |
| Module-level constants for `options` / `retry`                                | Pass inline objects and expect later changes to apply                                          |
| Register the **generated** `NativeBridgeContract` once (`interface Register`) | Hand-write the native API surface, or repeat `<Contract>` on every hook                        |
| `call(b => b.ns.fn(x))` / `useBridgeCall`                                     | `buildNativeBridge()`, `bridge.dispose()`, `clearNativeBridgeCache()` in app code              |
| `.catch` every fire-and-forget call                                           | Leave rejected promises unhandled                                                              |
| Branch on `isBridgeNotReadyError(e)` + `e.reason`, or `e.code`                | Branch on `e.message` / `e.name`                                                               |
| Treat `unavailable` as "running in a browser"                                 | Show it as an error, or block the whole app on it                                              |
| `$has("ns:member")` for feature detection                                     | Assume a `null` result means "native returned null"                                            |
| `useBridgeEvent` for events, typed `P \| null` if a payload is optional       | Expect events from before ready to be buffered                                                 |
| `await getBridgeClient().ns.fn(x)` for direct calls, anywhere                 | Copy the client's proxy into app code, or use hooks in the component that renders the provider |
| Read properties inside `call`                                                 | Read `bridge.ns.prop` during render (each read is a native request)                            |
| `disposeNativeBridge(name)` + `retry()` for logout or reset                   | Dispose by unmounting providers while others still need the bridge                             |
| `resetNativeBridges()` + `fake.uninstall()` in test `afterEach`               | Share controller state across tests                                                            |

## Adding a bridge call to a webapp, step by step

1. **Native first.** The capability must exist in the Kotlin JSBridge (or iOS) code. Regenerate the contract
   (`native-bridge-contracts.d.ts` from the KSP output) and copy or sync it into the webapp. Never edit it by hand.
2. **Confirm the path.** `bridge.ns.method()` is the wire path `ns:method`. Check the generated interface for argument and return types
   (`Promise<void>` means an `ack`, which resolves `undefined`).
3. **Pick the API** (README, "When to use what"):
   - a direct call, anywhere (handler, effect, service) → `const client = getBridgeClient(); await client.ns.method(x)`;
   - rendering request state → `useBridgeCall((b, ...args) => b.ns.method(...args))`;
   - an imperative call in a handler or effect → `const { call } = useNativeBridge(); await call(b => b.ns.method(x))`;
   - outside React → `getBridgeClient()` or `getBridgeController(name).call(...)`.
   - native → web event → `useBridgeEvent<P>("eventName", handler)`.
4. **Handle three outcomes:** the value; `BridgeNotReadyError` (`unavailable` means not in the app, so hide or skip it); and call errors
   (`BridgeNativeError`, `BridgeTimeoutError`, `BridgeTransportError`) by `code`.
5. **Optional feature?** Gate the UI on `bridge?.$has("ns:method")`, since older native builds NOOP to `null`.
6. **Side effect on mount?** Guard with a ref, because StrictMode runs effects twice.
7. **Test it** with the fake native (`src/__tests__/fake-native.ts`). Add the path to `capabilities` and a handler, use a small retry
   policy, and also test the "no fake installed → unavailable" path.
8. **Do not modify** this package or `@veolms/webview-bridge` to add an app-specific method. The proxy is generic.

## Changing this package

- Keep every exported signature documented in `docs/API.md` and in the README table, and keep `src/__tests__/public-api.test.ts`
  (the export list) in sync.
- Behaviour changes need a test in `src/__tests__/`. Run the monorepo's typecheck (`tsc --noEmit` in this package) and its tests.
- Never describe planned behaviour as implemented.

## Where to look

| Question                                                                              | This package                         | `@veolms/webview-bridge`                                                                        |
| ------------------------------------------------------------------------------------- | ------------------------------------ | ----------------------------------------------------------------------------------------------- |
| Direct-call client (`getBridgeClient`)                                                | `src/client.ts`                      | —                                                                                               |
| Init, retries, waiters, ref-count, dispose                                            | `src/controller.ts`                  | `src/bridge/build-native-bridge.ts` (session cache, in-flight dedupe, `clearNativeBridgeCache`) |
| React wiring                                                                          | `src/provider.tsx`, `src/hooks.ts`   | —                                                                                               |
| State and option types                                                                | `src/types.ts`                       | `BuildBridgeOptions` in `src/bridge/build-native-bridge.ts`                                     |
| Not-ready errors                                                                      | `src/errors.ts`                      | `src/transport/errors.ts` (all `BridgeError` classes and codes)                                 |
| Endpoint presence                                                                     | `src/presence.ts`                    | `src/endpoint/native-endpoint.ts` (detection order), `android*.ts`, `ios.ts`                    |
| Proxy semantics (NOOP, `$has`/`$get`/`$set`/`$disposed`, `then`, reserved root names) | `NativeBridgeRoot` in `src/types.ts` | `src/bridge/proxy.ts`, `src/protocol/constants.ts`                                              |
| Request timeouts, events, session state                                               | —                                    | `src/transport/native-transport.ts`, `src/transport/types.d.ts`                                 |
| Public surface                                                                        | `src/index.ts`                       | `src/index.ts`                                                                                  |
| Fake native for tests                                                                 | `src/__tests__/fake-native.ts`       | —                                                                                               |
| Rules for the core lib                                                                | this file                            | `AGENTS.md`, `README.md`                                                                        |
