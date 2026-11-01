import { createDatabase } from "@veolms/database";
import { startApiServer } from "@veolms/api-core";

import { createApp } from "./app.ts";
import { config } from "./config.ts";
import { logger } from "./lib/logger.ts";

const database = createDatabase(config.DATABASE_URL, {
  applicationName: "veolms-api",
});
const app = await createApp({ database, logger });

// Listening, graceful shutdown (requests in progress are let finish) and
// the pm2 "ready" signal for zero-downtime reloads.
await startApiServer({
  app,
  database,
  host: config.API_HOST,
  port: config.API_PORT,
});
