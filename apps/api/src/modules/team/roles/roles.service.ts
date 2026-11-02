import {
  withImpliedPermissions,
  type Permission,
  type TeamRole,
  type TeamRoleListResponse,
  type TeamRoleUpsertRequest,
} from "@veolms/contracts";
import type { Database } from "@veolms/database";
import type { Kysely } from "kysely";
import { AppError } from "../../../lib/errors.ts";
import { cacheTags, invalidateCache } from "@veolms/api-core";
import { publishTeamEvent } from "../shared/team.events.ts";
import * as teamRepository from "../shared/team.repository.ts";
import {
  assertCanGrantPermissions,
  assertDeletableRole,
  assertEditableRole,
  assertNoSelfLockout,
  assertRoleUnused,
  isReservedRoleName,
} from "../shared/team.rules.ts";
import * as repository from "./roles.repository.ts";

export const CUSTOM_ROLES_FEATURE = "team_custom_roles";

function toTeamRole(row: repository.RoleRow): TeamRole {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    isSystem: row.is_system,
    permissions: row.permissions as Permission[],
    memberCount: row.member_count,
  };
}

export function createTeamRolesService({
  database,
}: {
  database: Kysely<Database>;
}) {
  async function listRoles(): Promise<TeamRoleListResponse> {
    const [rows, customRolesEnabled] = await Promise.all([
      repository.listTeamRoles(database),
      teamRepository.isFeatureEnabled(database, CUSTOM_ROLES_FEATURE),
    ]);
    return { roles: rows.map(toTeamRole), customRolesEnabled };
  }

  async function getRole(roleId: string): Promise<TeamRole> {
    const [row] = await repository.listTeamRoles(database, roleId);
    if (!row) throw new AppError(404, "ROLE_NOT_FOUND", "Role not found.");
    return toTeamRole(row);
  }

  async function assertNameAvailable(
    executor: Kysely<Database>,
    name: string,
    exceptRoleId?: string,
  ): Promise<void> {
    if (
      isReservedRoleName(name) ||
      (await repository.isRoleNameTaken(executor, name, exceptRoleId))
    ) {
      throw new AppError(
        409,
        "ROLE_NAME_TAKEN",
        "A role with this name already exists.",
      );
    }
  }

  async function createRole(
    actorUserId: string,
    input: TeamRoleUpsertRequest,
  ): Promise<TeamRole> {
    const permissions = [...withImpliedPermissions(input.permissions)];
    const roleId = crypto.randomUUID();

    await database.transaction().execute(async (trx) => {
      const actor = await teamRepository.loadActor(trx, actorUserId);
      assertCanGrantPermissions(actor, permissions);
      await assertNameAvailable(trx, input.name);

      await repository.insertRole(trx, {
        id: roleId,
        name: input.name.trim(),
        description: input.description?.trim() || null,
      });
      await repository.replaceRolePermissions(trx, roleId, permissions);
      await publishTeamEvent(trx, "team.role.created", {
        actorUserId,
        roleId,
        name: input.name.trim(),
        permissions,
      });
    });

    invalidateCache([cacheTags.rbac]);
    return await getRole(roleId);
  }

  async function updateRole(
    actorUserId: string,
    roleId: string,
    input: TeamRoleUpsertRequest,
  ): Promise<TeamRole> {
    const permissions = [...withImpliedPermissions(input.permissions)];

    await database.transaction().execute(async (trx) => {
      const [role] = await teamRepository.findRolesByIds(trx, [roleId]);
      if (!role || role.name === "student") {
        throw new AppError(404, "ROLE_NOT_FOUND", "Role not found.");
      }
      const actor = await teamRepository.loadActor(trx, actorUserId);
      assertEditableRole(actor, role);

      // Both what the role grants now and what it will grant: changing a
      // role is giving out (or taking back) everything in it.
      assertCanGrantPermissions(actor, [...role.permissions, ...permissions]);
      // A built-in role keeps its name: code and other roles refer to it.
      const name = role.isSystem ? role.name : input.name.trim();
      if (!role.isSystem) await assertNameAvailable(trx, name, roleId);

      const actorRoleIds = await teamRepository.listTeamRoleIds(
        trx,
        actorUserId,
      );
      if (actorRoleIds.includes(roleId)) {
        const otherRoles = await teamRepository.findRolesByIds(
          trx,
          actorRoleIds.filter((id) => id !== roleId),
        );
        assertNoSelfLockout(
          actor.permissions,
          new Set([
            ...otherRoles.flatMap((other) => other.permissions),
            ...permissions,
          ]),
        );
      }

      await repository.updateRole(trx, roleId, {
        name,
        description: input.description?.trim() || null,
      });
      await repository.replaceRolePermissions(trx, roleId, permissions);
      await publishTeamEvent(trx, "team.role.updated", {
        actorUserId,
        roleId,
        name,
        permissionsBefore: [...role.permissions],
        permissionsAfter: permissions,
      });
    });

    // Cached permission rules and sign-ins (which carry role names) are
    // dropped in every process.
    invalidateCache([cacheTags.rbac]);
    return await getRole(roleId);
  }

  async function deleteRole(
    actorUserId: string,
    roleId: string,
  ): Promise<void> {
    await database.transaction().execute(async (trx) => {
      const [role] = await teamRepository.findRolesByIds(trx, [roleId]);
      if (!role || role.name === "student") {
        throw new AppError(404, "ROLE_NOT_FOUND", "Role not found.");
      }
      assertDeletableRole(role);

      const actor = await teamRepository.loadActor(trx, actorUserId);
      assertCanGrantPermissions(actor, role.permissions);
      assertRoleUnused(await repository.countRoleUsage(trx, roleId));

      await repository.deleteRole(trx, roleId);
      await publishTeamEvent(trx, "team.role.deleted", {
        actorUserId,
        roleId,
        name: role.name,
      });
    });
    invalidateCache([cacheTags.rbac]);
  }

  return { listRoles, getRole, createRole, updateRole, deleteRole };
}

export type TeamRolesService = ReturnType<typeof createTeamRolesService>;
