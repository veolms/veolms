import type { RegisterPushDevice } from "@veolms/contracts";

import { api } from "../../lib/api-client";
import { getInstallationId, getPlatform } from "../../native-bridge";

export const pushDevicesService = {
  register: (device: RegisterPushDevice) =>
    api.put<{ registered: true; pushEnabled: boolean }>(
      "/me/push-devices",
      device,
    ),
  remove: (fid: string, timeout: number) =>
    api.delete<{ removed: boolean }>(
      `/me/push-devices/${encodeURIComponent(fid)}`,
      { timeout },
    ),
};

/**
 * Registers this app install for push (docs/mobile-push.md): reads the FID
 * and platform from the native app and sends them to the API. Does nothing
 * in a plain browser, where both are `null`.
 *
 * The server picks the Firebase project by `applicationId`, so it must be
 * the package of the app actually running: a wrong one fails every send and
 * the server deletes the phone. Builds without `platform().applicationId`
 * fall back to `VITE_NATIVE_APP_ID`; without either, nothing is registered.
 */
export async function registerThisPushDevice() {
  const [fid, platform] = await Promise.all([
    getInstallationId(),
    getPlatform(),
  ]);
  if (!fid || !platform) return;
  const applicationId: string =
    platform.applicationId || import.meta.env.VITE_NATIVE_APP_ID || "";
  if (!applicationId) return;

  await pushDevicesService.register({
    fid,
    applicationId,
    platform: platform.name === "IOS" ? "ios" : "android",
    // The web app gets no notification-permission function (Android's call).
    pushAllowed: true,
  });
}

/**
 * At sign-out, while the session still holds: this phone stops getting the
 * account's pushes at once (the server would stop them for a signed-out
 * login anyway, so a failure loses nothing). Nothing in a plain browser.
 */
export async function unregisterThisPushDevice(timeout: number) {
  const fid = await Promise.race([
    getInstallationId(),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), timeout)),
  ]);
  if (fid) await pushDevicesService.remove(fid, timeout);
}
