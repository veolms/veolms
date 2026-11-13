import type { RegisterPushDevice } from "@veolms/contracts";

import { api } from "../../lib/api-client";
import { getInstallationId, getPlatform } from "../../native-bridge";

/** The native app's package name / bundle id, as set up in PUSH_APPS. */
const NATIVE_APP_ID: string =
  import.meta.env.VITE_NATIVE_APP_ID || "com.procodrr.app";

export const pushDevicesService = {
  register: (device: RegisterPushDevice) =>
    api.put<{ registered: true; pushEnabled: boolean }>(
      "/me/push-devices",
      device,
    ),
};

/**
 * Registers this app install for push (docs/mobile-push.md): reads the FID
 * and platform from the native app and sends them to the API. Does nothing
 * in a plain browser, where both are `null`.
 */
export async function registerThisPushDevice() {
  const [fid, platform] = await Promise.all([
    getInstallationId(),
    getPlatform(),
  ]);
  if (!fid || !platform) return;

  await pushDevicesService.register({
    fid,
    applicationId: NATIVE_APP_ID,
    platform: platform.name === "IOS" ? "ios" : "android",
    // The contract has no notification-permission function yet.
    pushAllowed: true,
  });
}
