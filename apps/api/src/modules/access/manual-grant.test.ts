import assert from "node:assert/strict";
import { test } from "node:test";
import type { Database } from "@veolms/database";
import {
  Kysely,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
  type DatabaseConnection,
  type Driver,
  type QueryResult,
} from "kysely";
import { createAccessService } from "./access.service.ts";

const USER = "00000000-0000-4000-8000-0000000000aa";
const COURSE = "11111111-1111-4111-8111-111111111111";

/**
 * A database that answers the grant's two lookups with the given rows and
 * records every statement. Nothing is written anywhere.
 */
function fakeDatabase(rows: {
  user?: { id: string; is_deleted: boolean };
  course?: { id: string; status: string; deleted_at: Date | null };
}) {
  const statements: string[] = [];
  const connection: DatabaseConnection = {
    executeQuery: <R>(query: { sql: string }) => {
      statements.push(query.sql);
      const result = query.sql.includes('from "users"')
        ? rows.user
        : query.sql.includes('from "courses"')
          ? rows.course
          : undefined;
      return Promise.resolve({
        rows: result ? [result] : [],
      } as QueryResult<R>);
    },
    streamQuery: async function* () {
      throw new Error("not streamed");
    },
  };
  const driver: Driver = {
    init: () => Promise.resolve(),
    acquireConnection: () => Promise.resolve(connection),
    beginTransaction: () => Promise.resolve(),
    commitTransaction: () => Promise.resolve(),
    rollbackTransaction: () => Promise.resolve(),
    releaseConnection: () => Promise.resolve(),
    destroy: () => Promise.resolve(),
  };
  const database = new Kysely<Database>({
    dialect: {
      createAdapter: () => new PostgresAdapter(),
      createDriver: () => driver,
      createIntrospector: (db) => new PostgresIntrospector(db),
      createQueryCompiler: () => new PostgresQueryCompiler(),
    },
  });
  return { database, statements };
}

const wrote = (statements: string[]) =>
  statements.some((sql) => /^(insert|update|delete)/i.test(sql));

async function grantFails(
  rows: Parameters<typeof fakeDatabase>[0],
  code: string,
  validUntil: Date | null = null,
) {
  const { database, statements } = fakeDatabase(rows);
  await assert.rejects(
    createAccessService().grantManualAccess(database, {
      userId: USER,
      courseId: COURSE,
      validUntil,
    }),
    (error: { code?: string }) => {
      assert.equal(error.code, code);
      return true;
    },
  );
  assert.equal(wrote(statements), false, "nothing is written");
}

const activeUser = { id: USER, is_deleted: false };
const publishedCourse = { id: COURSE, status: "published", deleted_at: null };

await test("an unknown or deactivated learner answers 404, not a server error", async () => {
  await grantFails({ course: publishedCourse }, "USER_NOT_FOUND");
  await grantFails(
    { user: { id: USER, is_deleted: true }, course: publishedCourse },
    "USER_NOT_FOUND",
  );
});

await test("an unknown or deleted course answers 404", async () => {
  await grantFails({ user: activeUser }, "COURSE_NOT_FOUND");
  await grantFails(
    {
      user: activeUser,
      course: { ...publishedCourse, deleted_at: new Date() },
    },
    "COURSE_NOT_FOUND",
  );
});

await test("only a published course can be granted", async () => {
  for (const status of ["draft", "archived"]) {
    await grantFails(
      { user: activeUser, course: { ...publishedCourse, status } },
      "COURSE_NOT_GRANTABLE",
    );
  }
});

await test("an end date in the past is refused", async () => {
  await grantFails(
    { user: activeUser, course: publishedCourse },
    "INVALID_VALID_UNTIL",
    new Date(Date.now() - 1000),
  );
});
