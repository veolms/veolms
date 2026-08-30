/**
 * Every commerce repository accepts either the top-level database or a
 * transaction context.
 *
 * Re-exports the single canonical definition from @veolms/database instead
 * of redeclaring `Kysely<Database> | Transaction<Database>` locally — this
 * type used to be defined separately in 4 places (this file,
 * auth/shared/repository.types.ts, access/access.repository.ts,
 * access/access.service.ts) with no shared source of truth, and had already
 * drifted: auth's copy omitted `Transaction<Database>` entirely, so auth
 * repositories couldn't be typed correctly when called inside a
 * transaction.
 */
export type { DatabaseExecutor as Executor } from "@veolms/database";
