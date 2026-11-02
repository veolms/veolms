import {
  TEAM_INVITATION_TTL_DAYS,
  type CreateTeamInvitationsRequest,
  type CreateTeamInvitationsResponse,
  type TeamInvitation,
  type TeamInvitationListQuery,
  type TeamInvitationListResponse,
  type TeamInvitationOutcome,
} from "@veolms/contracts";
import type { Database } from "@veolms/database";
import type { Kysely, Transaction } from "kysely";
import { AppError } from "../../../lib/errors.ts";
import { evictCachedUserSessions, STUDENT_ROLE } from "../../auth/index.ts";
import { publishTeamEvent } from "../shared/team.events.ts";
import type { TeamMailer } from "../shared/team.mailer.ts";
import * as teamRepository from "../shared/team.repository.ts";
import {
  assertCanHandleRoles,
  isAdmin,
  type RoleFacts,
} from "../shared/team.rules.ts";
import * as repository from "./invitations.repository.ts";
import {
  grantTeamRoles,
  invitationStatus,
  newInvitationToken,
} from "./invitation-token.ts";

const DAY_MS = 24 * 60 * 60 * 1000;
/** Resend waits this long after the last send, and stops after this many. */
const RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_SENDS = 10;

function expiresFromNow(): Date {
  return new Date(Date.now() + TEAM_INVITATION_TTL_DAYS * DAY_MS);
}

type PendingEmail =
  | {
      kind: "invite";
      to: string;
      token: string;
      invitationId: string;
      message: string | null;
    }
  | {
      kind: "preapproved";
      to: string;
      invitationId: string;
      message: string | null;
    }
  | { kind: "member_added"; to: string; userId: string };

