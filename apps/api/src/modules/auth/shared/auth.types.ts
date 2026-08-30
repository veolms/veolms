import type { AuthMenuNode } from "@veolms/contracts";

export type IdentifierType = "email" | "phone";

export type OtpPurpose = "login" | "email_verification" | "phone_verification";

export interface SessionUser {
  id: string;
  username: string;
  display_name: string;
  email: string | null;
  phone_no: string | null;
  mfa_mandatory: boolean;
  roles?: string[];
  permissions?: string[];
  menus?: AuthMenuNode[];
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
}

export type ChallengeType = "registration" | "authentication";

export interface AuthenticatedUserContext {
  id: string;
  username: string;
  name: string;
  displayName: string;
  email: string | null;
  phoneNo: string | null;
  roles: string[];
  permissions: string[];
  menus: AuthMenuNode[];
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
