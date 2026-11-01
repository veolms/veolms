import { createDatabase } from "@veolms/database";
import { config } from "../config.ts";
import { createAttemptCloser } from "../modules/quizzes/attempts/attempt.closing.ts";

const database = createDatabase(config.DATABASE_URL);

try {
  // Saved answers are graded; only attempts with nothing saved end as
  // "expired". No result notification is sent from here.
  const { closed, failed } = await createAttemptCloser({
    database,
  }).closeOverdueAttempts();
  process.stdout.write(
    `${JSON.stringify({
      job: "quiz-attempt-reaper",
      expiredCount: closed.length,
      failedCount: failed,
      timestamp: new Date().toISOString(),
    })}\n`,
  );
  if (failed > 0) process.exitCode = 2;
} catch (error) {
  process.stderr.write(
    `${JSON.stringify({
      job: "quiz-attempt-reaper",
      error: error instanceof Error ? error.message : "Unknown worker error",
    })}\n`,
  );
  process.exitCode = 1;
} finally {
  await database.destroy();
}
