import { createDatabase } from "@veolms/database";
import Fastify from "fastify";

import { config } from "../config.ts";
import { logger } from "../lib/logger.ts";
import { createAuthService } from "../modules/auth/index.ts";
import { createEnrollmentAudienceService } from "../modules/commerce/index.ts";
import {
  createInvoiceService,
  invoiceStorage,
} from "../modules/commerce/invoices/invoice.service.ts";
import { createInvoiceAttachmentResolver } from "../modules/commerce/invoices/invoice-email-attachment.ts";
import { createNotificationProcessor } from "../modules/notifications/index.ts";
import { createServices } from "../services/index.ts";
import { createEmailService } from "@veolms/services/email";

const database = createDatabase(config.DATABASE_URL, {
  applicationName: "veolms-notification-worker",
});
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
  // The purchase email carries the order's invoice, read from (or stored
  // to) the bucket the API keeps invoices in.
  const { storage } = createServices({ config, logger: app.log });
  const processor = createNotificationProcessor({
    database,
    email,
    logger: app.log,
    config,
    attachments: createInvoiceAttachmentResolver(
      createInvoiceService({ database, storage: invoiceStorage(storage) }),
    ),
    handlers: {
      listActiveCourseRecipientUserIds: (courseId) =>
        audience.listActiveUserIdsForCourse(courseId),
    },
    recipients: {
      findRecipient: async (userId) => {
        const user = await auth.findUserByIdForNotification(userId);
        return user
          ? { id: user.id, email: user.email, isDeleted: user.is_deleted }
          : undefined;
      },
      findRecipients: (userIds) =>
        auth.listNotificationRecipientsByIds(userIds),
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
