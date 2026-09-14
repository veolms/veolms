import { createDatabase } from "@veolms/database";
import Fastify from "fastify";

import { config } from "../config.ts";
import { logger } from "../lib/logger.ts";
import { createAuthService } from "../modules/auth/index.ts";
import { createEnrollmentAudienceService } from "../modules/commerce/index.ts";
import { createNotificationProcessor } from "../modules/notifications/index.ts";
import { createEmailService } from "../services/email/index.ts";

const database = createDatabase(config.DATABASE_URL);
const app = Fastify({ logger });
const email = createEmailService({
  logger: app.log,
  config: {
    transport: config.EMAIL_TRANSPORT,
    host: config.SMTP_HOST,
    port: config.SMTP_PORT,
    user: config.SMTP_USER,
    pass: config.SMTP_PASS,
    from: config.EMAIL_FROM,
  },
});

try {
  const auth = createAuthService({ database });
  const audience = createEnrollmentAudienceService({ database });
  const processor = createNotificationProcessor({
    database,
    email,
    logger: app.log,
    config,
    handlers: {
      listActiveCourseRecipientUserIds: (courseId) =>
        audience.listActiveUserIdsForCourse(courseId),
    },
    recipients: {
      findRecipient: async (userId) => {
        const user = await auth.findUserByIdForNotification(userId);
        return user ? { id: user.id, email: user.email } : undefined;
      },
    },
  });
  const isWatch = process.argv.includes("--watch");
  if (isWatch) {
    process.stdout.write(
      `${JSON.stringify({ job: "notification-worker", status: "watching", intervalSeconds: 3 })}\n`,
    );
    let running = true;
    const onSignal = () => {
      running = false;
    };
    process.on("SIGINT", onSignal);
    process.on("SIGTERM", onSignal);

    while (running) {
      const result = await processor.process();
      if (
        result.outbox.processed > 0 ||
        result.email.sent > 0 ||
        result.outbox.failed > 0
      ) {
        process.stdout.write(
          `${JSON.stringify({
            job: "notification-worker",
            ...result,
            timestamp: new Date().toISOString(),
          })}\n`,
        );
      }
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  } else {
    const result = await processor.process();
    process.stdout.write(
      `${JSON.stringify({ job: "notification-worker", ...result })}\n`,
    );
    if (result.outbox.failed > 0 || result.email.failed > 0) {
      process.exitCode = 2;
    }
  }
} catch (error) {
  process.stderr.write(
    `${JSON.stringify({
      job: "notification-worker",
      error: error instanceof Error ? error.message : "Unknown worker error",
    })}\n`,
  );
  process.exitCode = 1;
} finally {
  await email.close();
  await app.close();
  await database.destroy();
}
