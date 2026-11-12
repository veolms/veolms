import { useQuery, type UseQueryOptions } from "@tanstack/react-query";
import { nativeBridge, type NativeBridge } from "./nativeBridge";

/** Query keys for answers from the native app. */
export const nativeBridgeKeys = {
  all: ["native-bridge"] as const,
};

/**
 * An answer from the native app, for rendering: TanStack Query's `useQuery`
 * over one `nativeBridge` call.
 *
 * ```ts
 * const { data: fid } = useNativeQuery(
 *   ["firebase", "installationId"],
 *   (native) => native.firebase.getInstallationId(),
 * );
 * ```
 *
 * - `data` is `undefined` while the bridge connects, `null` outside the
 *   native app (a plain browser), and the answer inside it.
 * - It runs on mount. Every component using the same key shares one native
 *   call and one cached answer. Put a call's arguments in the key too:
 *   `["files", "info", path]`.
 * - The key is placed under `nativeBridgeKeys.all`, so all native answers can
 *   be invalidated together.
 * - Native answers do not go stale while the page is open (`staleTime:
 *   Infinity`), and a failure is not retried: `nativeBridge` already waits
 *   for the connection and the SDK retries the handshake. It also runs while
 *   the device is offline (`networkMode: "always"`). Override any of these
 *   through `options`.
 *
 * For native actions (vibrate, share, open a screen), call `nativeBridge`
 * from the handler, or use `useMutation` with `networkMode: "always"`;
 * never a query.
 */
export function useNativeQuery<R>(
  key: readonly unknown[],
  call: (native: NativeBridge) => Promise<R>,
  options?: Omit<UseQueryOptions<R>, "queryKey" | "queryFn">,
) {
  return useQuery<R>({
    queryKey: [...nativeBridgeKeys.all, ...key],
    queryFn: () => call(nativeBridge),
    staleTime: Infinity,
    retry: false,
    // Native answers come from the app, not the network: run (and stay
    // runnable) while the device is offline. TanStack Query's default,
    // "online", would pause the query until a connection returns.
    networkMode: "always",
    ...options,
  });
}
