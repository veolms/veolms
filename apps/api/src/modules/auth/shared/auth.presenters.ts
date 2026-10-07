import type { MfaState, SessionUser, UserProfileFields } from "./auth.types.ts";
import { toUserProfileFields } from "./auth.utils.ts";
import { avatarSrcSetFromUrl, displayAvatarUrl } from "../../avatars/index.ts";

export function presentAvatar(avatarDataUrl: string | null) {
  const effectiveUrl = displayAvatarUrl(avatarDataUrl);
  return {
    avatarDataUrl: effectiveUrl,
    avatarSrcSet: avatarSrcSetFromUrl(effectiveUrl),
  };
}

/** The account fields shared by the login payload and the profile payload. */
function presentAccount(profile: UserProfileFields, roles: string[]) {
  return {
    id: profile.id,
    username: profile.username,
    displayName: profile.displayName,
    ...presentAvatar(profile.avatarDataUrl),
    bio: profile.bio,
    emailPublic: profile.emailPublic,
    mobilePublic: profile.mobilePublic,
    linkedinUrl: profile.linkedinUrl,
    linkedinPublic: profile.linkedinPublic,
    githubUrl: profile.githubUrl,
    githubPublic: profile.githubPublic,
    websiteUrl: profile.websiteUrl,
    websitePublic: profile.websitePublic,
    email: profile.email,
    emailVerified: profile.emailVerified,
    phoneNo: profile.phoneNo,
    mobileVerified: profile.mobileVerified,
    roles,
  };
}

/**
 * Shapes the signed-in user's own profile: `/auth/me` and every endpoint that
 * returns the profile after changing it.
 */
export function presentUserProfile(
  profile: UserProfileFields,
  roles: string[],
  mfa: {
    mfaVerified: boolean;
    totpEnabled: boolean;
    passkeyEnabled: boolean;
    mfaMandatory: boolean;
  },
) {
  return {
    ...presentAccount(profile, roles),
    mfaVerified: mfa.mfaVerified,
    totpEnabled: mfa.totpEnabled,
    passkeyEnabled: mfa.passkeyEnabled,
    mfaMandatory: mfa.mfaMandatory,
  };
}

/**
 * Shapes the login/registration payload.
 *
 * The MFA flags tell the client whether to prompt for an existing factor or
 * enrol one. `/auth/me` also returns those flags without requiring MFA
 * step-up, so a half-finished sign-in can keep the same verify/enrol UI.
 */
export function presentLogin(user: SessionUser, mfa: MfaState) {
  return {
    user: presentAccount(toUserProfileFields(user), user.roles ?? []),
    mfaRequired: mfa.mfaRequired,
    mfaMandatory: mfa.mfaMandatory,
    totpEnabled: mfa.totpEnabled,
    passkeyEnabled: mfa.passkeyEnabled,
  };
}
