import { useEffect, useState } from "react";
import { loadNativeBridge, type NativeBridge } from "./nativeBridge";

export type NativeBridgeState =
  | { status: "connecting"; bridge: null }
  | { status: "ready"; bridge: NativeBridge }
  /** A plain browser, or the native app's bridge could not be set up. */
  | { status: "unavailable"; bridge: null };

const CONNECTING: NativeBridgeState = { status: "connecting", bridge: null };

/**
 * The bridge to the native app this page runs in. `bridge` is `null` until
 * the connection is up, and stays `null` in a plain browser.
 *
 * Every component gets the same connection; using the hook in several places
 * does not open more than one.
 */
export function useNativeBridge(): NativeBridgeState {
  const [state, setState] = useState<NativeBridgeState>(CONNECTING);

  useEffect(() => {
    let active = true;
    void loadNativeBridge().then((bridge) => {
      if (!active) return;
      setState(
        bridge
          ? { status: "ready", bridge }
          : { status: "unavailable", bridge: null },
      );
    });
    // The connection belongs to the whole page, so a component leaving does
    // not dispose it.
    return () => {
      active = false;
    };
  }, []);

  return state;
}
