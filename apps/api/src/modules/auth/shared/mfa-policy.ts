import { ADMIN_ROLE, INSTRUCTOR_ROLE } from "./auth.constants.ts";

const MANDATORY_MFA_ROLES = new Set([ADMIN_ROLE, INSTRUCTOR_ROLE]);

export function isMfaMandatoryAccount(
  storedFlag: boolean,
  roles: readonly string[] | null | undefined,
  options?: { skipAdminMfa?: boolean },
): boolean {
  const isAdmin = Boolean(
    roles?.some((role) => role.toLowerCase() === ADMIN_ROLE),
  );
  if (options?.skipAdminMfa && isAdmin) {
    return false;
  }

  if (storedFlag) {
    return true;
  }

  return Boolean(
    roles?.some((role) => MANDATORY_MFA_ROLES.has(role.toLowerCase())),
  );
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
