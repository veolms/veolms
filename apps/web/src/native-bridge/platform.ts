import type { PlatformInfo } from "./native-bridge-contracts";
import { nativeBridge } from "./nativeBridge";

let platform: Promise<PlatformInfo | null> | undefined;

/**
 * Which platform the native app runs on, for logic (building a request,
 * analytics). `null` in a plain browser. The answer cannot change while the
 * page is open, so every caller shares one native call per page load.
 */
export function getPlatform() {
  platform ??= nativeBridge.platform().catch((error: unknown) => {
    platform = undefined; // a failure is not kept: the next caller asks again
    throw error;
  });
  return platform;
}
