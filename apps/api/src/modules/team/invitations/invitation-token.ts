import { createHash, randomBytes } from "node:crypto";
import type { TeamInvitation } from "@veolms/contracts";
import { grantPlatformRole, type Database } from "@veolms/database";
import type { Transaction } from "kysely";
import type { InvitationRow } from "./invitations.repository.ts";

/** 32 random bytes for the link; only the sha256 is stored. */
export function newInvitationToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashInvitationToken(token) };
}

export function hashInvitationToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function invitationStatus(
  row: Pick<InvitationRow, "accepted_at" | "revoked_at" | "expires_at">,
  now = new Date(),
): TeamInvitation["status"] {
  if (row.accepted_at) return "accepted";
  if (row.revoked_at) return "revoked";
  return row.expires_at <= now ? "expired" : "pending";
}

/** "ni***@getgtm.ai": enough for the invitee to recognise, no more. */
export function maskEmail(email: string): string {
  const [local = "", domain = ""] = email.split("@");
  const shown = local.slice(0, Math.min(2, Math.max(1, local.length - 1)));
  return `${shown}***@${domain}`;
}

export async function grantTeamRoles(
  trx: Transaction<Database>,
  userId: string,
  roleIds: readonly string[],
  createdBy: string | null,
): Promise<void> {
  for (const roleId of roleIds) {
    await grantPlatformRole(trx, { userId, roleId, createdBy });
  }
}
