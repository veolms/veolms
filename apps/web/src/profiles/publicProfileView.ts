export type PublicProfileView =
  "loading" | "profile" | "not-found" | "unavailable";

/**
 * What the profile page shows for the state of its lookup.
 *
 * Any one-word address is tried as a username, so a mistyped address lands
 * here too. When the lookup answers that no such profile exists (404, which
 * is also what a deactivated account answers), the address leads nowhere and
 * the page is the app's not-found screen. Any other failure (no network, too
 * many requests, a server error) says nothing about the address: the profile
 * may well exist, so those keep the "unavailable, try again" message.
 */
export function resolvePublicProfileView(input: {
  isLoading: boolean;
  isError: boolean;
  /** HTTP status of the failed lookup, when it got an answer. */
  errorStatus: number | undefined;
  hasProfile: boolean;
}): PublicProfileView {
  if (input.isLoading) return "loading";
  if (input.isError) {
    return input.errorStatus === 404 ? "not-found" : "unavailable";
  }
  return input.hasProfile ? "profile" : "unavailable";
}
