import type { Generated } from "kysely";

export type OtpIdentifierType = "email" | "phone";
export type OtpPurpose =
  | "login"
  | "registration"
  | "email_verification"
  | "phone_verification"
  /** Proving the email or number on the account now, to change it. */
  | "contact_change";

/**
 * A learner changing their own email address or mobile number: the current
 * value proven first (a code sent to it), then the new one. Open for 15
 * minutes; done once `completed_at` is set.
 */
export interface ContactChangeTable {
  id: string;
  user_id: string;
  channel: "email" | "phone";
  /** The value being replaced, as it was when the change started. */
  current_value: string | null;
  /** When the current value was proven; set at once when it had nothing to prove. */
  current_proven_at: Date | null;
  /** The value a code was last sent to, to replace it with. */
  new_value: string | null;
  expires_at: Date;
  completed_at: Date | null;
  created_at: Generated<Date>;
}

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

export type UserAvatarSource = "upload" | "google";

export interface UserAvatarTable {
  id: string;
  user_id: string;
  source: UserAvatarSource;
  storage_prefix: string;
  avatar_data_url: string;
  created_at: Generated<Date>;
  last_used_at: Generated<Date>;
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

export interface MenuPermissionTable {
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
  /** Roughly where it was signed in from (Cloudflare's location headers). */
  location_city: string | null;
  location_region: string | null;
  location_country: string | null;
  mfa_verified: Generated<boolean>;
  revoked_at: Date | null;
  expires_at: Date;
  last_used_at: Generated<Date>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
  /**
   * The lesson this session is currently playing (informational: used to
   * name the lesson in the stream-conflict notice). No foreign key; a
   * deleted lesson simply shows no title in the notice.
   */
  playing_lesson_id: string | null;
  /** When this session last pressed play — what "newest wins" compares. */
  playing_claimed_at: Date | null;
  /**
   * The last heartbeat timestamp from this session while playing. Claims
   * with `playing_at` older than PLAYBACK_CLAIM_STALE_MS are not counted.
   */
  playing_at: Date | null;
}

/**
 * A student's sign-in held back while they chose a device to sign out, as
 * the academy's device limit once asked (see the device-limit migration).
 * No longer written: the limit now signs the oldest device out instead.
 * Kept until a migration drops it, so the code it replaced can still run
 * beside it during a deploy.
 */
export interface PendingDeviceSignInTable {
  id: string;
  user_id: string;
  token_hash: string;
  ip_address: string | null;
  user_agent: string | null;
  location_city: string | null;
  location_region: string | null;
  location_country: string | null;
  expires_at: Date;
  used_at: Date | null;
  created_at: Generated<Date>;
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
  /** Address the send was requested from; null on rows that predate it. */
  requester_ip: string | null;
  /** Signed-in user who requested the send (profile verification only). */
  requester_user_id: string | null;
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

export interface OauthNonceTable {
  token_hash: string;
  expires_at: Date;
  used_at: Date | null;
}
