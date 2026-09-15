import { createDatabase } from "@veolms/database";
import { config } from "../config.ts";
import { expireAbandonedAttempts } from "../modules/quizzes/shared/quiz.repository.ts";

const database = createDatabase(config.DATABASE_URL);

try {
  const expired = await expireAbandonedAttempts(database);
  process.stdout.write(
    `${JSON.stringify({
      job: "quiz-attempt-reaper",
      expiredCount: expired.length,
      timestamp: new Date().toISOString(),
    })}\n`,
  );
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
