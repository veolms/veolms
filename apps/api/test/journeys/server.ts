/**
 * Everything the browser tests talk to, started by Playwright before they
 * run (apps/web/playwright.config.ts):
 *
 * - the real VeoLMS API, on a database of its own (veolms_e2e_test) that is
 *   rebuilt from the migrations on every start, with email captured and a
 *   fake payment gateway (the same setup as the flow tests);
 * - a stand-in CDN serving a 12-second test video (cdn-server.ts);
 * - test helpers on a separate port (control-server.ts).
 *
 * Run it on its own to look around by hand:
 *   node apps/api/test/journeys/server.ts
 */
import { JOURNEY_PORTS } from "./journeys-env.ts";

import { FLOW_DATABASE_URL } from "../flows/setup/flow-env.ts";
import { rebuildTestDatabase } from "../flows/setup/flow-database.ts";
import { startCdnServer } from "./cdn-server.ts";
import { startControlServer } from "./control-server.ts";
import { startFlowApp } from "../flows/setup/flow-app.ts";

await rebuildTestDatabase(FLOW_DATABASE_URL);

const flow = await startFlowApp({ logErrors: true });
await flow.app.listen({ port: JOURNEY_PORTS.api, host: "127.0.0.1" });

const cdn = await startCdnServer(JOURNEY_PORTS.cdn);
const control = await startControlServer(
  JOURNEY_PORTS.control,
  flow,
  cdn.requests,
);

console.info(
  `Browser test server ready: API http://127.0.0.1:${JOURNEY_PORTS.api}, ` +
    `CDN :${JOURNEY_PORTS.cdn}, helpers :${JOURNEY_PORTS.control}`,
);

async function stop() {
  control.close();
  cdn.server.close();
  await flow.close();
  process.exit(0);
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
