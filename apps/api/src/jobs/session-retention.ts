import { createDatabase } from "@veolms/database";
import { config } from "../config.ts";
import { createSessionService } from "../modules/auth/session/session.service.ts";

const database = createDatabase(config.DATABASE_URL);

try {
  const sessionService = createSessionService({ database });
  const purgedCount = await sessionService.purgeOldSessions(
    config.SESSION_RETENTION_DAYS,
  );
  process.stdout.write(
    `${JSON.stringify({
      job: "session-retention",
      purgedCount,
      retentionDays: config.SESSION_RETENTION_DAYS,
    })}\n`,
  );
} catch (error) {
  process.stderr.write(
    `${JSON.stringify({
      job: "session-retention",
      error: error instanceof Error ? error.message : "Unknown worker error",
    })}\n`,
  );
  process.exitCode = 1;
} finally {
  await database.destroy();
}
