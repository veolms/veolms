import { PUBLIC_PROFILE_USERNAME_MAX_LENGTH } from "@veolms/contracts";

import { DISPLAY_NAME_MAX_LENGTH } from "./auth.constants.ts";
import type { MfaState, SessionUser, UserProfileFields } from "./auth.types.ts";
import { isTestLoginAccount, toUserProfileFields } from "./auth.utils.ts";
import { avatarSrcSetFromUrl, displayAvatarUrl } from "../../avatars/index.ts";

export function presentAvatar(avatarDataUrl: string | null) {
  const effectiveUrl = displayAvatarUrl(avatarDataUrl);
  return {
    avatarDataUrl: effectiveUrl,
    avatarSrcSet: avatarSrcSetFromUrl(effectiveUrl),
  };
}

/**
 * The account fields shared by the login payload and the profile payload.
 *
 * An account created before names were bounded on write can hold a longer
 * username or display name than these responses allow. Sent as stored, every
 * sign-in and every `/auth/me` for that account failed, so its owner could
 * not even reach the profile form to shorten them. A migration shortens the
 * stored values (20261013100000); this keeps such an account working where
 * that has not run yet, and for a name the two count differently.
 */
function presentAccount(profile: UserProfileFields, roles: string[]) {
  return {
    id: profile.id,
    username: profile.username.slice(0, PUBLIC_PROFILE_USERNAME_MAX_LENGTH),
    displayName: profile.displayName.slice(0, DISPLAY_NAME_MAX_LENGTH),
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
    isTestAccount: isTestLoginAccount(profile.email),
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
