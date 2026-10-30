import { STUDENT_ROLE } from "./auth.constants.ts";

/**
 * SKIP_ADMIN_MFA set: every staff account (admins, instructors and every
 * team role) signs in without two-factor, for development and testing.
 */
export function skipsStaffMfa(
  skip: boolean,
  roles: readonly string[] | null | undefined,
): boolean {
  return skip && isStaffAccount(roles);
}

export function isMfaMandatoryAccount(
  storedFlag: boolean,
  roles: readonly string[] | null | undefined,
  options?: { skipStaffMfa?: boolean },
): boolean {
  if (skipsStaffMfa(Boolean(options?.skipStaffMfa), roles)) {
    return false;
  }

  if (storedFlag) {
    return true;
  }

  return isStaffAccount(roles);
}

/**
 * Anyone holding a role other than student (admins, instructors and every
 * team role, custom ones included): two-factor sign-in is always required of
 * them; students have none (see `isTwoFactorOffFor`).
 */
export function isStaffAccount(
  roles: readonly string[] | null | undefined,
): boolean {
  return Boolean(roles?.some((role) => role.toLowerCase() !== STUDENT_ROLE));
}

export function sessionNeedsMfaChallenge(input: {
  mfaMandatory: boolean;
  totpEnabled: boolean;
  passkeyEnabled: boolean;
  mfaVerified: boolean;
}): boolean {
  const hasFactor = input.totpEnabled || input.passkeyEnabled;

  if (input.mfaMandatory && !hasFactor) {
    return true;
  }

  return hasFactor && !input.mfaVerified;
}
