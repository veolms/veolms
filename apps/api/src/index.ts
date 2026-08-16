import { createDatabase } from "@veolms/database";

import { createApp } from "./app.ts";
import { config } from "./config.ts";

const database = createDatabase(config.DATABASE_URL);
const logger =
  config.NODE_ENV === "development" && config.API_DEV_PRETTY_LOGS
    ? {
      transport: {
        target: "pino-pretty",
        options: {
          translateTime: "HH:MM:ss",
          ignore: "pid,hostname",
        },
      },
    }
    : true;
const app = await createApp({ database, logger });
let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  app.log.info({ signal }, "Shutting down");
  await app.close();
  await database.destroy();
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
  await database.destroy();
  process.exitCode = 1;
}
