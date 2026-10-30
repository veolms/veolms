import type { Generated } from "kysely";

export type ScopeType = "platform" | "course";
export type PermissionEffect = "allow" | "deny";

export interface PermissionTable {
  id: string;
  permission_key: string;
  domain: string;
  description: string;
  created_at: Generated<Date>;
}

export interface RoleTable {
  id: string;
  name: string;
  description: string | null;
  is_system: Generated<boolean>;
  /** Course permissions apply only to courses the holder created. */
  own_courses_only: Generated<boolean>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface RolePermissionTable {
  role_id: string;
  permission_id: string;
  effect: Generated<PermissionEffect>;
}

export interface RoleAssignmentTable {
  id: string;
  user_id: string;
  role_id: string;
  scope_type: ScopeType;
  course_id: string | null;
  expires_at: Date | null;
  created_by: string | null;
  created_at: Generated<Date>;
}

export type TeamInvitationKind = "invite" | "preapproved";

/**
 * A person asked to join the team by email. `invite` rows carry a link token
 * and wait for Accept; `preapproved` rows have no token and are claimed on
 * the person's first verified sign-in with that email.
 */
export interface TeamInvitationTable {
  id: string;
  email: string;
  kind: TeamInvitationKind;
  token_hash: string | null;
  invited_by: string | null;
  message: string | null;
  expires_at: Date;
  accepted_at: Date | null;
  accepted_user_id: string | null;
  revoked_at: Date | null;
  last_sent_at: Date | null;
  send_count: Generated<number>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface TeamInvitationRoleTable {
  invitation_id: string;
  role_id: string;
}

export interface FeatureTable {
  feature_key: string;
  description: string;
  enabled: Generated<boolean>;
  created_at: Generated<Date>;
}
