import { sql, type Expression, type SqlBool } from "kysely";
import type { DatabaseExecutor as Executor } from "@veolms/database";
import { containsPattern } from "../../../lib/like-pattern.ts";
import { fuzzyMatchesAny } from "../../../lib/fuzzy-search.ts";

export interface MemberRow {
  user_id: string;
  username: string;
  display_name: string;
  email: string | null;
  avatar_data_url: string | null;
  joined_at: Date;
  last_active_at: Date | null;
}

export interface MemberRoleRow {
  user_id: string;
  id: string;
  name: string;
  is_system: boolean;
}

export interface AwaitingRow {
  id: string;
  email: string;
  expires_at: Date;
  created_at: Date;
}

export interface MemberCursor {
  joinedAt: Date;
  userId: string;
}

function userSearch(
  search: string | undefined,
): Expression<SqlBool> | undefined {
  if (!search) return undefined;
  const pattern = containsPattern(search);
  return sql<SqlBool>`(
    lower(u.display_name) like ${pattern}
    or lower(u.username) like ${pattern}
    or lower(coalesce(u.email, '')) like ${pattern}
    or ${fuzzyMatchesAny(search, [sql.ref("u.display_name"), sql.ref("u.username")])}
  )`;
}

/**
 * People holding at least one live platform role other than student,
 * newest first. `joined_at` is their earliest such grant.
 */
export async function listMembers(
  database: Executor,
  options: {
    /** Every role but student: matching them by id uses the role index. */
    teamRoleIds: readonly string[];
    limit: number;
    search?: string;
    cursor?: MemberCursor;
  },
): Promise<MemberRow[]> {
  const search = userSearch(options.search);
  let query = database
    .selectFrom("role_assignments as ra")
    .innerJoin("users as u", "u.id", "ra.user_id")
    .select([
      "u.id as user_id",
      "u.username",
      "u.display_name",
      "u.email",
      "u.avatar_data_url",
      sql<Date>`min(ra.created_at)`.as("joined_at"),
      sql<Date | null>`(
        select max(s.last_used_at) from sessions s where s.user_id = u.id
      )`.as("last_active_at"),
    ])
    .where("ra.scope_type", "=", "platform")
    .where(sql<SqlBool>`ra.role_id = any(${options.teamRoleIds}::uuid[])`)
    .where("u.is_deleted", "=", false)
    .where(sql<SqlBool>`(ra.expires_at is null or ra.expires_at > now())`)
    .groupBy("u.id");

  if (search) query = query.where(search);
  if (options.cursor) {
    query = query.having(
      sql<SqlBool>`(min(ra.created_at), u.id) < (${options.cursor.joinedAt}, ${options.cursor.userId}::uuid)`,
    );
  }

  return await query
    .orderBy(sql`min(ra.created_at)`, "desc")
    .orderBy("u.id", "desc")
    .limit(options.limit)
    .execute();
}

export async function countMembers(
  database: Executor,
  teamRoleIds: readonly string[],
  search?: string,
): Promise<number> {
  const condition = userSearch(search);
  let query = database
    .selectFrom("role_assignments as ra")
    .innerJoin("users as u", "u.id", "ra.user_id")
    .select(sql<number>`count(distinct u.id)::int`.as("total"))
    .where("ra.scope_type", "=", "platform")
    .where(sql<SqlBool>`ra.role_id = any(${teamRoleIds}::uuid[])`)
    .where("u.is_deleted", "=", false)
    .where(sql<SqlBool>`(ra.expires_at is null or ra.expires_at > now())`);
  if (condition) query = query.where(condition);
  const row = await query.executeTakeFirstOrThrow();
  return row.total;
}

/** Every role but student; the roles table holds a handful of rows. */
export async function listTeamRoleIds(database: Executor): Promise<string[]> {
  const rows = await database
    .selectFrom("roles")
    .select("id")
    .where("name", "<>", "student")
    .execute();
  return rows.map((row) => row.id);
}

/** Live platform roles (student left out) for each of the given users. */
export async function listMemberRoles(
  database: Executor,
  userIds: readonly string[],
): Promise<MemberRoleRow[]> {
  if (userIds.length === 0) return [];
  return await database
    .selectFrom("role_assignments as ra")
    .innerJoin("roles as r", "r.id", "ra.role_id")
    .select(["ra.user_id", "r.id", "r.name", "r.is_system"])
    .distinct()
    .where("ra.user_id", "in", userIds)
    .where("ra.scope_type", "=", "platform")
    .where("r.name", "<>", "student")
    .where(sql<SqlBool>`(ra.expires_at is null or ra.expires_at > now())`)
    .orderBy("r.name")
    .execute();
}

/** Open add-by-email entries, shown as members waiting for first sign-in. */
export async function listAwaitingSignIn(
  database: Executor,
  search?: string,
): Promise<AwaitingRow[]> {
  return await database
    .selectFrom("team_invitations")
    .select(["id", "email", "expires_at", "created_at"])
    .where("kind", "=", "preapproved")
    .where("accepted_at", "is", null)
    .where("revoked_at", "is", null)
    .where("expires_at", ">", sql<Date>`now()`)
    .$if(Boolean(search), (qb) =>
      qb.where(sql<SqlBool>`email like ${containsPattern(search!)}`),
    )
    .orderBy("created_at", "desc")
    .limit(200)
    .execute();
}

export async function listInvitationRoles(
  database: Executor,
  invitationIds: readonly string[],
): Promise<(MemberRoleRow & { invitation_id: string })[]> {
  if (invitationIds.length === 0) return [];
  const rows = await database
    .selectFrom("team_invitation_roles as tir")
    .innerJoin("roles as r", "r.id", "tir.role_id")
    .select(["tir.invitation_id", "r.id", "r.name", "r.is_system"])
    .where("tir.invitation_id", "in", invitationIds)
    .orderBy("r.name")
    .execute();
  return rows.map((row) => ({ ...row, user_id: "" }));
}

export async function searchUsers(
  database: Executor,
  q: string,
  limit: number,
) {
  return await database
    .selectFrom("users as u")
    .select([
      "u.id",
      "u.username",
      "u.display_name",
      "u.email",
      "u.avatar_data_url",
    ])
    .where("u.is_deleted", "=", false)
    .where(userSearch(q)!)
    .orderBy(sql`lower(coalesce(u.email, '')) = lower(${q})`, "desc")
    .orderBy("u.display_name")
    .limit(limit)
    .execute();
}

export async function findActiveUser(database: Executor, userId: string) {
  return await database
    .selectFrom("users")
    .select(["id", "username", "display_name", "email", "avatar_data_url"])
    .where("id", "=", userId)
    .where("is_deleted", "=", false)
    .executeTakeFirst();
}

export async function countPlatformRoles(
  database: Executor,
  userId: string,
): Promise<number> {
  const row = await database
    .selectFrom("role_assignments")
    .select(sql<number>`count(*)::int`.as("total"))
    .where("user_id", "=", userId)
    .where("scope_type", "=", "platform")
    .executeTakeFirstOrThrow();
  return row.total;
}

export async function findUserDisplayName(
  database: Executor,
  userId: string,
): Promise<string | null> {
  const row = await database
    .selectFrom("users")
    .select("display_name")
    .where("id", "=", userId)
    .executeTakeFirst();
  return row?.display_name ?? null;
}
