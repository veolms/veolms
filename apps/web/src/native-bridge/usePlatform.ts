import { getPlatform } from "./platform";
import { useNativeQuery } from "./useNativeQuery";

/**
 * Which platform the native app runs on, for rendering. `data` is
 * `undefined` while the bridge connects, `null` in a plain browser, and the
 * `PlatformInfo` inside the app. It shares `getPlatform`'s one native call,
 * so UI and logic never ask native twice.
 */
export function usePlatform() {
  return useNativeQuery(["platform"], () => getPlatform());
}
