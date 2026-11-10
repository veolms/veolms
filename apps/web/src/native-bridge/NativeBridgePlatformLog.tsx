import { useEffect } from "react";
import { useNativeBridge } from "./useNativeBridge";

/**
 * Once the native app's bridge is up, asks it which platform it is and logs
 * the answer, to show the connection works end to end. Renders nothing, and
 * does nothing in a plain browser.
 */
export function NativeBridgePlatformLog() {
  const { bridge } = useNativeBridge();

  useEffect(() => {
    if (!bridge) return;
    let active = true;
    bridge.platform().then(
      (platform) => {
        if (active) console.log("[NativeBridge] platform()", platform);
      },
      (error: unknown) => {
        if (active) console.warn("[NativeBridge] platform() failed:", error);
      },
    );
    return () => {
      active = false;
    };
  }, [bridge]);

  return null;
}
