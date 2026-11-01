import type {
  AcceptInvitationResponse,
  InvitationPreview,
} from "@veolms/contracts";
import type { Database } from "@veolms/database";
import type { FastifyBaseLogger } from "fastify";
import type { Kysely } from "kysely";
import { AppError } from "../../../lib/errors.ts";
import { createAcademyBrandService } from "../../academy/academy-brand.service.ts";
import { evictCachedUserSessions } from "../../auth/index.ts";
import { publishTeamEvent } from "../shared/team.events.ts";
import {
  grantTeamRoles,
  hashInvitationToken,
  invitationStatus,
  maskEmail,
} from "./invitation-token.ts";
import * as repository from "./invitations.repository.ts";

/**
 * Unknown, expired and revoked links all answer the same, so nobody can
 * probe which addresses were invited.
 */
function invalidInvite(): AppError {
  return new AppError(
    404,
    "INVITE_INVALID",
    "This invitation link is not valid any more. Ask for a new invitation.",
  );
}

/** The invite link (public preview and accept) and the claim on sign-in. */
export function createInvitationLinksService({
  database,
}: {
  database: Kysely<Database>;
}) {
  const brandService = createAcademyBrandService({ database });

  async function preview(token: string): Promise<InvitationPreview> {
    const row = await repository.findByTokenHash(
      database,
      hashInvitationToken(token),
    );
    if (!row) throw invalidInvite();
    const status = invitationStatus(row);
    if (status === "accepted") {
      throw new AppError(
        410,
        "INVITE_ALREADY_USED",
        "This invitation has already been accepted.",
      );
    }
    if (status !== "pending") throw invalidInvite();

    const [brand, roles, names] = await Promise.all([
      brandService.getBrand(),
      repository.listRolesForInvitations(database, [row.id]),
      repository.findUserNames(
        database,
        row.invited_by ? [row.invited_by] : [],
      ),
    ]);
    return {
      academyName: brand.name,
      invitedByName: row.invited_by
        ? (names.get(row.invited_by) ?? null)
        : null,
      emailHint: maskEmail(row.email),
      roles: roles.map((role) => role.name),
      message: row.message,
      expiresAt: row.expires_at.toISOString(),
    };
  }

  async function accept(
    userId: string,
    token: string,
  ): Promise<AcceptInvitationResponse> {
    const result = await database.transaction().execute(async (trx) => {
      const row = await repository.findByTokenHash(
        trx,
        hashInvitationToken(token),
        { lock: true },
      );
      if (!row) throw invalidInvite();

      const status = invitationStatus(row);
      if (status === "accepted") {
        if (row.accepted_user_id !== userId) {
          throw new AppError(
            410,
            "INVITE_ALREADY_USED",
            "This invitation has already been accepted.",
          );
        }
        // Accepting twice as the same person changes nothing.
        return { row, changed: false };
      }
      if (status !== "pending") throw invalidInvite();

      const user = await repository.findUserEmail(trx, userId);
      if (!user?.email || !user.email_verified_at || user.email !== row.email) {
        throw new AppError(
          403,
          "INVITE_EMAIL_MISMATCH",
          "This invitation is for a different email address. Sign in with the address it was sent to.",
        );
      }

      const roleIds = await repository.listInvitationRoleIds(trx, row.id);
      await grantTeamRoles(trx, userId, roleIds, row.invited_by);
      await repository.markAccepted(trx, row.id, userId);
      await publishTeamEvent(trx, "team.member.joined", {
        actorUserId: userId,
        userId,
        invitationId: row.id,
        via: "invite",
        roleIds,
      });
      return { row, changed: true };
    });

    if (result.changed) evictCachedUserSessions(userId);
    const roles = await repository.listRolesForInvitations(database, [
      result.row.id,
    ]);
    return {
      roles: roles.map((role) => ({
        id: role.id,
        name: role.name,
        isSystem: role.is_system,
      })),
    };
  }

  /**
   * Turns every open add-by-email entry for this verified address into
   * role grants. Called on each sign-in; one indexed lookup when there is
   * nothing to claim. Returns how many entries were claimed.
   */
  async function claimPendingTeamAccess(
    executor: Kysely<Database>,
    user: { id: string; email: string },
  ): Promise<number> {
    const email = user.email.toLowerCase();
    return await executor.transaction().execute(async (trx) => {
      const rows = await repository.lockClaimable(trx, email);
      for (const row of rows) {
        const roleIds = await repository.listInvitationRoleIds(trx, row.id);
        await grantTeamRoles(trx, user.id, roleIds, row.invited_by);
        await repository.markAccepted(trx, row.id, user.id);
        await publishTeamEvent(trx, "team.member.joined", {
          actorUserId: user.id,
          userId: user.id,
          invitationId: row.id,
          via: "preapproved",
          roleIds,
        });
      }
      return rows.length;
    });
  }

  return { preview, accept, claimPendingTeamAccess };
}

export type InvitationLinksService = ReturnType<
  typeof createInvitationLinksService
>;

/** The hook auth calls on sign-in; a failure is logged, never blocks it. */
export function createSignInClaim(
  links: InvitationLinksService,
  log: FastifyBaseLogger,
) {
  return async (
    database: Kysely<Database>,
    user: { id: string; email: string },
  ): Promise<number> => {
    try {
      return await links.claimPendingTeamAccess(database, user);
    } catch (error) {
      log.error(
        { err: error, userId: user.id },
        "Claiming team access on sign-in failed",
      );
      return 0;
    }
  };
}
