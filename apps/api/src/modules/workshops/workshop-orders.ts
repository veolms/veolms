import crypto from "node:crypto";

import type { Database, DatabaseExecutor } from "@veolms/database";
import type { Kysely, Transaction } from "kysely";

import { createOutboxService } from "../../events/outbox.service.ts";
import * as repository from "./workshops.repository.ts";

/**
 * What the commerce module needs from workshops: whether one can be bought,
 * and turning a paid order into a registration (and a refund back out of
 * one). The free path in `workshops.service.ts` uses the same
 * `createRegistration`, so both tell the learner the same way.
 */

export type WorkshopPurchaseRefusal =
  "not_published" | "cancelled" | "ended" | "free" | "full";

export function workshopPurchaseRefusal(
  row: repository.WorkshopListRow,
  now: Date,
): WorkshopPurchaseRefusal | null {
  if (row.status === "cancelled") return "cancelled";
  if (row.status !== "published") return "not_published";
  if (
    row.last_session_ends_at &&
    new Date(row.last_session_ends_at).getTime() <= now.getTime()
  ) {
    return "ended";
  }
  if (row.price_minor === null || row.price_minor <= 0) return "free";
  if (row.capacity !== null && row.registration_count >= row.capacity) {
    return "full";
  }
  return null;
}

/** Published (or cancelled) workshops by id, with what pricing checks. */
export async function listWorkshopsForCheckout(
  database: Kysely<Database>,
  workshopIds: readonly string[],
  now: Date,
): Promise<repository.WorkshopListRow[]> {
  return await repository.listPublicByIds(database, workshopIds, now);
}

export async function findActiveRegistration(
  database: DatabaseExecutor,
  workshopId: string,
  userId: string,
): Promise<repository.WorkshopRegistrationRow | undefined> {
  const registration = await repository.findRegistration(
    database,
    workshopId,
    userId,
  );
  return registration && !registration.cancelled_at ? registration : undefined;
}

/**
 * Writes (or revives) the registration and queues the confirmation. The
 * caller holds whatever lock the seat count needs.
 */
export async function createRegistration(
  trx: Transaction<Database>,
  input: {
    workshop: { id: string; slug: string; title: string };
    userId: string;
    source: "free" | "order" | "admin";
    orderId: string | null;
    existingId?: string;
    now: Date;
  },
): Promise<repository.WorkshopRegistrationRow> {
  const outbox = createOutboxService();
  const { workshop, userId, now } = input;
  const registration = await repository.upsertRegistration(trx, {
    id: input.existingId ?? crypto.randomUUID(),
    workshopId: workshop.id,
    userId,
    source: input.source,
    orderId: input.orderId,
    now,
  });
  const sessions = await repository.listSessions(trx, workshop.id);
  const next =
    sessions.find((session) => session.ends_at.getTime() > now.getTime()) ??
    sessions[0];
  await outbox.publish(trx, {
    type: "workshop.registered",
    version: 1,
    dedupeKey: `workshop.registered:${workshop.id}:${userId}:${now.getTime()}`,
    occurredAt: now,
    payload: {
      workshopId: workshop.id,
      workshopSlug: workshop.slug,
      workshopTitle: workshop.title,
      recipientUserId: userId,
      startsAt: next ? next.starts_at.toISOString() : null,
      endsAt: next ? next.ends_at.toISOString() : null,
      timeZone: next?.time_zone ?? null,
      sessionCount: sessions.length,
    },
  });
  return registration;
}

/**
 * Fulfilment hands over the payment transaction; anything else gets one, so
 * the registration and its confirmation are always written together.
 */
async function inTransaction<T>(
  executor: DatabaseExecutor,
  run: (trx: Transaction<Database>) => Promise<T>,
): Promise<T> {
  if (executor.isTransaction)
    return await run(executor as Transaction<Database>);
  return await (executor as Kysely<Database>).transaction().execute(run);
}

/** A paid order was fulfilled: the buyer is registered. */
export async function registerFromOrder(
  database: DatabaseExecutor,
  input: { workshopId: string; userId: string; orderId: string; now: Date },
): Promise<void> {
  await inTransaction(database, async (trx) => {
    const workshop = await repository.findWorkshopById(trx, input.workshopId);
    if (!workshop) return;
    const existing = await repository.findRegistration(
      trx,
      input.workshopId,
      input.userId,
    );
    await createRegistration(trx, {
      workshop,
      userId: input.userId,
      source: "order",
      orderId: input.orderId,
      ...(existing ? { existingId: existing.id } : {}),
      now: input.now,
    });
  });
}

/** An order (or one workshop line of it) was refunded: the seat is given back. */
export async function cancelRegistrationsByOrder(
  database: DatabaseExecutor,
  orderId: string,
  workshopId: string | null,
  now: Date,
): Promise<void> {
  await repository.cancelRegistrationsByOrder(
    database,
    orderId,
    workshopId,
    now,
  );
}
