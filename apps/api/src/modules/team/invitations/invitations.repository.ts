import { sql, type SqlBool } from "kysely";
import type {
  DatabaseExecutor as Executor,
  TeamInvitationKind,
} from "@veolms/database";

export interface InvitationRow {
  id: string;
  email: string;
  kind: TeamInvitationKind;
  invited_by: string | null;
  message: string | null;
  expires_at: Date;
  accepted_at: Date | null;
  accepted_user_id: string | null;
  revoked_at: Date | null;
  last_sent_at: Date | null;
  send_count: number;
  created_at: Date;
}

const invitationColumns = [
  "id",
  "email",
  "kind",
  "invited_by",
  "message",
  "expires_at",
  "accepted_at",
  "accepted_user_id",
  "revoked_at",
  "last_sent_at",
  "send_count",
  "created_at",
] as const;

/** Not accepted or revoked (it may still have expired). */
const isOpen = sql<SqlBool>`accepted_at is null and revoked_at is null`;

export async function findOpenByEmail(
  database: Executor,
  email: string,
): Promise<InvitationRow | undefined> {
  return await database
    .selectFrom("team_invitations")
    .select(invitationColumns)
    .where("email", "=", email)
    .where(isOpen)
    .forUpdate()
    .executeTakeFirst();
}

export async function findById(
  database: Executor,
  id: string,
  options: { lock?: boolean } = {},
): Promise<InvitationRow | undefined> {
  return await database
    .selectFrom("team_invitations")
    .select(invitationColumns)
    .where("id", "=", id)
    .$if(Boolean(options.lock), (qb) => qb.forUpdate())
    .executeTakeFirst();
}

export async function findByTokenHash(
  database: Executor,
  tokenHash: string,
  options: { lock?: boolean } = {},
): Promise<InvitationRow | undefined> {
  return await database
    .selectFrom("team_invitations")
    .select(invitationColumns)
    .where("token_hash", "=", tokenHash)
    .where("kind", "=", "invite")
    .$if(Boolean(options.lock), (qb) => qb.forUpdate())
    .executeTakeFirst();
}

/** Open, unexpired add-by-email rows for one address, locked for the claim. */
export async function lockClaimable(
  database: Executor,
  email: string,
): Promise<InvitationRow[]> {
  return await database
    .selectFrom("team_invitations")
    .select(invitationColumns)
    .where("email", "=", email)
    .where("kind", "=", "preapproved")
    .where(isOpen)
    .where("expires_at", ">", sql<Date>`now()`)
    .forUpdate()
    .execute();
}

export async function insertInvitation(
  database: Executor,
  row: {
    id: string;
    email: string;
    kind: TeamInvitationKind;
    tokenHash: string | null;
    invitedBy: string;
    message: string | null;
    expiresAt: Date;
  },
): Promise<void> {
  await database
    .insertInto("team_invitations")
    .values({
      id: row.id,
      email: row.email,
      kind: row.kind,
      token_hash: row.tokenHash,
      invited_by: row.invitedBy,
      message: row.message,
      expires_at: row.expiresAt,
    })
    .execute();
}

export async function updateInvitation(
  database: Executor,
  id: string,
  changes: {
    tokenHash?: string;
    message?: string | null;
    expiresAt?: Date;
    invitedBy?: string;
  },
): Promise<void> {
  await database
    .updateTable("team_invitations")
    .set({
      ...(changes.tokenHash !== undefined
        ? { token_hash: changes.tokenHash }
        : {}),
      ...(changes.message !== undefined ? { message: changes.message } : {}),
      ...(changes.expiresAt ? { expires_at: changes.expiresAt } : {}),
      ...(changes.invitedBy ? { invited_by: changes.invitedBy } : {}),
      updated_at: new Date(),
    })
    .where("id", "=", id)
    .execute();
}

export async function replaceInvitationRoles(
  database: Executor,
  invitationId: string,
  roleIds: readonly string[],
): Promise<void> {
  await database
    .deleteFrom("team_invitation_roles")
    .where("invitation_id", "=", invitationId)
    .execute();
  if (roleIds.length === 0) return;
  await database
    .insertInto("team_invitation_roles")
    .values(
      roleIds.map((roleId) => ({
        invitation_id: invitationId,
        role_id: roleId,
      })),
    )
    .execute();
}

