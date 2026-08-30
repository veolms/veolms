import { fileURLToPath } from "node:url";
import { expect, test as base } from "@playwright/test";

const courseVideoFixture = fileURLToPath(
  new URL("../fixtures/designing-users.mp4", import.meta.url),
);

export const test = base.extend({
  page: async ({ page }, run, testInfo) => {
    const runtimeErrors: string[] = [];
    page.on("pageerror", (error) =>
      runtimeErrors.push(`pageerror: ${error.message}`),
    );
    page.on("console", (message) => {
      if (message.type() !== "error") return;
      const isExpectedUnauthenticatedResponse =
        message.text().includes("status of 401") &&
        /\/api\/v1\/auth\//.test(message.location().url);
      if (!isExpectedUnauthenticatedResponse) {
        runtimeErrors.push(`console.error: ${message.text()}`);
      }
    });

    await page.route(/\.mp4(?:\?.*)?$/, async (route) => {
      await route.fulfill({
        path: courseVideoFixture,
        contentType: "video/mp4",
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Accept-Ranges": "bytes",
          "Cache-Control": "no-store",
        },
      });
    });

    await run(page);

    if (runtimeErrors.length) {
      await testInfo.attach("browser-runtime-errors", {
        body: runtimeErrors.join("\n"),
        contentType: "text/plain",
      });
    }
    expect(
      runtimeErrors,
      "The browser should not emit uncaught errors",
    ).toEqual([]);
  },
});

export { expect };
