import { defineConfig, devices } from "@playwright/test";

const baseURL = "http://127.0.0.1:43918";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "dist.spec.ts",
  outputDir: "./test-results/preview",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  failOnFlakyTests: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: "line",
  expect: { timeout: 7_500 },
  use: {
    baseURL,
    colorScheme: "dark",
    locale: "en-US",
    timezoneId: "Asia/Kolkata",
    deviceScaleFactor: 1,
    contextOptions: { reducedMotion: "reduce" },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "compiled-chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 1000 },
        deviceScaleFactor: 1,
      },
    },
  ],
  webServer: {
    command: "pnpm preview:performance -- --port 43918",
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
