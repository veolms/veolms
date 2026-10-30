/**
 * Every AUTH repository accepts the normal database or a transaction.
 *
 * Re-exports the single canonical definition from @veolms/database — see
 * commerce/shared/repository.types.ts for the full history. This file used
 * to define its own `Kysely<Database>` (no `Transaction<Database>` in the
 * union), which meant auth repositories couldn't be typed correctly when
 * called inside a transaction. Re-exporting the shared type fixes that.
 */
export type { DatabaseExecutor as Executor } from "@veolms/database";
