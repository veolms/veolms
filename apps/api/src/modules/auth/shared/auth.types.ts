export type IdentifierType = "email" | "phone";

export type OtpPurpose = "login" | "email_verification" | "phone_verification";

export interface SessionUser {
  id: string;
  username: string;
  display_name: string;
  avatar_data_url: string | null;
  bio: string | null;
  email_public: boolean;
  mobile_public: boolean;
  linkedin_url: string | null;
  linkedin_public: boolean;
  github_url: string | null;
  github_public: boolean;
  website_url: string | null;
  website_public: boolean;
  email: string | null;
  email_verified_at: Date | null;
  phone_no: string | null;
  phone_verified_at: Date | null;
  is_deleted: boolean;
  mfa_mandatory: boolean;
  roles?: string[];
}

export interface MfaState {
  totpEnabled: boolean;
  passkeyEnabled: boolean;
  mfaMandatory: boolean;
  /** True when any factor is enrolled or the account is required to have one. */
  mfaRequired: boolean;
}

export interface EstablishedSession {
  /** Raw token for the cookie; only its hash is persisted. */
  token: string;
  sessionId: string;
  mfa: MfaState;
  /** Role names read while establishing the session. */
  roles: string[];
}

export type ChallengeType = "registration" | "authentication";

/**
 * The request logger, as far as a service needs it: a place to record a
 * provider or library error whose text must not be returned to the client.
 */
export interface AuthLogger {
  warn(details: object, message: string): void;
}

/** A user's own profile, in the names the API responds with. */
export interface UserProfileFields {
  id: string;
  username: string;
  displayName: string;
  avatarDataUrl: string | null;
  bio: string | null;
  emailPublic: boolean;
  mobilePublic: boolean;
  linkedinUrl: string | null;
  linkedinPublic: boolean;
  githubUrl: string | null;
  githubPublic: boolean;
  websiteUrl: string | null;
  websitePublic: boolean;
  email: string | null;
  emailVerified: boolean;
  phoneNo: string | null;
  mobileVerified: boolean;
}

export interface AuthenticatedUserContext extends UserProfileFields {
  name: string;
  roles: string[];
  totpEnabled: boolean;
  passkeyEnabled: boolean;
  mfaMandatory: boolean;
}

export interface AuthenticatedSessionContext {
  id: string;
  user_id: string;
  token_hash: string;
  mfa_verified: boolean;
  revoked_at: Date | null;
  expires_at: Date;
}

export interface AuthenticatedRequestContext {
  user: AuthenticatedUserContext;
  session: AuthenticatedSessionContext;
}
