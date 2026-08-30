import type { Database } from "@veolms/database";
import type { Kysely } from "kysely";
import type { FastifyBaseLogger } from "fastify";

export interface OrderExpirationWorkerOptions {
  database: Kysely<Database>;
  logger?: FastifyBaseLogger;
}

/**
 * Bulk-expires orders that have passed their expires_at timestamp.
 * Safe to run repeatedly — the WHERE clause ensures only orders in
 * pending/payment_processing are eligible.
 */
export function createOrderExpirationWorker({
  database,
  logger,
}: OrderExpirationWorkerOptions) {
  async function expireStaleOrders(): Promise<{ expiredCount: number }> {
    const log = logger?.child({ job: "order-expiration-worker" });
    const now = new Date();

    const expired = await database
      .updateTable("orders")
      .set({
        status: "expired",
        updated_at: now,
      })
      .where("status", "in", ["pending", "payment_processing"])
      .where("expires_at", "<", now)
      .returningAll()
      .execute();

    if (expired.length > 0) {
      log?.info({ expiredCount: expired.length }, "Orders expired");
    }

    return { expiredCount: expired.length };
  }

  return { expireStaleOrders };
}
