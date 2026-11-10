# `@veolms/webview-bridge` Agent Instructions

These instructions apply to `packages/webview-bridge`. Task-specific user instructions take precedence.

## Package boundary

`@veolms/webview-bridge` is the **JavaScript/TypeScript core client** for VeoLMS WebView-to-native communication.

- Zero runtime dependencies.
- No React, UI, framework, or application-domain dependencies.
- Android/iOS implementations are outside this package.
- `src/index.ts` is the public entry point.
- `package.json` is currently private to the workspace.
- The package is consumed by web applications and does not require a separate manual build step for normal consumption.

## Architecture

Preserve this separation:

```text
Application contract
        ↓
NativeBridge / Proxy
        ↓
NativeTransport
        ↓
NativeEndpoint
        ↓
Android / iOS WebView
```

### `endpoint/`

Only normalize platform WebView messaging into `NativeEndpoint` (`postMessage`, `onMessage`, `dispose`). Do not put protocol, metadata, request correlation, or application APIs here.

Current adapters:

- Android Modern WebMessage listener
- Android Legacy `addJavascriptInterface`
- iOS WebKit message handler with reply

### `protocol/`

Own wire-level types, constants, JSON encoding/decoding, and structural validation. Current protocol version is `1`.

### `transport/`

Own request IDs, Promise correlation, initialization, session state, timeouts, replies, events, and bridge errors.

### `bridge/`

Own runtime capability metadata, the dynamic Proxy, sessions, caching, and `buildNativeBridge()`.

The Proxy must stay generic. Do not implement individual methods such as `showToast()` or `hideStatusBar()` inside it.

## Contract generation

The native bridge library generates the TypeScript contract definitions used by the web application.

- Do not manually recreate the native API contract in the web app when generated contracts are available.
- Native API changes should update the generated contract definitions as part of the native library workflow.
- Treat the generated contract as the shared API surface between native and web code.
- Do not make JS bridge implementation changes just to add individual native methods unless the generic bridge itself needs new capabilities.

## Non-negotiable invariants

1. **Platform transparency:** consumers should not need Android/iOS-specific WebView checks for normal bridge usage.
2. **Contract vs metadata:** TypeScript contracts provide compile-time types; native metadata determines runtime capability availability.
3. **Async API:** native capabilities are exposed through Promises regardless of whether native implementation is internally synchronous or asynchronous.
4. **Path mapping:** `bridge.systemBars.hideStatusBar()` maps to `systemBars:hideStatusBar` on the wire.
5. **Request IDs:** every request needs a unique correlation ID.
6. **Initialization:** `buildNativeBridge()` performs the handshake before returning the bridge.
7. **Unsupported functions:** missing function capabilities resolve as NOOPs rather than being blindly sent to native.
8. **Promise safety:** proxy access to `then` must remain `undefined`.
9. **`null` vs `void`:** explicit `null` stays `null`; `ACK` for `void` resolves to `undefined`.
10. **Cleanup:** disposal must remove endpoint listeners and generated callback handlers.
11. **No application policy:** authentication, authorization, persistence, analytics, and product-specific capabilities belong elsewhere.
12. **Normal usage:** `buildNativeBridge()` should normally be initialized once per application. Internal caching and initialization deduplication make repeated calls safe, but application code should still avoid unnecessary calls.

## Native compatibility

Treat the JavaScript protocol as a shared contract with separate Android and iOS implementations. Before changing wire behavior, check:

- `init`, `invoke`, `get`, `set` envelopes;
- capability metadata;
- session IDs and request IDs;
- `success`, `ack`, and `error` semantics;
- native events;
- Android Modern/Legacy behavior;
- iOS reply behavior.

Do not make a protocol change on the JS side alone and assume native remains compatible.

## Dependencies and scope

Do not add runtime dependencies without explicit architectural justification. Keep this package focused on the generic JavaScript/TypeScript bridge implementation and avoid framework, UI, or platform-specific dependencies.

The current codec intentionally uses manual structural validation to preserve the zero-dependency boundary. Future work such as schema libraries, cancellation, or binary transfer requires an explicit design decision. Contract generation is not included in this list because it is already part of the native bridge library workflow.

## Security and robustness

- Validate/handle native messages at the protocol boundary.
- Do not log credentials, tokens, or sensitive native payloads by default.
- Do not weaken endpoint detection or platform assumptions just to make tests pass.
- Remember Android Legacy `addJavascriptInterface` can execute synchronously; JS code must not assume it behaves like an asynchronous channel.
- The current wire protocol is JSON/text based; do not introduce binary transport assumptions without protocol design.

## Development

This package is consumed by web applications through the workspace and does not require a separate manual build step for normal consumption.

Current package validation:

```bash
pnpm --filter @veolms/webview-bridge typecheck
```

After changes:

1. Run the narrowest relevant typecheck.
2. Review protocol and endpoint diffs carefully.
3. For protocol changes, verify request/reply and event flows.
4. For endpoint changes, verify disposal and re-initialization/navigation behavior.
5. Separate pre-existing failures from failures introduced by the change.

## Documentation

Keep package documentation concise and accurate. README covers consumer usage and scope; this file covers agent/maintainer constraints. Detailed protocol rationale belongs in the dedicated bridge architecture/specification documents.

Never describe planned/future functionality as implemented functionality.
