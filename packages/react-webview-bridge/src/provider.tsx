import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import { getBridgeController } from "./controller.ts";
import { normalizeEndpointName } from "./presence.ts";
import type {
  BridgeController,
  NativeBridgeOptions,
  RetryPolicy,
} from "./types.ts";

/** Context carrying the per-endpoint controller. `null` outside a provider. */
export const NativeBridgeContext = createContext<BridgeController | null>(null);
NativeBridgeContext.displayName = "NativeBridgeContext";

export interface NativeBridgeProviderProps {
  /** Endpoint registration name on `window` (default `"NativeBridge"`). */
  endpointName?: string;
  /**
   * Options for `buildNativeBridge`. Read once, when the controller for this endpoint is created
   * ("first call wins"); changing them later has no effect until the controller is disposed.
   */
  options?: NativeBridgeOptions;
  /** Backoff policy (merged with defaults). Read once, like `options`. */
  retry?: Partial<RetryPolicy>;
  /**
   * Keep the session alive after this provider unmounts (never release ownership).
   * Default `false`: when the last provider for the endpoint unmounts, the session is disposed
   * after a macrotask (StrictMode remounts are unaffected).
   */
  keepAlive?: boolean;
  children?: ReactNode;
}

/**
 * Initializes (once per endpoint, app-wide) and shares a native bridge.
 *
 * The bridge lives in a module-level controller, not in React state: re-renders, StrictMode's
 * double effects and multiple providers for the same endpoint all share one
 * `buildNativeBridge` call and one session.
 */
export function NativeBridgeProvider({
  endpointName,
  options,
  retry,
  keepAlive = false,
  children,
}: NativeBridgeProviderProps) {
  const name = normalizeEndpointName(endpointName);
  // Options/retry are intentionally read only when the controller is created.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const controller = useMemo(
    () => getBridgeController(name, { options, retry }),
    [name],
  );

  // One owner per controller. `keepAlive` is read when the effect cleans up, so changing it
  // never acquires a second owner, and turning it off lets unmount release the one held.
  const keepAliveRef = useRef(keepAlive);
  useEffect(() => {
    keepAliveRef.current = keepAlive;
  });
  // A release kept back by a keepAlive cleanup (StrictMode's simulated unmount, or a name
  // change), so at most one owner per provider is ever kept.
  const kept = useRef<(() => void) | null>(null);

  useEffect(() => {
    const release = controller.acquire();
    return () => {
      if (keepAliveRef.current) {
        kept.current?.();
        kept.current = release;
      } else {
        release();
      }
    };
  }, [controller]);

  // keepAlive turned off while a release is kept back: hand it back now.
  useEffect(() => {
    if (!keepAlive && kept.current) {
      kept.current();
      kept.current = null;
    }
  }, [keepAlive]);

  return (
    <NativeBridgeContext.Provider value={controller}>
      {children}
    </NativeBridgeContext.Provider>
  );
}

/**
 * Returns the controller of the nearest {@link NativeBridgeProvider}.
 * @throws when used outside a provider.
 */
export function useBridgeController<
  T extends object = Record<string, unknown>,
>(): BridgeController<T> {
  const controller = useContext(NativeBridgeContext);
  if (!controller) {
    throw new Error(
      "[react-webview-bridge] No <NativeBridgeProvider> found. Wrap your app (or iframe root) in one.",
    );
  }
  return controller as unknown as BridgeController<T>;
}
