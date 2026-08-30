import { ADMIN_ROLE } from "./auth.constants.ts";

export function isMfaMandatoryAccount(
  storedFlag: boolean,
  roles: readonly string[] | null | undefined,
): boolean {
  if (storedFlag) {
    return true;
  }

  return Boolean(
    roles?.some((role) => role.toLowerCase() === ADMIN_ROLE),
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
