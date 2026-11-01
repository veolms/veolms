import type { Database, Json } from "@veolms/database";
import type { Transaction } from "kysely";
import { createOutboxService } from "../../../events/outbox.service.ts";

/**
 * Every team change writes one outbox event in the same transaction, for the
 * audit log to come. The notification worker skips `team.*` events.
 */
export type TeamEventType =
  | "team.role.created"
  | "team.role.updated"
  | "team.role.deleted"
  | "team.member.roles_changed"
  | "team.member.removed"
  | "team.invited"
  | "team.invitation.updated"
  | "team.invitation.revoked"
  | "team.member.joined";

const outbox = createOutboxService();

export async function publishTeamEvent(
  transaction: Transaction<Database>,
  type: TeamEventType,
  payload: { actorUserId: string | null } & Record<string, Json>,
): Promise<void> {
  await outbox.publish(transaction, {
    type,
    version: 1,
    dedupeKey: `${type}:${crypto.randomUUID()}`,
    occurredAt: new Date(),
    payload,
  });
}
