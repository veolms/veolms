import type { Database } from "@veolms/database";
import type { Kysely } from "kysely";

/** Every AUTH repository accepts the normal database or a transaction. */
export type Executor = Kysely<Database>;
