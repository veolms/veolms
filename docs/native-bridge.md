# Native bridge (web app ↔ native app)

The web app also runs inside the native app's WebView (Android, later iOS).
There it can call native functions (platform info, Firebase IDs, permissions,
notifications, ...) and receive native events. In a plain browser the same
code runs and simply gets no native answers.

The contract today has `platform()` (with `applicationId`, the running
app's package; missing in older builds), `firebase.getInstallationId()`,
`notifications.getLaunchData()`, `notifications.setChatOnScreen()`,
`notifications.closeChatNotification()` and the `notificationOpened`
event. Other names in the code below (`media`, theme events) are examples
of the shape; check `native-bridge-contracts.d.ts` for what exists.

This guide is the **project's rules**: which API to use for which job, where
the code goes, and what to watch out for. The SDK's own docs explain every
option the SDK offers; this guide picks one way for this project, so every
contributor (and every AI agent) writes native-bridge code the same way.

| Read                                                                                    | For                                                  |
| --------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| This file                                                                               | How we use the bridge in `apps/web`                  |
| [`apps/web/src/native-bridge/examples.tsx`](../apps/web/src/native-bridge/examples.tsx) | Type-checked examples of the main forms below        |
| [SDK README](../packages/react-webview-bridge/README.md)                                | What `@veolms/react-webview-bridge` is and does      |
| [SDK API](../packages/react-webview-bridge/docs/API.md)                                 | Every export, field by field                         |
| [SDK lifecycle](../packages/react-webview-bridge/docs/LIFECYCLE.md)                     | States, retries, ref-counting, StrictMode            |
| [SDK patterns](../packages/react-webview-bridge/docs/PATTERNS.md)                       | General patterns (some do not apply here: see below) |
| [SDK agent rules](../packages/react-webview-bridge/AGENTS.md)                           | Invariants when changing the SDK itself              |
| [Core bridge](../packages/webview-bridge/README.md)                                     | Wire protocol, proxy, NOOP, error classes            |

## How it fits together

```text
apps/web code
   │  nativeBridge.ns.fn(...)    useNativeQuery(...)    usePlatform() ...
   ▼
apps/web/src/native-bridge/      ← the only place that sets up the bridge
   │  getBridgeClient · NativeBridgeProvider (in root.tsx) · Register
   ▼
@veolms/react-webview-bridge     ← one shared session, retries, queued calls
   ▼
@veolms/webview-bridge           ← handshake, typed proxy, transport
   ▼
native JSBridge (Android / iOS)  ← generates native-bridge-contracts.d.ts
```

What is already set up, and where:

| Piece                                                            | Where                                                           |
| ---------------------------------------------------------------- | --------------------------------------------------------------- |
| The generated contract (types only)                              | `apps/web/src/native-bridge/native-bridge-contracts.d.ts`       |
| Contract registration, `nativeBridge`, endpoint name and options | `apps/web/src/native-bridge/nativeBridge.ts`                    |
| `useNativeQuery`, `nativeBridgeKeys`                             | `apps/web/src/native-bridge/useNativeQuery.ts`                  |
| Feature hooks (today: `usePlatform`)                             | `apps/web/src/native-bridge/use*.ts`                            |
| Public exports                                                   | `apps/web/src/native-bridge/index.ts`                           |
| The one `NativeBridgeProvider`                                   | `Layout` in `apps/web/src/root.tsx`, around every route element |
| TanStack Query defaults                                          | `apps/web/src/lib/query-client.ts`                              |

The provider sits above every route, so no page change ever drops the
connection. Do not add another provider anywhere.

## Rules

1. **Feature code imports from `../native-bridge` (its `index.ts`) only.**
   The one SDK import allowed outside `native-bridge/` is
   `useNativeBridge`, for connection state and `$has`. Everything else that
   touches the SDK (events, new helpers) lives in `native-bridge/`. Never
   import `@veolms/webview-bridge` or call `buildNativeBridge`,
   `bridge.dispose()` or `clearNativeBridgeCache()` in app code.
2. **Never pass the contract as a type argument.** `nativeBridge.ts`
   registers it once, so everything is typed already:
   `useNativeQuery([...], (native) => native.platform())`,
   `useNativeBridge()`, `useBridgeCall((bridge) => ...)`. Import the
   contract's _data_ types (`PlatformInfo`, ...) from
   `native-bridge-contracts` when you need them.
3. **Never edit `native-bridge-contracts.d.ts` by hand.** It is generated
   by the native build (JSBridge compiler, KSP output in the Android
   project) and copied here. A new native function starts in the native
   code; regenerate, copy, then use it.
4. **Commit a contract change only with (or after) the native change that
   implements it.** A local regeneration for testing stays out of commits.
5. **`null` is a normal answer.** Every `nativeBridge` call resolves `null`
   in a plain browser, on the server, and in an app build that lacks the
   function. Code must work with `null`: render a browser fallback, skip
   the step, or show nothing. Never treat it as an error.
6. **A rejection is a real failure** (the connection or the call went
   wrong). Handle it: `.catch`, or a query's `error`. Never leave a promise
   unhandled: on the server an unhandled rejection stops the dev server.
7. **Never call native during render.** Not in a component body, not in
   `Layout`, not in a loader. Call from an event handler, an effect, a
   query or a service.
8. **Hooks from the SDK work only below `Layout`.** `Layout` renders the
   provider, so a hook in `Layout`'s own body throws
   `No <NativeBridgeProvider> found`. `Root`, pages and components are fine.
9. **One file per native capability**, inside `native-bridge/` (see
   [Organising code](#organising-code)). Before adding one, look for an
   existing hook or function for that capability and extend it.
10. **Decide whether the call is safe to repeat** before choosing the API
    (see [Calls that must not repeat](#calls-that-must-not-repeat)).

## Which API, for which job

| You need…                                                        | Use                                                                              |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| A native value a component **renders**                           | `useNativeQuery(key, (native) => native.ns.fn())`, or a named hook over it       |
| A native value for **logic**: build a request, send analytics    | `await nativeBridge.ns.fn()` in a handler, effect or service                     |
| A native **action** (vibrate, share, open a screen) from a click | `await nativeBridge.ns.fn()` in the handler                                      |
| An action whose pending / error state the UI shows               | `useMutation({ mutationFn: () => nativeBridge.ns.fn(), networkMode: "always" })` |
| An **event** the native app sends                                | `useBridgeEvent(name, handler)` (SDK), wrapped in a named hook here              |
| UI shown only **inside the app**                                 | the answer being non-`null`, or `useNativeBridge().state === "ready"`            |
| Whether this app build **supports** a function                   | `useNativeBridge().bridge?.$has("ns:fn")`                                        |

Not used in feature code: `useBridgeCall` (`useNativeQuery` and `useMutation`
cover it, with caching and shared state), `getBridgeController`,
`disposeNativeBridge` and `retry`. They exist in the SDK for other setups.

### Rendering a native value

```ts
const { data: platform } = useNativeQuery(["platform"], (native) =>
  native.platform(),
);
```

- `data` is `undefined` while the bridge connects, `null` outside the app,
  and the answer inside it. Render nothing (or the browser version) for both
  `undefined` and `null`; there is no loading skeleton to show for native
  values.
- Every component using the same key shares one native call and one cached
  answer. Put the call's arguments in the key: `["files", "info", path]`.
- Once two places need the same value, give it a named hook in
  `native-bridge/` (like `usePlatform`), so the key and the call live in one
  place.
- It runs while the device is offline (`networkMode: "always"`): native
  answers need no network. TanStack Query's default pauses queries and
  mutations offline, so a `useMutation` that only calls native sets
  `networkMode: "always"` too. One that also calls the API keeps the default.
- Use it only for calls that are safe to repeat: a query may run again (see
  below).

### Using a native value in logic

Example: send the Firebase Installation ID (FID) to the API, as
[mobile-push.md](mobile-push.md) describes for push registration.

```ts
// native-bridge/firebase.ts: the native side of the capability
export function getInstallationId() {
  return nativeBridge.firebase.getInstallationId(); // string | null
}

// services/<domain>/<domain>.service.ts: the API side stays in services
const fid = await getInstallationId();
if (fid) await api.put("/v1/me/push-devices", { fid /* , ... */ });
```

- Native calls belong in `native-bridge/`; backend calls in
  `services/<domain>/` ([apps/web/AGENTS.md](../apps/web/AGENTS.md)). A
  service may call a `native-bridge` function: both are plain async
  functions.
- Run the flow from the place that owns the trigger (after sign-in, on app
  start, on a click), usually as a `useMutation` in that service's
  `*.mutations.ts`.
- Analytics: fire and forget, never block the UI on it, and skip the native
  part when the answer is `null`:

  ```ts
  void nativeBridge
    .platform()
    .then((platform) =>
      // an event-tracking call; it would live in services/, like any backend call
      trackEvent("app_opened", { platform: platform?.name ?? "web" }),
    )
    .catch(console.warn);
  ```

### Events from the native app

Events are not buffered: anything sent before the subscription exists is
lost. Give each event a named hook in `native-bridge/`, so its name and
payload type are written once:

```ts
// native-bridge/useNativeThemeChange.ts
export function useNativeThemeChange(onChange: (theme: string) => void) {
  useBridgeEvent<{ theme: string } | null>("themeChanged", (payload) => {
    if (payload) onChange(payload.theme);
  });
}
```

Type the payload `X | null`: native may send none. If the current value
matters (not only changes), also read it with a call after subscribing.

## Calls that must not repeat

Most native functions are **not** idempotent: they show something, start
something, count something, or return a new value each time. Assume any call
can be made more than once unless you prevent it. These are all the ways it
happens:

| Cause                                                                                                                                                                                                                  | Applies to                     | What to do                                                                     |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------ |
| StrictMode runs every effect twice in development (`apps/web/src/entry.client.tsx`)                                                                                                                                    | effects                        | Guard with a ref, or use a once-per-page function (below)                      |
| The component mounts again: route change, `key` change, conditional render, error-boundary reset                                                                                                                       | effects, `useMutation` callers | Run the call from the trigger, not from "on mount", or use once-per-page       |
| Several components call the same function                                                                                                                                                                              | direct calls                   | Use one named hook / function; queries share calls by key                      |
| A query runs again: its data was garbage-collected after every user unmounted (`gcTime` in `lib/query-client.ts`), it was invalidated (`nativeBridgeKeys.all` invalidates all of them), or a `refetch`/option override | `useNativeQuery`               | Only idempotent reads go in queries                                            |
| Retries: a query or mutation `retry` option                                                                                                                                                                            | queries, mutations             | Keep `useNativeQuery`'s `retry: false`; never add `retry` to a native mutation |
| A double click or a second submit                                                                                                                                                                                      | handlers, mutations            | Disable the control while `isPending`                                          |
| A call timed out on the web side (`BridgeTimeoutError`) but native still ran it                                                                                                                                        | any call                       | Never retry a non-idempotent call automatically after a timeout                |
| A page reload or full navigation: a new session, all code runs again                                                                                                                                                   | everything                     | Native keeps its own state; once-per-page is per page load, not per install    |
| Dev hot reload re-runs modules and effects                                                                                                                                                                             | development only               | Expected; do not code around it                                                |
| Render-time calls: every render, and the server render too                                                                                                                                                             | render                         | Never call during render (rule 7)                                              |

**Once per page load:** for a call whose answer cannot change while the page
is open (an ID, a capability), keep the promise in its capability file, so
every caller shares one native call no matter how often it is asked:

```ts
// native-bridge/firebase.ts
let installationId: Promise<string | null> | undefined;

export function getInstallationId() {
  installationId ??= nativeBridge.firebase
    .getInstallationId()
    .catch((error: unknown) => {
      installationId = undefined; // a failure is not kept: the next caller asks again
      throw error;
    });
  return installationId;
}
```

Do not use it for values that can change (permission state, settings): read
those when needed, or subscribe to their event.

**Effects with a native side effect** (show a toast on mount, start a
service) need a ref guard, because StrictMode runs them twice:

```ts
const started = useRef(false);
useEffect(() => {
  if (started.current) return;
  started.current = true;
  void nativeBridge.media.startForegroundService().catch(console.warn);
}, []);
```

A ref guard covers StrictMode only; a remount runs the effect again. If that
is wrong too, use a once-per-page function or move the call to the trigger.

## Organising code

Everything native lives in `apps/web/src/native-bridge/`, one capability per
file, all exported through `index.ts`:

```text
native-bridge/
├── native-bridge-contracts.d.ts   generated, never edited
├── nativeBridge.ts                registration, nativeBridge, endpoint options
├── useNativeQuery.ts              useNativeQuery, nativeBridgeKeys
├── platform.ts                    getPlatform(), once per page (for logic)
├── usePlatform.ts                 usePlatform(), over getPlatform (for rendering)
├── firebase.ts                    getInstallationId(), once per page
├── notifications.ts               getLaunchDataOnce(), useNotificationTaps(),
│                                  setNativeChatOnScreen(), closeNativeChatNotification()
├── useNativeThemeChange.ts        (example) one event
├── examples.tsx                   examples only, never imported
└── index.ts                       the public exports
```

- **Name files after the capability**, not the screen that uses it:
  `usePermissions.ts`, `useNotificationSettings.ts`, `mediaService.ts`.
  Hooks start with `use`; plain functions do not.
- **A capability grows into a folder** when it has several hooks, functions
  and events: `native-bridge/permissions/{usePermission.ts,
requestPermission.ts, index.ts}`, re-exported from `native-bridge/index.ts`.
- **One source per native function.** If a hook or function for it exists,
  use or extend it. Never call the same native function from two feature
  files.
- **Keys:** every query key goes through `useNativeQuery`, which puts it
  under `nativeBridgeKeys.all`. Keep the key next to the call, in the
  capability file.
- **Keep native code free of UI and backend calls.** Capability files call
  native and shape the answer; components render it; services talk to the
  API.
- **A new shared helper** (for example a once-per-page helper used by
  several capabilities) goes in `native-bridge/`, not in a feature, and
  only once a second user exists.
- Add a short example to `examples.tsx` when you add a new _kind_ of usage,
  not for every capability.

## Server rendering, prerendering and hydration

Whether pages are rendered on a server or prerendered, and which ones, is
set in `apps/web/react-router.config.ts` (`ssr`, `prerender`). Check it
rather than assuming. Even with server rendering off, the dev server and the
prerender build render the root `Layout` (and prerendered pages) in Node,
where there is no native app.

- `nativeBridge` calls answer `null` at once there; the SDK never waits on
  the server.
- Effects and queries do not run during server rendering, so
  `useNativeQuery`'s `data` is `undefined` in the server HTML and on the
  first client render. Both match, so there is no hydration mismatch.
- Never branch _markup_ on "inside the app" during render
  (`isNativeEndpointPresent()`, `window.NativeBridge`): the server cannot
  know it, and the first client render would differ. Use the query answer or
  `useNativeBridge().state`, which start out the same on both sides.

## Old app versions and missing functions

The contract is compile-time only. An installed app may be older than the
contract: a function it lacks resolves `null` and sends nothing (a NOOP).
So every call must already handle `null` (rule 5). When "not supported" and
"native returned null" need different handling, check support first:
`useNativeBridge().bridge?.$has("firebase:getInstallationId")` (colon
separated path; synchronous, no native call).

## Errors and timeouts

- `null`: no native app here, or this build lacks the function.
- Rejection with `BridgeNotReadyError`: the bridge did not become ready
  (`reason`: `"timeout"` when the connection took too long, `"error"` when
  the native handshake failed). Show nothing native, log it.
- Rejection with a core error (`BridgeNativeError`, `BridgeTimeoutError`,
  ...): the call itself failed. Branch on `error.code`, never on `message`.
- Timeouts: `NATIVE_BRIDGE_OPTIONS` in `nativeBridge.ts` limits the handshake
  and every call; waiting for the connection is limited separately (SDK
  default 10 s). Values and reasons:
  [SDK API, `WaitOptions`](../packages/react-webview-bridge/docs/API.md).

## Testing locally

There are no frontend unit tests in this project
([AGENTS.md](../AGENTS.md), [apps/web/AGENTS.md](../apps/web/AGENTS.md)).
Check native-bridge work by running it:

| State to check                        | How                                                                                                                                                                                                    |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Plain browser (`null`)                | Run the web app (`pnpm dev:web`) and open it in a browser. Every call answers `null` (while the demo log in `Root` exists, it logs `[NativeBridge] Not available`).                                    |
| Inside the app                        | Run it on the network (`pnpm dev:web:lan`) and load that address in the native debug build; read the WebView console in logcat. The native app must allow the page's origin (native project settings). |
| Server render                         | Watch the dev server's output: it must keep running and log no `BridgeNotReadyError`.                                                                                                                  |
| Prerendered build                     | The production build and preview scripts in `apps/web/package.json`.                                                                                                                                   |
| Older app without a function          | Call a function the installed build lacks: it must resolve `null` and the UI must cope.                                                                                                                |
| Repeated calls                        | Development runs StrictMode: watch native logs for calls made twice, then remount the screen and navigate away and back.                                                                               |
| Handshake failures, timeouts, retries | Covered by the SDK's tests with a fake native: `pnpm --filter @veolms/react-webview-bridge test` ([testing](../packages/react-webview-bridge/docs/PATTERNS.md#13-testing-with-the-fake-native)).       |

Before committing changes under `apps/web`, follow the commit checks in
[apps/web/AGENTS.md](../apps/web/AGENTS.md).

## Changing the setup

- **The SDK itself** (`packages/react-webview-bridge`): follow its
  [AGENTS.md](../packages/react-webview-bridge/AGENTS.md); behaviour changes
  need a test there. Never add app-specific native functions to the SDK.
- **Endpoint name or timeouts:** `NATIVE_BRIDGE_NAME` and
  `NATIVE_BRIDGE_OPTIONS` in `nativeBridge.ts`. The provider in `root.tsx`
  uses the same constants; keep it that way (the options are read once).
- **The demo log** in `Root` (`root.tsx`) and `usePlatform` are there to
  check the setup and may be removed; nothing depends on them.

## Notification taps and chat notifications

- **Taps** (`useNotificationTaps`, used by `notifications/NotificationTapHandler.tsx`
  in `Root`): subscribes to `notificationOpened` first, then pulls
  `getLaunchData()` once per page load, so a tap in between is not lost.
  Calling `getLaunchData()` tells native the page handles taps: later taps
  arrive as the event instead of a page reload, so the handler must keep
  working. The link is checked again (one leading `/`, no backslash or
  whitespace) before React Router opens it; the tapped bell item is marked
  read once the session check says the visitor is signed in.
- **Chat on screen** (`setNativeChatOnScreen`, from `services/chat`
  `setChatOnScreen`): native skips pushes for the chat that is open.
  Native forgets it on every page load.
- **Chat read** (`closeNativeChatNotification`, from `services/webPush`
  `closeChatNotifications`): removes the chat's phone notification, up to
  `readSeq` when the read event carries it.
