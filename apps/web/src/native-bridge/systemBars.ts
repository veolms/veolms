import { useNativeBridge } from "@veolms/react-webview-bridge";

import type { SystemBarColors } from "./native-bridge-contracts";
import { nativeBridge } from "./nativeBridge";

/**
 * Whether the native app can colour its status and navigation bars. Decided
 * by `$has` alone, which makes no native call: `false` in a browser, in an
 * app build without the function, and while the bridge connects.
 */
export function useSystemBarsSupported(): boolean {
  const { bridge } = useNativeBridge();
  return bridge?.$has("systemBars:setColors") ?? false;
}

/**
 * Tells the native app the colours behind its status bar and navigation bar,
 * as opaque `#rrggbb`. A bar left `null` gets the app's default colour; each
 * call describes both bars. The app picks the icon colour itself, and a new
 * page load starts from the app's own colours. Fire and forget.
 */
export function setNativeSystemBarColors(colors: SystemBarColors) {
  nativeBridge.systemBars
    .setColors(colors)
    .catch((error: unknown) =>
      console.warn("[NativeBridge] systemBars.setColors() failed:", error),
    );
}
