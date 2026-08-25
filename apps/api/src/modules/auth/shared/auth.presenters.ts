import type { MfaState, SessionUser } from "./auth.types.ts";

/**
 * Shapes the login/registration payload.
 *
 * The MFA flags are part of the response because `/auth/me` is itself gated
 * behind MFA step-up: without them a client that has just been told
 * `mfaRequired` has no way to discover *which* factor to prompt for, and no way
 * to tell "verify your existing factor" apart from "you must enrol one".
 */
export function presentLogin(user: SessionUser, mfa: MfaState) {
  return {
    user: {
      id: user.id,
      username: user.username,
      displayName: user.display_name,
      email: user.email,
      phoneNo: user.phone_no,
    },
    mfaRequired: mfa.mfaRequired,
    mfaMandatory: mfa.mfaMandatory,
    totpEnabled: mfa.totpEnabled,
    passkeyEnabled: mfa.passkeyEnabled,
  };
}