export async function listInvitationRoleIds(
  database: Executor,
  invitationId: string,
): Promise<string[]> {
  const rows = await database
    .selectFrom("team_invitation_roles")
    .select("role_id")
    .where("invitation_id", "=", invitationId)
    .execute();
  return rows.map((row) => row.role_id);
}

export async function markRevoked(
  database: Executor,
  id: string,
): Promise<void> {
  await database
    .updateTable("team_invitations")
    .set({ revoked_at: new Date(), updated_at: new Date() })
    .where("id", "=", id)
    .where(isOpen)
    .execute();
}

export async function markAccepted(
  database: Executor,
  id: string,
  userId: string,
): Promise<void> {
  await database
    .updateTable("team_invitations")
    .set({
      accepted_at: new Date(),
      accepted_user_id: userId,
      updated_at: new Date(),
    })
    .where("id", "=", id)
    .execute();
}

export async function recordSent(
  database: Executor,
  id: string,
): Promise<void> {
  await database
    .updateTable("team_invitations")
    .set({
      last_sent_at: new Date(),
      send_count: sql`send_count + 1`,
    })
    .where("id", "=", id)
    .execute();
}

export interface InvitationCursor {
  createdAt: Date;
  id: string;
}

export type InvitationStatusFilter =
  "all" | "pending" | "accepted" | "expired" | "revoked";

/** Invite-link rows only; add-by-email rows show on the Members tab. */
export async function listInvites(
  database: Executor,
  options: {
    limit: number;
    status: InvitationStatusFilter;
    cursor?: InvitationCursor;
  },
): Promise<InvitationRow[]> {
  let query = database
    .selectFrom("team_invitations")
    .select(invitationColumns)
    .where("kind", "=", "invite");

  switch (options.status) {
    case "pending":
      query = query.where(isOpen).where("expires_at", ">", sql<Date>`now()`);
      break;
    case "expired":
      query = query.where(isOpen).where("expires_at", "<=", sql<Date>`now()`);
      break;
    case "accepted":
      query = query.where("accepted_at", "is not", null);
      break;
    case "revoked":
      query = query.where("revoked_at", "is not", null);
      break;
    case "all":
      break;
  }

  if (options.cursor) {
    query = query.where(
      sql<SqlBool>`(created_at, id) < (${options.cursor.createdAt}, ${options.cursor.id}::uuid)`,
    );
  }

  return await query
    .orderBy("created_at", "desc")
    .orderBy("id", "desc")
    .limit(options.limit)
    .execute();
}

export async function findVerifiedUserByEmail(
  database: Executor,
  email: string,
) {
  return await database
    .selectFrom("users")
    .select(["id", "email", "email_verified_at"])
    // Stored lower-cased (see the 2026-10-13 migration), like `email` here.
    .where("email", "=", email)
    .where("is_deleted", "=", false)
    .where("email_verified_at", "is not", null)
    .executeTakeFirst();
}

export async function findUserEmail(database: Executor, userId: string) {
  return await database
    .selectFrom("users")
    .select(["email", "email_verified_at"])
    .where("id", "=", userId)
    .where("is_deleted", "=", false)
    .executeTakeFirst();
}

export async function listRolesForInvitations(
  database: Executor,
  invitationIds: readonly string[],
) {
  if (invitationIds.length === 0) return [];
  return await database
    .selectFrom("team_invitation_roles as tir")
    .innerJoin("roles as r", "r.id", "tir.role_id")
    .select(["tir.invitation_id", "r.id", "r.name", "r.is_system"])
    .where("tir.invitation_id", "in", invitationIds)
    .orderBy("r.name")
    .execute();
}

export async function findUserNames(
  database: Executor,
  userIds: readonly string[],
): Promise<Map<string, string>> {
  if (userIds.length === 0) return new Map();
  const rows = await database
    .selectFrom("users")
    .select(["id", "display_name"])
    .where("id", "in", userIds)
    .execute();
  return new Map(rows.map((row) => [row.id, row.display_name]));
}
