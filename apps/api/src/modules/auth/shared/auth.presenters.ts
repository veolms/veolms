import type { MfaState, SessionUser } from "./auth.types.ts";

/**
 * Shapes the login/registration payload.
 *
 * The MFA flags tell the client whether to prompt for an existing factor or
 * enrol one. `/auth/me` also returns those flags without requiring MFA
 * step-up, so a half-finished sign-in can keep the same verify/enrol UI.
 */
export function presentLogin(user: SessionUser, mfa: MfaState) {
  return {
    user: {
      id: user.id,
      username: user.username,
      displayName: user.display_name,
      email: user.email,
      phoneNo: user.phone_no,
      roles: user.roles ?? [],
      permissions: user.permissions ?? [],
      menus: user.menus ?? [],
    },
    mfaRequired: mfa.mfaRequired,
    mfaMandatory: mfa.mfaMandatory,
    totpEnabled: mfa.totpEnabled,
    passkeyEnabled: mfa.passkeyEnabled,
  };
}
