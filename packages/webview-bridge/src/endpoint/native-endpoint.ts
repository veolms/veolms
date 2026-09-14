import { DEFAULT_BRIDGE_NAME } from "../protocol/constants.ts";
import { AndroidModernEndpoint } from "./android.ts";
import { AndroidLegacyEndpoint } from "./android.legacy.ts";
import { IOSEndpoint } from "./ios.ts";
import type { NativeEndpoint } from "./types.d.ts";

/**
 * Endpoint discovery factory.
 * Inspects runtime environment for native WebView messaging capabilities:
 * 1. iOS WebKit message handler (`window.webkit.messageHandlers[name]`)
 * 2. Android Modern WebMessageListener (`window[name]`)
 * 3. Android Legacy JavascriptInterface (`window[name]`)
 *
 * Returns a unified `NativeEndpoint` platform adapter, or `null` if no platform
 * endpoint is available.
 */
export function createNativeEndpoint(
  endpointName: string = DEFAULT_BRIDGE_NAME,
): NativeEndpoint | null {
  const name =
    (typeof endpointName === "string" ? endpointName : "").trim() ||
    DEFAULT_BRIDGE_NAME;

  if (IOSEndpoint.isAvailable(name)) {
    return new IOSEndpoint(name);
  }

  if (AndroidModernEndpoint.isAvailable(name)) {
    return new AndroidModernEndpoint(name);
  }

  if (AndroidLegacyEndpoint.isAvailable(name)) {
    return new AndroidLegacyEndpoint(name);
  }

  return null;
}
