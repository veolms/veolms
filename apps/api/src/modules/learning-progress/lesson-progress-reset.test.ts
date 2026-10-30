import assert from "node:assert/strict";
import { test } from "node:test";
import type { Database } from "@veolms/database";
import {
  DummyDriver,
  Kysely,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
} from "kysely";
import { createLessonProgressResetService } from "./lesson-progress-reset.service.ts";

const LESSON = "11111111-1111-4111-8111-111111111111";
const PASSED_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PASSED_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

/** A database that runs nothing and records the statements it is given. */
function recordingDatabase() {
  const statements: { sql: string; parameters: readonly unknown[] }[] = [];
  const database = new Kysely<Database>({
    dialect: {
      createAdapter: () => new PostgresAdapter(),
      createDriver: () => new DummyDriver(),
      createIntrospector: (db) => new PostgresIntrospector(db),
      createQueryCompiler: () => new PostgresQueryCompiler(),
    },
    log: (event) => {
      statements.push({
        sql: event.query.sql,
        parameters: event.query.parameters,
      });
    },
  });
  return { database, statements };
}

async function clearWith(passedLearnerIds: string[]) {
  const { database, statements } = recordingDatabase();
  const asked: { lessonId: string; sameExecutor: boolean }[] = [];
  const service = createLessonProgressResetService({
    database,
    quizCompletionService: {
      listLearnerIdsWhoPassedLesson: (lessonId, executor) => {
        asked.push({ lessonId, sameExecutor: executor === database });
        return Promise.resolve(passedLearnerIds);
      },
    },
  });
  await service.clearLessonProgress(database, LESSON);
  return { statements, asked };
}

await test("with nobody passed, every learner's progress on the lesson is cleared", async () => {
  const { statements, asked } = await clearWith([]);
  assert.deepEqual(asked, [{ lessonId: LESSON, sameExecutor: true }]);
  assert.equal(statements.length, 1);
  assert.equal(
    statements[0]?.sql,
    'delete from "learning_progress" where "lesson_id" = $1',
  );
  assert.deepEqual(statements[0]?.parameters, [LESSON]);
});

await test("learners who passed the lesson's quiz are left out of the clearing", async () => {
  const { statements, asked } = await clearWith([PASSED_A, PASSED_B]);
  // Asked of the quizzes module, on the executor the caller passed in, so
  // the answer and the clearing share the caller's transaction.
  assert.deepEqual(asked, [{ lessonId: LESSON, sameExecutor: true }]);
  assert.equal(statements.length, 1);
  assert.equal(
    statements[0]?.sql,
    'delete from "learning_progress" where "lesson_id" = $1 and user_id <> all($2::uuid[])',
  );
  assert.deepEqual(statements[0]?.parameters, [LESSON, [PASSED_A, PASSED_B]]);
});
