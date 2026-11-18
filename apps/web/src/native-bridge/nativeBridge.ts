import {
  getBridgeClient,
  type NativeBridgeOptions,
} from "@veolms/react-webview-bridge";
import type { NativeBridgeContract } from "./native-bridge-contracts";

// Types every SDK hook and helper by the generated contract, so app code
// never passes it as a type argument: `useBridgeCall((bridge) => ...)` and
// `useNativeBridge()` already know the native API. The contract is generated
// from the native code and lives here, in the app; the SDK never names it.
declare module "@veolms/react-webview-bridge" {
  interface Register {
    contract: NativeBridgeContract;
  }
}

/** The name the native app registers the bridge under. */
export const NATIVE_BRIDGE_NAME = "NativeBridge";

/**
 * Options for the page's one session with the native app. The SDK reads them
 * once, when the session's controller is created, and either this file or
 * the `NativeBridgeProvider` in root.tsx may create it, so both pass these.
 * `timeoutMs` limits the handshake and every call, so a call the app never
 * answers does not hang forever. The connection starts when the provider
 * mounts.
 */
export const NATIVE_BRIDGE_OPTIONS: NativeBridgeOptions = { timeoutMs: 10_000 };

/**
 * The native app the page runs in (Android WebView or iOS WKWebView), typed
 * by the generated contract. Call native functions directly, from a
 * component, a service or anywhere else:
 *
 * ```ts
 * const platform = await nativeBridge.platform(); // PlatformInfo | null
 * ```
 *
 * Each call waits until the bridge is ready. It resolves `null` when there is
 * no native app (a plain browser, or the server while it renders) or the app
 * lacks that function, and rejects only on a real failure: the connection or
 * the call itself went wrong. For an answer a component renders, use
 * `useNativeQuery` (./useNativeQuery.ts).
 *
 * It is the SDK's `getBridgeClient`. The SDK's hooks (`useBridgeCall`,
 * `useBridgeEvent`, `useNativeBridge`) work too, on this same connection,
 * through the `NativeBridgeProvider` in root.tsx.
 */
export const nativeBridge = getBridgeClient(NATIVE_BRIDGE_NAME, {
  options: NATIVE_BRIDGE_OPTIONS,
  unavailable: "null",
});

/** `nativeBridge`'s type: the contract's functions, answering `null` outside the app. */
export type NativeBridge = typeof nativeBridge;
