import type {
  TeamMember,
  TeamMemberListQuery,
  TeamMemberListResponse,
  TeamMemberRole,
  TeamUserSearchResponse,
} from "@veolms/contracts";
import {
  grantPlatformRole,
  revokePlatformRole,
  type Database,
} from "@veolms/database";
import type { Kysely } from "kysely";
import { AppError } from "../../../lib/errors.ts";
import { evictCachedUserSessions, STUDENT_ROLE } from "../../auth/index.ts";
import type { TeamMailer } from "../shared/team.mailer.ts";
import { publishTeamEvent } from "../shared/team.events.ts";
import * as teamRepository from "../shared/team.repository.ts";
import {
  assertCanHandleRoles,
  assertCanRemoveMembers,
  assertKeepsAnAdmin,
  assertNoSelfLockout,
  diffRoleIds,
  isAdminRole,
} from "../shared/team.rules.ts";
import * as repository from "./members.repository.ts";

const USER_SEARCH_LIMIT = 10;

function encodeCursor(row: repository.MemberRow): string {
  return Buffer.from(
    `${row.joined_at.toISOString()}|${row.user_id}`,
    "utf8",
  ).toString("base64url");
}

function decodeCursor(cursor: string): repository.MemberCursor {
  const [joinedAt, userId] = Buffer.from(cursor, "base64url")
    .toString("utf8")
    .split("|");
  const date = new Date(joinedAt ?? "");
  if (!userId || Number.isNaN(date.getTime())) {
    throw new AppError(400, "INVALID_CURSOR", "The page cursor is not valid.");
  }
  return { joinedAt: date, userId };
}

function toRole(row: {
  id: string;
  name: string;
  is_system: boolean;
}): TeamMemberRole {
  return { id: row.id, name: row.name, isSystem: row.is_system };
}

function groupBy<T>(rows: readonly T[], key: (row: T) => string) {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const id = key(row);
    groups.set(id, [...(groups.get(id) ?? []), row]);
  }
  return groups;
}

