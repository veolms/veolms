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

export interface FeatureTable {
  feature_key: string;
  description: string;
  enabled: Generated<boolean>;
  created_at: Generated<Date>;
}
