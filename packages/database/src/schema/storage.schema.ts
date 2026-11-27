import type { ColumnType, Generated } from "kysely";

/** A bigint column: read as a string, written as a number or string. */
type Bytes = ColumnType<string, number | string, number | string>;
type OptionalBytes = ColumnType<
  string | null,
  number | string | null | undefined,
  number | string | null
>;

/** One row: the default space every learner has (migration 20261123150000). */
export interface StorageSettingsTable {
  id: Generated<boolean>;
  default_limit_bytes: Bytes;
  updated_by: string | null;
  updated_at: Generated<Date>;
}

/**
 * One person's space. `used_bytes` is kept by triggers on the upload tables
 * and recomputed by `storage_recount`; never written by the API directly.
 */
export interface UserStorageTable {
  user_id: string;
  used_bytes: ColumnType<string, number | string | undefined, number | string>;
  /** Null: the default from `storage_settings`. */
  limit_bytes: OptionalBytes;
  blocked_at: Date | null;
  blocked_by: string | null;
  block_reason: string | null;
  last_upload_at: Date | null;
  reconciled_at: Date | null;
  updated_at: Generated<Date>;
}

export type StorageRequestStatus =
  "pending" | "approved" | "declined" | "cancelled";

export interface StorageRequestTable {
  id: Generated<string>;
  user_id: string;
  status: Generated<StorageRequestStatus>;
  note: string | null;
  used_bytes: Bytes;
  limit_bytes: Bytes;
  granted_limit_bytes: OptionalBytes;
  decided_by: string | null;
  decided_at: Date | null;
  decision_note: string | null;
  created_at: Generated<Date>;
}

export type StorageEventAction =
  | "request"
  | "cancel_request"
  | "approve_request"
  | "decline_request"
  | "set_limit"
  | "reset_limit"
  | "block"
  | "unblock"
  | "recount"
  | "set_default_limit";

export interface StorageEventTable {
  id: Generated<string>;
  user_id: string;
  actor_id: string | null;
  action: StorageEventAction;
  from_limit_bytes: OptionalBytes;
  to_limit_bytes: OptionalBytes;
  request_id: string | null;
  note: string | null;
  created_at: Generated<Date>;
}
