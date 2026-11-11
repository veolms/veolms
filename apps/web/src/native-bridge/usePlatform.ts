import { useNativeQuery } from "./useNativeQuery";

/**
 * Which platform the native app runs on, for rendering. `data` is
 * `undefined` while the bridge connects, `null` in a plain browser, and the
 * `PlatformInfo` inside the app. Every component using it shares one native
 * request.
 */
export function usePlatform() {
  return useNativeQuery(["platform"], (native) => native.platform());
}
