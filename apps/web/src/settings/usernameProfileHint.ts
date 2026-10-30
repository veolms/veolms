// The subpath import matters: the contracts barrel would put zod and every
// schema into the settings chunk. username-rules is dependency-free.
import { PUBLIC_PROFILE_USERNAME_MIN_LENGTH } from "@veolms/contracts/username-rules";

/**
 * The line shown under the username field for an account whose saved
 * username is too short to have a profile page, or null for every other
 * account.
 *
 * A profile lives at /<username>, and a name shorter than the minimum is
 * never looked up there: the address shows "Page not found". Accounts made
 * before the minimum can still have such a name, and nothing told them why
 * their profile would not open, or that picking a longer name here fixes it.
 *
 * Decided from the saved username alone. What is being typed does not
 * count: the profile page follows the saved name, so the line stays until a
 * longer one is saved and does not appear while a long saved name is being
 * edited down (the form's own message covers a draft that cannot be saved).
 */
export function getShortUsernameHint(
  savedUsername: string | null | undefined,
): string | null {
  const username = savedUsername?.trim() ?? "";
  if (!username || username.length >= PUBLIC_PROFILE_USERNAME_MIN_LENGTH) {
    return null;
  }
  return `Your username is too short to have a profile page. Choose one with at least ${PUBLIC_PROFILE_USERNAME_MIN_LENGTH} characters.`;
}
