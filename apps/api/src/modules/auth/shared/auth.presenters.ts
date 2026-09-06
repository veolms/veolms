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
      avatarDataUrl: user.avatar_data_url,
      bio: user.bio,
      emailPublic: Boolean(
        user.email_public && user.email && user.email_verified_at,
      ),
      mobilePublic: Boolean(
        user.mobile_public && user.phone_no && user.phone_verified_at,
      ),
      linkedinUrl: user.linkedin_url,
      linkedinPublic: Boolean(user.linkedin_public && user.linkedin_url),
      githubUrl: user.github_url,
      githubPublic: Boolean(user.github_public && user.github_url),
      websiteUrl: user.website_url,
      websitePublic: Boolean(user.website_public && user.website_url),
      email: user.email,
      emailVerified: Boolean(user.email_verified_at),
      phoneNo: user.phone_no,
      mobileVerified: Boolean(user.phone_verified_at),
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
