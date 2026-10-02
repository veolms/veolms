import { type Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  // No-op rollback: preserving role assignments does not break invariants
}

export async function down(db: Kysely<unknown>): Promise<void> {
  // No-op rollback: preserving role assignments does not break invariants
}