export function createTeamInvitationsService({
  database,
  mailer,
}: {
  database: Kysely<Database>;
  mailer: TeamMailer;
}) {
  async function loadTeamRoles(
    executor: Kysely<Database>,
    roleIds: readonly string[],
  ): Promise<RoleFacts[]> {
    const unique = [...new Set(roleIds)];
    const roles = await teamRepository.findRolesByIds(executor, unique);
    if (
      roles.length !== unique.length ||
      roles.some((role) => role.name === STUDENT_ROLE)
    ) {
      throw new AppError(
        400,
        "INVALID_ROLE",
        "One of these roles does not exist or is not a team role.",
      );
    }
    return roles;
  }

  async function sendPending(
    pending: PendingEmail,
    invitedBy: string,
    roleNames: string[],
  ): Promise<boolean> {
    let sent: boolean;
    if (pending.kind === "member_added") {
      sent = await mailer.memberAdded({
        to: pending.to,
        addedByUserId: invitedBy,
        roleNames,
      });
    } else if (pending.kind === "invite") {
      sent = await mailer.invitation({
        to: pending.to,
        invitedByUserId: invitedBy,
        roleNames,
        message: pending.message,
        token: pending.token,
      });
    } else {
      sent = await mailer.preapproved({
        to: pending.to,
        addedByUserId: invitedBy,
        roleNames,
        message: pending.message,
      });
    }
    if (sent && pending.kind !== "member_added") {
      await repository.recordSent(database, pending.invitationId);
    }
    return sent;
  }

  /** One email: promote, update the open row, or write a new one. */
  async function inviteOne(
    actorUserId: string,
    email: string,
    roles: RoleFacts[],
    input: CreateTeamInvitationsRequest,
    /** Holds role.assign: an existing account is promoted at once. */
    assignsDirectly: boolean,
  ): Promise<{
    outcome: TeamInvitationOutcome;
    invitationId: string | null;
    userId: string | null;
    pending: PendingEmail | null;
  }> {
    const roleIds = roles.map((role) => role.id);
    const message = input.message?.trim() || null;

    return await database.transaction().execute(async (trx) => {
      // An address that already belongs to a verified account is a plain
      // promote: nothing to wait for. Without role.assign it stays an
      // invitation the person accepts (or claims at their next sign-in).
      const user = assignsDirectly
        ? await repository.findVerifiedUserByEmail(trx, email)
        : undefined;
      if (user) {
        const held = new Set(
          await teamRepository.listTeamRoleIds(trx, user.id),
        );
        const missing = roleIds.filter((id) => !held.has(id));
        if (missing.length === 0) {
          return {
            outcome: "already_member" as const,
            invitationId: null,
            userId: user.id,
            pending: null,
          };
        }
        await grantTeamRoles(trx, user.id, missing, actorUserId);
        await publishTeamEvent(trx, "team.member.roles_changed", {
          actorUserId,
          userId: user.id,
          rolesAdded: missing,
          rolesRemoved: [],
        });
        return {
          outcome: "promoted" as const,
          invitationId: null,
          userId: user.id,
          pending:
            held.size === 0
              ? { kind: "member_added" as const, to: email, userId: user.id }
              : null,
        };
      }

      const open = await repository.findOpenByEmail(trx, email);
      const reusable =
        open &&
        open.kind === input.kind &&
        invitationStatus(open) === "pending";
      if (open && !reusable) {
        // Expired, or the other kind: close it so the new row is the one.
        await repository.markRevoked(trx, open.id);
      }

      const sendsEmail = input.kind === "invite" || input.notify;
      const { token, tokenHash } = newInvitationToken();
      let invitationId: string;

      if (reusable) {
        invitationId = open.id;
        await repository.updateInvitation(trx, open.id, {
          message,
          expiresAt: expiresFromNow(),
          invitedBy: actorUserId,
          ...(input.kind === "invite" ? { tokenHash } : {}),
        });
        await publishTeamEvent(trx, "team.invitation.updated", {
          actorUserId,
          invitationId,
          email,
          roleIds,
        });
      } else {
        invitationId = crypto.randomUUID();
        await repository.insertInvitation(trx, {
          id: invitationId,
          email,
          kind: input.kind,
          tokenHash: input.kind === "invite" ? tokenHash : null,
          invitedBy: actorUserId,
          message,
          expiresAt: expiresFromNow(),
        });
        await publishTeamEvent(trx, "team.invited", {
          actorUserId,
          invitationId,
          email,
          kind: input.kind,
          roleIds,
        });
      }
      await repository.replaceInvitationRoles(trx, invitationId, roleIds);

      const pending: PendingEmail | null = !sendsEmail
        ? null
        : input.kind === "invite"
          ? { kind: "invite", to: email, token, invitationId, message }
          : { kind: "preapproved", to: email, invitationId, message };

      return {
        outcome: reusable
          ? ("updated" as const)
          : input.kind === "invite"
            ? ("invited" as const)
            : ("preapproved" as const),
        invitationId,
        userId: null,
        pending,
      };
    });
  }

  async function createInvitations(
    actorUserId: string,
    input: CreateTeamInvitationsRequest,
  ): Promise<CreateTeamInvitationsResponse> {
    const roles = await loadTeamRoles(database, input.roleIds);
    const actor = await teamRepository.loadActor(database, actorUserId);
    assertCanHandleRoles(actor, roles);
    const roleNames = roles.map((role) => role.name);
    const assignsDirectly =
      isAdmin(actor) || actor.permissions.has("role.assign");

    const results: CreateTeamInvitationsResponse["results"] = [];
    for (const email of [...new Set(input.emails)]) {
      try {
        const result = await inviteOne(
          actorUserId,
          email,
          roles,
          input,
          assignsDirectly,
        );
        if (result.userId && result.outcome === "promoted") {
          evictCachedUserSessions(result.userId);
        }
        const emailSent = result.pending
          ? await sendPending(result.pending, actorUserId, roleNames)
          : false;
        results.push({
          email,
          outcome: result.outcome,
          invitationId: result.invitationId,
          userId: result.userId,
          error: null,
          emailSent,
        });
      } catch (error) {
        results.push({
          email,
          outcome: "failed",
          invitationId: null,
          userId: null,
          error:
            error instanceof AppError
              ? error.message
              : "Could not add this email. Try again.",
          emailSent: false,
        });
      }
    }
    return { results };
  }

  async function presentInvitations(
    rows: repository.InvitationRow[],
  ): Promise<TeamInvitation[]> {
    const ids = rows.map((row) => row.id);
    const [roleRows, names] = await Promise.all([
      repository.listRolesForInvitations(database, ids),
      repository.findUserNames(
        database,
        rows.flatMap((row) => (row.invited_by ? [row.invited_by] : [])),
      ),
    ]);
    const now = new Date();
    return rows.map((row) => ({
      id: row.id,
      email: row.email,
      kind: row.kind,
      status: invitationStatus(row, now),
      roles: roleRows
        .filter((role) => role.invitation_id === row.id)
        .map((role) => ({
          id: role.id,
          name: role.name,
          isSystem: role.is_system,
        })),
      message: row.message,
      invitedBy: row.invited_by
        ? { userId: row.invited_by, name: names.get(row.invited_by) ?? null }
        : null,
      expiresAt: row.expires_at.toISOString(),
      acceptedAt: row.accepted_at?.toISOString() ?? null,
      revokedAt: row.revoked_at?.toISOString() ?? null,
      lastSentAt: row.last_sent_at?.toISOString() ?? null,
      createdAt: row.created_at.toISOString(),
    }));
  }

  async function listInvitations(
    query: TeamInvitationListQuery,
  ): Promise<TeamInvitationListResponse> {
    let cursor: repository.InvitationCursor | undefined;
    if (query.cursor) {
      const [createdAt, id] = Buffer.from(query.cursor, "base64url")
        .toString("utf8")
        .split("|");
      const date = new Date(createdAt ?? "");
      if (!id || Number.isNaN(date.getTime())) {
        throw new AppError(
          400,
          "INVALID_CURSOR",
          "The page cursor is not valid.",
        );
      }
      cursor = { createdAt: date, id };
    }
    const rows = await repository.listInvites(database, {
      limit: query.limit + 1,
      status: query.status,
      cursor,
    });
    const page = rows.slice(0, query.limit);
    const last = page.at(-1);
    return {
      invitations: await presentInvitations(page),
      nextCursor:
        rows.length > query.limit && last
          ? Buffer.from(
              `${last.created_at.toISOString()}|${last.id}`,
              "utf8",
            ).toString("base64url")
          : null,
    };
  }

  async function lockOpenInvitation(
    trx: Transaction<Database>,
    invitationId: string,
  ): Promise<repository.InvitationRow> {
    const row = await repository.findById(trx, invitationId, { lock: true });
    if (!row) {
      throw new AppError(404, "INVITATION_NOT_FOUND", "Invitation not found.");
    }
    if (row.accepted_at || row.revoked_at) {
      throw new AppError(
        409,
        "INVITATION_CLOSED",
        "This invitation was already accepted or cancelled.",
      );
    }
    return row;
  }

  async function resendInvitation(
    actorUserId: string,
    invitationId: string,
  ): Promise<TeamInvitation> {
    const { row, roleNames, token } = await database
      .transaction()
      .execute(async (trx) => {
        const row = await lockOpenInvitation(trx, invitationId);
        if (
          row.last_sent_at &&
          Date.now() - row.last_sent_at.getTime() < RESEND_COOLDOWN_MS
        ) {
          throw new AppError(
            429,
            "RESEND_TOO_SOON",
            "This invitation was just sent. Wait a minute before sending it again.",
          );
        }
        if (row.send_count >= MAX_SENDS) {
          throw new AppError(
            429,
            "RESEND_LIMIT",
            "This invitation has been sent too many times. Cancel it and add the person again.",
          );
        }
        const roles = await teamRepository.findRolesByIds(
          trx,
          await repository.listInvitationRoleIds(trx, row.id),
        );
        const actor = await teamRepository.loadActor(trx, actorUserId);
        assertCanHandleRoles(actor, roles);

        // A fresh link: the old one stops working, and the week starts again.
        const { token, tokenHash } = newInvitationToken();
        await repository.updateInvitation(trx, row.id, {
          expiresAt: expiresFromNow(),
          ...(row.kind === "invite" ? { tokenHash } : {}),
        });
        return { row, roleNames: roles.map((role) => role.name), token };
      });

    const sent = await sendPending(
      row.kind === "invite"
        ? {
            kind: "invite",
            to: row.email,
            token,
            invitationId: row.id,
            message: row.message,
          }
        : {
            kind: "preapproved",
            to: row.email,
            invitationId: row.id,
            message: row.message,
          },
      actorUserId,
      roleNames,
    );
    if (!sent) {
      throw new AppError(
        502,
        "EMAIL_NOT_SENT",
        "The email could not be sent. Try again in a moment.",
      );
    }
    const [fresh] = await presentInvitations([
      (await repository.findById(database, row.id))!,
    ]);
    return fresh!;
  }

  async function updateInvitationRoles(
    actorUserId: string,
    invitationId: string,
    roleIds: readonly string[],
  ): Promise<TeamInvitation> {
    await database.transaction().execute(async (trx) => {
      const row = await lockOpenInvitation(trx, invitationId);
      const nextRoles = await loadTeamRoles(trx, roleIds);
      const currentRoles = await teamRepository.findRolesByIds(
        trx,
        await repository.listInvitationRoleIds(trx, row.id),
      );
      const actor = await teamRepository.loadActor(trx, actorUserId);
      assertCanHandleRoles(actor, [...currentRoles, ...nextRoles]);
      await repository.replaceInvitationRoles(
        trx,
        row.id,
        nextRoles.map((role) => role.id),
      );
      await publishTeamEvent(trx, "team.invitation.updated", {
        actorUserId,
        invitationId: row.id,
        email: row.email,
        roleIds: nextRoles.map((role) => role.id),
      });
    });
    const [fresh] = await presentInvitations([
      (await repository.findById(database, invitationId))!,
    ]);
    return fresh!;
  }

  async function revokeInvitation(
    actorUserId: string,
    invitationId: string,
  ): Promise<void> {
    await database.transaction().execute(async (trx) => {
      const row = await lockOpenInvitation(trx, invitationId);
      // Cancelling is taking back what the invitation would grant.
      const roles = await teamRepository.findRolesByIds(
        trx,
        await repository.listInvitationRoleIds(trx, row.id),
      );
      const actor = await teamRepository.loadActor(trx, actorUserId);
      assertCanHandleRoles(actor, roles);
      await repository.markRevoked(trx, row.id);
      await publishTeamEvent(trx, "team.invitation.revoked", {
        actorUserId,
        invitationId: row.id,
        email: row.email,
        kind: row.kind,
      });
    });
  }

  return {
    createInvitations,
    listInvitations,
    resendInvitation,
    updateInvitationRoles,
    revokeInvitation,
  };
}

export type TeamInvitationsService = ReturnType<
  typeof createTeamInvitationsService
>;
