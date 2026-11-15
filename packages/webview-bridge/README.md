# `@veolms/webview-bridge`

Zero-dependency TypeScript client for communicating with native capabilities exposed by Android/iOS WebViews through one platform-independent API.

This package is the **JavaScript side only**. Android and iOS native implementations live outside this package and must expose a WebView endpoint that follows the bridge protocol.

## What it does

- Detects supported native WebView endpoints automatically.
- Supports Android Modern, Android Legacy, and iOS WKWebView.
- Builds a typed developer-facing bridge from generated TypeScript contracts.
- Discovers runtime capabilities through an initialization handshake.
- Correlates async native replies using request IDs.
- Supports native events, timeouts, structured errors, and writable/readable properties.
- Maps nested JS APIs to colon-separated protocol paths.
- Gracefully NOOPs unsupported function capabilities.
- Has no React, UI, framework, or runtime npm dependencies.

## Usage

The native library generates the TypeScript bridge contracts. The web app consumes the generated `NativeBridgeContract` type rather than defining the native API surface manually.

```ts
import { buildNativeBridge } from "@veolms/webview-bridge";
import type { NativeBridgeContract } from "./native-bridge-contracts";

const bridge = await buildNativeBridge<NativeBridgeContract>();

if (bridge) {
  await bridge.platform();
  await bridge.showToast("Hello");
  await bridge.systemBars.hideStatusBar();
}
```

`buildNativeBridge()` returns `null` when no supported native endpoint exists, allowing the same application code to run outside a native WebView.

The generic contract is compile-time only. The runtime bridge is a dynamic `Proxy` backed by native capability metadata.

`buildNativeBridge()` should normally be called once for the application. The library caches initialized sessions and deduplicates concurrent initialization, so repeated calls are handled safely, but application code should still avoid unnecessary calls.

In a React application, a small application-level hook can manage the bridge state and loading lifecycle when convenient. That hook does not belong in this core package.

## Native integration

The native application exposes a small message endpoint, normally named `NativeBridge`:

```text
Native WebView API
      ↓
NativeEndpoint
      ↓
NativeTransport
      ↓
NativeBridge Proxy
      ↓
Application code
```

Supported mechanisms:

- Android Modern: `addWebMessageListener`
- Android Legacy: `addJavascriptInterface` with the standardized `postMessage` channel
- iOS: `WKScriptMessageHandlerWithReply`

Native code owns the actual capabilities and must implement the protocol's initialization, invocation/property handling, errors, events, and session behavior.

## Protocol

The wire format is JSON strings. Requests use `init`, `invoke`, `get`, or `set`; replies are correlated by `id`; native can also send events.

```json
{
  "type": "request",
  "operation": "invoke",
  "id": "...",
  "payload": {
    "path": "showToast",
    "args": ["Hello"],
    "sessionId": "..."
  }
}
```

Current protocol version: **1**.

`ACK` represents a `void` operation and resolves to `undefined`; a successful value return, including explicit `null`, uses `success`.

## Public API

The root export currently provides:

- `buildNativeBridge`
- `clearNativeBridgeCache`
- `BuildBridgeOptions`
- bridge error classes
- protocol, metadata, endpoint, and transport types

`buildNativeBridge()` is the normal application-facing API. `BuildBridgeOptions` exists for cases where the defaults need to be adjusted, but the defaults are intended to be sufficient for normal use. `clearNativeBridgeCache()` is a lifecycle utility and is not normally needed by application code.

## Source layout

```text
src/
├── endpoint/    WebView platform adapters + discovery
├── protocol/    Wire types, constants, codec, validation
├── transport/   Requests, replies, events, timeouts, errors
├── bridge/      Metadata, Proxy, sessions, factory
└── index.ts     Public exports
```

Keep these boundaries intact. The proxy must remain generic and must not contain individual native APIs.

## Development

This package is consumed by web applications through the workspace package. It does not require a separate manual build step for normal consumption.

For package-level validation from the monorepo root:

```bash
pnpm --filter @veolms/webview-bridge typecheck
```

## Scope

This package provides the JavaScript/TypeScript side of the WebView-to-native bridge. Native Android/iOS implementations are separate from this package.
