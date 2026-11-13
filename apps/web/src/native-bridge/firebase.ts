import { nativeBridge } from "./nativeBridge";

let installationId: Promise<string | null> | undefined;

/**
 * The app install's Firebase Installation ID (FID), for push registration.
 * `null` in a plain browser or in an app build without the function. Every
 * caller shares one native call per page load.
 */
export function getInstallationId() {
  installationId ??= nativeBridge.firebase
    .getInstallationId()
    .catch((error: unknown) => {
      installationId = undefined; // a failure is not kept: the next caller asks again
      throw error;
    });
  return installationId;
}
