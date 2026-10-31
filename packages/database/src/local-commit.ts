import { sql, type Kysely, type Transaction } from "kysely";

/**
 * Runs `work` in a transaction that commits as soon as this server has it,
 * without waiting for a synchronous standby to confirm.
 *
 * Production commits wait for the read replica (`synchronous_commit =
 * remote_apply`), a network round trip per commit. That is right for money,
 * access and accounts. High-volume telemetry (lesson progress heartbeats,
 * analytics events) loses at most the last moment of data if the primary
 * fails before the replica catches up, so it need not wait. The replica
 * still receives it, normally within milliseconds; a read sent there
 * straight after may briefly miss it.
 *
 * Given a transaction already open, `work` runs in it as it is: how that
 * transaction commits is its owner's decision.
 */
export async function withLocalCommit<DB, T>(
  database: Kysely<DB> | Transaction<DB>,
  work: (transaction: Kysely<DB> | Transaction<DB>) => Promise<T>,
): Promise<T> {
  if (database.isTransaction) return await work(database);
  return await database.transaction().execute(async (transaction) => {
    await sql`set local synchronous_commit = local`.execute(transaction);
    return await work(transaction);
  });
}
