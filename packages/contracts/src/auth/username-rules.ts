/**
 * Username shape shared by the zod contract and dependency-light consumers.
 *
 * The web app's route matcher needs to recognise "could this path segment be
 * a public-profile username" without importing the contracts barrel, which
 * would pull zod and every schema into its startup bundle. Keep these rules
 * and `publicProfileUsernameParamsSchema` (auth/user.ts) in lockstep.
 */
export const PUBLIC_PROFILE_USERNAME_MIN_LENGTH = 3;
export const PUBLIC_PROFILE_USERNAME_MAX_LENGTH = 30;
export const PUBLIC_PROFILE_USERNAME_PATTERN = /^[a-zA-Z0-9._-]+$/;

export function isValidPublicProfileUsername(value: string): boolean {
  return (
    value.length >= PUBLIC_PROFILE_USERNAME_MIN_LENGTH &&
    value.length <= PUBLIC_PROFILE_USERNAME_MAX_LENGTH &&
    PUBLIC_PROFILE_USERNAME_PATTERN.test(value)
  );
}
