/**
 * The daily upload allowance counts files that arrived, not every try:
 * a video that failed and was retried used to count once per try, and a
 * learner was told "You have uploaded the most allowed today" (25 Nov 2026).
 */
import assert from "node:assert/strict";
import { it } from "node:test";

import type { Database } from "@veolms/database";
import {
  DummyDriver,
  Kysely,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
  type CompiledQuery,
} from "kysely";

import { createChatRepository } from "../shared/chat.repository.ts";

const OWNER = "22222222-2222-4222-8222-222222222222";

/** A database that runs nothing and records the statements it is given. */
function recordingDatabase() {
  const statements: CompiledQuery[] = [];
  const database = new Kysely<Database>({
    dialect: {
      createAdapter: () => new PostgresAdapter(),
      createDriver: () => new DummyDriver(),
      createIntrospector: (db) => new PostgresIntrospector(db),
      createQueryCompiler: () => new PostgresQueryCompiler(),
    },
    plugins: [
      {
        transformQuery: (args) => args.node,
        transformResult: async (args) => args.result,
      },
    ],
    log: (event) => {
      if (event.level === "query") statements.push(event.query);
    },
  });
  return { database, statements };
}

void it("counts only uploads that arrived (ready or sent), not failed tries", async () => {
  const { database, statements } = recordingDatabase();
  const since = new Date("2026-11-24T10:00:00Z");
  const used = await createChatRepository().uploadedBytesSince(
    database,
    OWNER,
    since,
  );
  assert.equal(used, 0);
  assert.equal(statements.length, 1);
  const sql = statements[0]!.sql;
  assert.match(sql, /"owner_id" = \$1/);
  assert.match(sql, /"created_at" > \$2/);
  assert.match(sql, /"status" in \(\$3, \$4\)/);
  assert.deepEqual(statements[0]!.parameters, [
    OWNER,
    since,
    "ready",
    "attached",
  ]);
});
