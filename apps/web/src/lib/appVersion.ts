/**
 * The web app's build, as the deploy set it (the release commit, see
 * `VEO_APP_VERSION` in vite.config.ts), shortened; null in a local run.
 * Sent with playback incidents and video reports so a problem can be tied
 * to the release that had it.
 */
export function appVersion(): string | null {
  const version = String(import.meta.env.VEO_APP_VERSION ?? "").trim();
  return version ? version.slice(0, 12) : null;
}
