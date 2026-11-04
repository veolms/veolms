/**
 * Ports of everything the browser tests start. playwright.config.ts passes
 * them to the web app and the test server; the tests read them from here.
 */
export const PORTS = {
  /** The web app (React Router dev server). */
  web: 43917,
  /** The API, on its own test database. */
  api: 4100,
  /** The stand-in CDN serving the test video. */
  cdn: 4190,
  /** Test helpers (apps/api/test/journeys/control-server.ts). */
  control: 4191,
};

export const WEB_URL = `http://127.0.0.1:${PORTS.web}`;
export const CONTROL_URL = `http://127.0.0.1:${PORTS.control}`;
