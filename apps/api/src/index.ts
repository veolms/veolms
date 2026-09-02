import { createDatabase } from "@veolms/database";

import { createApp } from "./app.ts";
import { config } from "./config.ts";
import { logger } from "./lib/logger.ts";

const database = createDatabase(config.DATABASE_URL);
const app = await createApp({ database, logger });
let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  app.log.info({ signal }, "Initiating graceful shutdown...");

  const timeoutId = setTimeout(() => {
    app.log.error("Shutdown timeout exceeded. Forcefully terminating process.");
    process.exit(1);
  }, 10000);

  try {
    let shutdownFailed = false;

    try {
      await app.close();
    } catch (err) {
      shutdownFailed = true;
      app.log.error({ err }, "Failed to close application");
    }

    try {
      await database.destroy();
    } catch (err) {
      shutdownFailed = true;
      app.log.error({ err }, "Failed to destroy database");
    }

    if (shutdownFailed) {
      process.exit(1);
    }

    app.log.info("Graceful shutdown completed successfully.");
    clearTimeout(timeoutId);
  } catch (error) {
    app.log.error(
      { err: error },
      "Unexpected error occurred during graceful shutdown.",
    );
    process.exit(1);
  }
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    void shutdown(signal);
  });
}

try {
  await app.listen({ host: config.API_HOST, port: config.API_PORT });
} catch (error) {
  app.log.error(error);
  try {
    // Background queues are started while the app is being composed. If
    // listen() fails (for example because another dev server owns the port),
    // close Fastify first so its onClose hooks stop those queues before the
    // shared Kysely driver is destroyed.
    await app.close();
  } catch (closeError) {
    app.log.error(
      { err: closeError },
      "Failed to close application after listen error",
    );
  }
  await database.destroy();
  process.exitCode = 1;
}
