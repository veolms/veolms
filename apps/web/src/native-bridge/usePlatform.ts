import { useQuery } from "@tanstack/react-query";
import { nativeBridge } from "./nativeBridge";

/** Query keys for answers from the native app. */
export const nativeBridgeKeys = {
  all: ["native-bridge"] as const,
  platform: () => [...nativeBridgeKeys.all, "platform"] as const,
};

/**
 * Which platform the native app runs on, for rendering. `data` is
 * `undefined` while the bridge connects, `null` in a plain browser, and the
 * `PlatformInfo` inside the app.
 *
 * Every component using it shares one native request: TanStack Query keeps
 * the answer, and the platform cannot change while the page is open.
 */
export function usePlatform() {
  return useQuery({
    queryKey: nativeBridgeKeys.platform(),
    queryFn: () => nativeBridge.platform(),
    staleTime: Infinity,
    // nativeBridge already waits for the connection, and the SDK retries the
    // handshake; a failure after that is not worth asking again.
    retry: false,
  });
}
