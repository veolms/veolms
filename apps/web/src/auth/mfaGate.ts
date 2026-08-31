export type MfaSetupView = "login" | "done" | "verify" | "enroll";

const MFA_MANDATORY_ROLES = new Set(["admin"]);

export interface MfaGateUser {
  mfaVerified: boolean;
  totpEnabled: boolean;
  passkeyEnabled: boolean;
  mfaMandatory?: boolean;
  roles?: readonly string[];
}

export function accountRequiresMfaEnrollment(
  user: Pick<MfaGateUser, "mfaMandatory" | "roles">,
): boolean {
  if (user.mfaMandatory) {
    return true;
  }

  return Boolean(
    user.roles?.some((role) => MFA_MANDATORY_ROLES.has(role.toLowerCase())),
  );
}

export function resolveMfaSetupView(
  user: MfaGateUser | null | undefined,
): MfaSetupView {
  if (!user) {
    return "login";
  }

  const hasFactor = user.totpEnabled || user.passkeyEnabled;

  if (hasFactor) {
    return user.mfaVerified ? "done" : "verify";
  }

  if (accountRequiresMfaEnrollment(user) || !user.mfaVerified) {
    return "enroll";
  }

  return "done";
}
