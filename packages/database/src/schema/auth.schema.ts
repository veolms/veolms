import type { Generated } from "kysely";

export type OtpIdentifierType = "email" | "phone";
export type OtpPurpose =
  "login" | "registration" | "email_verification" | "phone_verification";

export interface AcademyTable {
  id: string;
  name: string;
  logo_url: string | null;
  custom_domain: string | null;
  setup_completed: Generated<boolean>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface UserTable {
  id: string;
  email: string | null;
  phone_no: string | null;
  phone_verified_at: Date | null;
  is_deleted: Generated<boolean>;
  username: string;
  display_name: string;
  avatar_data_url: string | null;
  bio: string | null;
  email_public: Generated<boolean>;
  mobile_public: Generated<boolean>;
  linkedin_url: string | null;
  linkedin_public: Generated<boolean>;
  github_url: string | null;
  github_public: Generated<boolean>;
  website_url: string | null;
  website_public: Generated<boolean>;
  email_verified_at: Date | null;
  mfa_mandatory: Generated<boolean>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface RoleTable {
  id: string;
  name: string;
  description: string | null;
  last_permission_update: Generated<Date>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface UserRoleTable {
  user_id: string;
  role_id: string;
  created_at: Generated<Date>;
}

export interface MenuTable {
  id: string;
  parent_id: string | null;
  label: string;
  route_link: string;
  icon: string | null;
  expanded: Generated<boolean>;
  check_list: string | null;
  is_both: Generated<boolean>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface PermissionTable {
  id: string;
  role_id: string;
  menu_id: string;
  can_create: Generated<boolean>;
  can_read: Generated<boolean>;
  can_update: Generated<boolean>;
  can_delete: Generated<boolean>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface SessionTable {
  id: string;
  user_id: string;
  token_hash: string;
  ip_address: string | null;
  user_agent: string | null;
  mfa_verified: Generated<boolean>;
  revoked_at: Date | null;
  expires_at: Date;
  last_used_at: Generated<Date>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface OauthAccountTable {
  id: string;
  user_id: string;
  provider: string;
  provider_user_id: string;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface OtpCodeTable {
  id: string;
  identifier: string;
  identifier_type: string;
  purpose: string;
  code_hash: string;
  attempts: Generated<number>;
  expires_at: Date;
  consumed_at: Date | null;
  created_at: Generated<Date>;
}

export interface PasskeyTable {
  id: string;
  user_id: string;
  credential_id: string;
  public_key: string;
  counter: Generated<number>;
  transports: string | null;
  created_at: Generated<Date>;
}

export interface UserTotpCredentialTable {
  id: string;
  user_id: string;
  secret_encrypted: string;
  enabled: Generated<boolean>;
  last_used_step: string | null;
  failed_attempts: Generated<number>;
  locked_until: Date | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface MfaBackupCodeTable {
  id: string;
  user_id: string;
  code_hash: string;
  used_at: Date | null;
  created_at: Generated<Date>;
}

export interface WebauthnChallengeTable {
  id: string;
  user_id: string | null;
  challenge: string;
  type: string;
  expires_at: Date;
  consumed_at: Date | null;
  created_at: Generated<Date>;
}