export function createTeamMembersService({
  database,
  mailer,
}: {
  database: Kysely<Database>;
  mailer: TeamMailer;
}) {
  async function listMembers(
    query: TeamMemberListQuery,
  ): Promise<TeamMemberListResponse> {
    const firstPage = !query.cursor;
    const teamRoleIds = await repository.listTeamRoleIds(database);
    const [rows, awaiting, totalCount] = await Promise.all([
      repository.listMembers(database, {
        teamRoleIds,
        limit: query.limit + 1,
        search: query.search,
        cursor: query.cursor ? decodeCursor(query.cursor) : undefined,
      }),
      firstPage
        ? repository.listAwaitingSignIn(database, query.search)
        : Promise.resolve([]),
      firstPage
        ? repository.countMembers(database, teamRoleIds, query.search)
        : Promise.resolve(undefined),
    ]);

    const page = rows.slice(0, query.limit);
    const [memberRoles, awaitingRoles] = await Promise.all([
      repository.listMemberRoles(
        database,
        page.map((row) => row.user_id),
      ),
      repository.listInvitationRoles(
        database,
        awaiting.map((row) => row.id),
      ),
    ]);
    const rolesByUser = groupBy(memberRoles, (row) => row.user_id);
    const rolesByInvitation = groupBy(
      awaitingRoles,
      (row) => row.invitation_id,
    );

    // People waiting for their first sign-in lead the first page.
    const members: TeamMember[] = [
      ...awaiting.map((row) => ({
        status: "awaiting_sign_in" as const,
        userId: null,
        invitationId: row.id,
        name: null,
        username: null,
        email: row.email,
        avatarUrl: null,
        roles: (rolesByInvitation.get(row.id) ?? []).map(toRole),
        joinedAt: null,
        lastActiveAt: null,
        expiresAt: row.expires_at.toISOString(),
      })),
      ...page.map((row) => ({
        status: "active" as const,
        userId: row.user_id,
        invitationId: null,
        name: row.display_name,
        username: row.username,
        email: row.email ?? "",
        avatarUrl: row.avatar_data_url,
        roles: (rolesByUser.get(row.user_id) ?? []).map(toRole),
        joinedAt: row.joined_at.toISOString(),
        lastActiveAt: row.last_active_at?.toISOString() ?? null,
        expiresAt: null,
      })),
    ];

    const last = page.at(-1);
    return {
      members,
      nextCursor: rows.length > query.limit && last ? encodeCursor(last) : null,
      ...(totalCount === undefined
        ? {}
        : { totalCount: totalCount + awaiting.length }),
    };
  }

  async function searchUsers(q: string): Promise<TeamUserSearchResponse> {
    const users = await repository.searchUsers(database, q, USER_SEARCH_LIMIT);
    const roles = groupBy(
      await repository.listMemberRoles(
        database,
        users.map((user) => user.id),
      ),
      (row) => row.user_id,
    );
    return {
      users: users.map((user) => {
        const userRoles = (roles.get(user.id) ?? []).map(toRole);
        return {
          userId: user.id,
          name: user.display_name,
          username: user.username,
          email: user.email ?? "",
          avatarUrl: user.avatar_data_url,
          isMember: userRoles.length > 0,
          roles: userRoles,
        };
      }),
    };
  }

  /**
   * Full replace of a person's team roles (student is left alone). Promotes
   * someone not yet on the team; an empty list takes them off it.
   */
  async function setMemberRoles(
    actorUserId: string,
    userId: string,
    roleIds: readonly string[],
  ): Promise<{ roles: TeamMemberRole[] }> {
    const nextRoleIds = [...new Set(roleIds)];

    const outcome = await database.transaction().execute(async (trx) => {
      const user = await repository.findActiveUser(trx, userId);
      if (!user) {
        throw new AppError(404, "USER_NOT_FOUND", "User not found.");
      }

      const nextRoles = await teamRepository.findRolesByIds(trx, nextRoleIds);
      if (
        nextRoles.length !== nextRoleIds.length ||
        nextRoles.some((role) => role.name === STUDENT_ROLE)
      ) {
        throw new AppError(
          400,
          "INVALID_ROLE",
          "One of these roles does not exist or is not a team role.",
        );
      }

      const currentRoleIds = await teamRepository.listTeamRoleIds(trx, userId);
      const { added, removed } = diffRoleIds(currentRoleIds, nextRoleIds);
      if (added.length === 0 && removed.length === 0) {
        return { changed: false, joined: false, nextRoles };
      }

      const removedRoles = await teamRepository.findRolesByIds(trx, removed);
      const actor = await teamRepository.loadActor(trx, actorUserId);
      if (nextRoleIds.length === 0) assertCanRemoveMembers(actor);
      assertCanHandleRoles(actor, [
        ...nextRoles.filter((role) => added.includes(role.id)),
        ...removedRoles,
      ]);

      if (removedRoles.some(isAdminRole)) {
        const admins = await teamRepository.lockAdminHolders(trx);
        assertKeepsAnAdmin(admins.filter((id) => id !== userId).length);
      }

      if (userId === actorUserId) {
        assertNoSelfLockout(
          actor.permissions,
          new Set(nextRoles.flatMap((role) => role.permissions)),
        );
      }

      for (const roleId of removed) {
        await revokePlatformRole(trx, { userId, roleId });
      }
      for (const roleId of added) {
        await grantPlatformRole(trx, {
          userId,
          roleId,
          createdBy: actorUserId,
        });
      }

      // Off the team with nothing left: they stay a learner.
      if (
        nextRoleIds.length === 0 &&
        (await repository.countPlatformRoles(trx, userId)) === 0
      ) {
        const studentRoleId = await teamRepository.findRoleIdByName(
          trx,
          STUDENT_ROLE,
        );
        if (studentRoleId) {
          await grantPlatformRole(trx, { userId, roleId: studentRoleId });
        }
      }

      await publishTeamEvent(
        trx,
        nextRoleIds.length === 0
          ? "team.member.removed"
          : "team.member.roles_changed",
        {
          actorUserId,
          userId,
          rolesAdded: added,
          rolesRemoved: removed,
        },
      );

      return {
        changed: true,
        joined: currentRoleIds.length === 0,
        nextRoles,
        email: user.email,
      };
    });

    if (outcome.changed) {
      evictCachedUserSessions(userId);
      if (outcome.joined && outcome.email) {
        await mailer.memberAdded({
          to: outcome.email,
          addedByUserId: actorUserId,
          roleNames: outcome.nextRoles.map((role) => role.name),
        });
      }
    }

    return {
      roles: outcome.nextRoles
        .map((role) => ({
          id: role.id,
          name: role.name,
          isSystem: role.isSystem,
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    };
  }

  return { listMembers, searchUsers, setMemberRoles };
}

export type TeamMembersService = ReturnType<typeof createTeamMembersService>;
