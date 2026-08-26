import { defineConfig, devices } from "@playwright/test";

const baseURL = "http://127.0.0.1:43917";

export default defineConfig({
  testDir: "./tests/e2e",
  testIgnore: ["dist.spec.ts"],
  outputDir: "./test-results",
  snapshotPathTemplate:
    "{testDir}/__screenshots__/{testFilePath}/{arg}-{projectName}-{platform}{ext}",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  failOnFlakyTests: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : 4,
  reporter: process.env.CI ? [["line"], ["html", { open: "never" }]] : "line",
  expect: {
    timeout: 7_500,
    toHaveScreenshot: {
      animations: "disabled",
      caret: "hide",
      maxDiffPixels: 100,
    },
  },
  use: {
    baseURL,
    colorScheme: "dark",
    locale: "en-US",
    timezoneId: "Asia/Kolkata",
    deviceScaleFactor: 1,
    contextOptions: { reducedMotion: "reduce" },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 1000 },
        deviceScaleFactor: 1,
      },
    },
  ],
  webServer: [
    {
      command:
        "node --env-file-if-exists=../../.env ../api/src/index.ts",
      url: "http://127.0.0.1:4000/api/v1/health",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command:
        "node node_modules/@react-router/dev/bin.cjs dev --host 127.0.0.1 --port 43917",
      url: baseURL,
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
