import {
  getBridgeController,
  isBridgeNotReadyError,
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

// Looked up on every call, never kept: when the last provider unmounts its
// controller is dropped, and a later mount creates a new one.
const controller = () =>
  getBridgeController(NATIVE_BRIDGE_NAME, {
    options: NATIVE_BRIDGE_OPTIONS,
  });

/**
 * A contract as callable functions: every native function keeps its
 * arguments and returns a promise of its answer, or of `null` when there is
 * no native app to answer. Namespaces nest. Plain native properties are left
 * out; read them through the SDK's `useNativeBridge` if one is ever needed.
 */
type NativeCalls<T> = {
  [
    K in keyof T as T[K] extends (...args: never[]) => unknown
      ? K
      : T[K] extends object
        ? K
        : never
  ]: T[K] extends (...args: infer A) => infer R
    ? (...args: A) => Promise<Awaited<R> | null>
    : NativeCalls<T[K]>;
};

// Names that must never become native calls: `then` (or `await` would treat
// a namespace as a promise), and the ones JSON and string conversion look up.
const NOT_NATIVE = new Set(["then", "toJSON", "toString", "valueOf"]);

/**
 * Turns `nativeBridge.a.b(...args)` into
 * `controller.call((bridge) => bridge.a.b(...args))`. The call waits until
 * the bridge is ready, so callers never deal with the connection, and
 * resolves `null` when the page is not running inside the native app.
 */
function forwardCalls(path: readonly string[]): unknown {
  const invoke = (...args: unknown[]): Promise<unknown> => {
    // On the server (the dev server's render, prerendering) there is no
    // native app and no provider ever connects, so the call would only wait
    // for its timeout and then reject. Answer at once instead.
    if (typeof window === "undefined") return Promise.resolve(null);
    return controller()
      .call((bridge) => {
        const owner = path
          .slice(0, -1)
          .reduce<unknown>(
            (node, key) => (node as Record<string, unknown>)[key],
            bridge,
          ) as Record<string, (...callArgs: unknown[]) => unknown>;
        return owner[path[path.length - 1] ?? ""]?.(...args);
      })
      .catch((error: unknown) => {
        // A plain browser has no native app: normal, so no error.
        if (isBridgeNotReadyError(error) && error.reason === "unavailable") {
          return null;
        }
        throw error;
      });
  };
  return new Proxy(invoke, {
    get: (_target, key) =>
      typeof key === "string" && !NOT_NATIVE.has(key)
        ? forwardCalls([...path, key])
        : undefined,
  });
}

/**
 * The native app the page runs in (Android WebView or iOS WKWebView), typed
 * by the generated contract. Call native functions directly, from a
 * component, a service or anywhere else:
 *
 * ```ts
 * const platform = await nativeBridge.platform(); // PlatformInfo | null
 *
 * // A component that renders the answer:
 * const { data } = useQuery({
 *   queryKey: ["native", "platform"],
 *   queryFn: () => nativeBridge.platform(),
 * });
 * ```
 *
 * Each call waits until the bridge is ready. It resolves `null` when there is
 * no native app (a plain browser, or the server while it renders) or the
 * app lacks that function, and rejects
 * only on a real failure: the connection or the call itself went wrong.
 *
 * The SDK's own hooks (`useBridgeCall`, `useBridgeEvent`, `useNativeBridge`)
 * work too, on this same connection, through the `NativeBridgeProvider` in
 * root.tsx.
 */
export const nativeBridge = forwardCalls(
  [],
) as NativeCalls<NativeBridgeContract>;
