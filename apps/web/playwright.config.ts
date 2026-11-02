/**
 * Browser tests: real Chrome, the real web app, the real API.
 * What they cover and how to run them: tests/journeys/README.md.
 */
import { defineConfig } from "@playwright/test";

import { CONTROL_URL, PORTS, WEB_URL } from "./tests/journeys/support/ports";

const isCI = Boolean(process.env.CI);

export default defineConfig({
  testDir: "./tests/journeys",
  outputDir: "./test-results",
  globalSetup: "./tests/journeys/support/warm-up.ts",
  // One test at a time: every test shares one API and one web dev server,
  // and a run stays well inside a few minutes this way.
  workers: 1,
  fullyParallel: false,
  forbidOnly: isCI,
  // No retries: a test that passes only on its second try is a bug to fix,
  // not to hide.
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: isCI
    ? [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]]
    : [["list"]],
  use: {
    baseURL: WEB_URL,
    // Google Chrome, not Playwright's own Chromium: that build cannot play
    // H.264 video, which every lesson is.
    channel: "chrome",
    viewport: { width: 1440, height: 900 },
    locale: "en-US",
    timezoneId: "Asia/Kolkata",
    navigationTimeout: 60_000,
    // A failed test keeps a screenshot. On GitHub it also keeps a recording
    // and a step-by-step trace. Locally they are off (recording doubles each
    // page's time); add `--trace on` to a run to get them, and
    // open them with `pnpm test:browser:report`.
    screenshot: "only-on-failure",
    trace: isCI ? "retain-on-failure" : "off",
    video: isCI ? "retain-on-failure" : "off",
  },
  webServer: [
    {
      // The API, its test database, the test CDN and the test helpers.
      command: "node ../api/test/journeys/server.ts",
      url: `${CONTROL_URL}/health`,
      env: {
        JOURNEY_API_PORT: String(PORTS.api),
        JOURNEY_CDN_PORT: String(PORTS.cdn),
        JOURNEY_CONTROL_PORT: String(PORTS.control),
        JOURNEY_WEB_ORIGIN: WEB_URL,
      },
      reuseExistingServer: !isCI,
      timeout: 120_000,
      stdout: "pipe",
      stderr: "pipe",
    },
    {
      // The web app, as `pnpm dev` runs it, calling the test API.
      command: `node node_modules/@react-router/dev/bin.cjs dev --host 127.0.0.1 --port ${PORTS.web}`,
      url: WEB_URL,
      env: {
        VITE_API_BASE_URL: `http://127.0.0.1:${PORTS.api}/v1`,
        VITE_CDN_URL: `http://127.0.0.1:${PORTS.cdn}`,
        // The same wait as the test API, so "Resend code" opens after 1 s.
        OTP_RESEND_COOLDOWN_SECONDS: "1",
      },
      reuseExistingServer: !isCI,
      timeout: 180_000,
    },
  ],
});
