/** Default endpoint registration name (mirrors `DEFAULT_BRIDGE_NAME` of `@veolms/webview-bridge`). */
export const DEFAULT_ENDPOINT_NAME = "NativeBridge";

/** Normalizes an endpoint name exactly like `buildNativeBridge` does. */
export function normalizeEndpointName(
  endpointName: string | undefined,
): string {
  return (
    (typeof endpointName === "string" ? endpointName : "").trim() ||
    DEFAULT_ENDPOINT_NAME
  );
}

/**
 * Side-effect-free check whether a native endpoint object for `name` is injected.
 *
 * Mirrors the detection order of `createNativeEndpoint` (`endpoint/native-endpoint.ts`):
 * iOS `window.webkit.messageHandlers[name].postMessage`, then Android modern/legacy
 * `window[name].postMessage` (modern additionally has `onmessage`/`addEventListener`, legacy has
 * neither, so together they accept any object with a `postMessage` function).
 *
 * `createNativeEndpoint` itself must NOT be used for probing: constructing an endpoint installs
 * window receive callbacks / listeners, and disposing the probe would remove the callbacks of the
 * live session on legacy Android and iOS.
 */
export function isNativeEndpointPresent(
  name: string = DEFAULT_ENDPOINT_NAME,
): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  try {
    const win = window as unknown as Record<string, unknown>;
    const webkit = win["webkit"] as
      { messageHandlers?: Record<string, unknown> } | undefined;
    const iosHandler = webkit?.messageHandlers?.[name] as
      { postMessage?: unknown } | undefined;
    if (iosHandler && typeof iosHandler.postMessage === "function") {
      return true;
    }
    const androidObject = win[name] as
      { postMessage?: unknown } | null | undefined;
    return (
      androidObject !== null &&
      (typeof androidObject === "object" ||
        typeof androidObject === "function") &&
      typeof androidObject.postMessage === "function"
    );
  } catch {
    return false;
  }
}
