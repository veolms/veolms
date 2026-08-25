import type { Database } from "@veolms/database";
import type { Kysely, Transaction } from "kysely";

/** Every commerce repository accepts either the top-level database or a transaction context. */
export type Executor = Kysely<Database> | Transaction<Database>;
