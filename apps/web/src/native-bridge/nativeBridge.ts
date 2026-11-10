import {
  BridgeError,
  buildNativeBridge,
  type BridgeEventHandler,
} from "@veolms/webview-bridge";
import type { NativeBridgeContract } from "./native-bridge-contracts";

/** The name the native app registers the bridge under (the library's default). */
export const NATIVE_BRIDGE_NAME = "NativeBridge";

/**
 * How long to wait for the native app to answer: the start-up handshake and
 * every call after it. Without a limit, a call the app never answers would
 * leave its promise pending forever.
 */
const NATIVE_BRIDGE_TIMEOUT_MS = 10_000;

/** What the bridge adds at its root; the generated contract leaves these out. */
interface NativeBridgeRootMembers {
  /** Listens for an event the native app sends; returns the unsubscribe. */
  onEvent(eventName: string, handler: BridgeEventHandler): () => void;
  dispose(): void;
}

export type NativeBridge = NativeBridgeContract & NativeBridgeRootMembers;

// A plain browser has no native app, which the library reports as a plain
// Error and is nothing to warn about. A failed start-up inside the app (no
// answer, a protocol mismatch, an error from native) is a BridgeError.
const reportInitError = (error: Error) => {
  if (error instanceof BridgeError) {
    console.warn("[NativeBridge] Could not connect to the native app:", error);
  }
};

/**
 * Connects to the native app the page is running in (Android WebView or iOS
 * WKWebView). Resolves `null` in a plain browser, on the server, or when the
 * connection could not be set up; it never rejects.
 *
 * The library keeps one connection for the whole page and honours only the
 * options of the call that opens it, so every caller goes through here.
 */
export const loadNativeBridge = (): Promise<NativeBridge | null> => {
  if (typeof window === "undefined") return Promise.resolve(null);
  return buildNativeBridge<NativeBridge>(NATIVE_BRIDGE_NAME, {
    timeoutMs: NATIVE_BRIDGE_TIMEOUT_MS,
    onInitError: reportInitError,
  });
};
