/**
 * The environment of the API the browser tests talk to: the flow tests'
 * environment (flow-env.ts: test database, captured email, fake payment
 * keys, no storage), with what a real browser needs on top.
 *
 * The ports can be changed through the environment; Playwright's config
 * (apps/web/playwright.config.ts) passes the same values to both sides.
 */
import "./journeys-database.ts";
import "../flows/setup/flow-env.ts";

export const JOURNEY_PORTS = {
  /** The API itself, as the web app calls it. */
  api: Number(process.env.JOURNEY_API_PORT ?? 4100),
  /** Stands in for the CDN: serves the test video (see cdn-server.ts). */
  cdn: Number(process.env.JOURNEY_CDN_PORT ?? 4190),
  /** Test helpers only the tests call (see control-server.ts). */
  control: Number(process.env.JOURNEY_CONTROL_PORT ?? 4191),
};

const webOrigin = process.env.JOURNEY_WEB_ORIGIN ?? "http://127.0.0.1:43917";

Object.assign(process.env, {
  // The video links the API hands out point at the local test CDN.
  CDN_URL: `http://127.0.0.1:${JOURNEY_PORTS.cdn}`,
  // The web app runs on its own port and calls the API across origins.
  WEB_URL: webOrigin,
  CORS_ORIGINS: webOrigin,
  // Every browser test sends its own X-Forwarded-For address, as a learner
  // behind Cloudflare would. Without it every test would share 127.0.0.1
  // and the per-address limits (5 sign-in codes a minute) would trip.
  TRUST_PROXY: "true",
});
