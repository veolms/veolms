import { test, expect } from "./app.fixture.ts";
import { installBaselineState, openApp } from "./support.ts";

test.beforeEach(async ({ page }) => {
  await installBaselineState(page);
});

test("first visible shell uses the persisted layout geometry", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".courses-app")).toBeVisible();
  await page.evaluate(() => {
    window.localStorage.setItem("veolms-sidebar-mode", "expanded");
    window.localStorage.setItem("veolms-sidebar-width", "252");
    window.localStorage.setItem("veolms-curriculum-width", "300");
  });

  await page.addInitScript(() => {
    const observer = new MutationObserver(() => {
      const app = document.querySelector<HTMLElement>(".courses-app");
      const learningMain = document.querySelector<HTMLElement>(
        ".learning-workspace__main",
      );

      if (app && !document.documentElement.dataset.testFirstSidebarWidth) {
        document.documentElement.dataset.testFirstSidebarWidth =
          app.style.getPropertyValue("--sidebar-expanded-width");
      }
      if (
        learningMain &&
        !document.documentElement.dataset.testFirstCurriculumWidth
      ) {
        document.documentElement.dataset.testFirstCurriculumWidth =
          learningMain.style.getPropertyValue("--learning-curriculum-width");
      }
      if (
        document.documentElement.dataset.testFirstSidebarWidth &&
        document.documentElement.dataset.testFirstCurriculumWidth
      ) {
        observer.disconnect();
      }
    });
    observer.observe(document, { childList: true, subtree: true });
  });

  await page.goto("/learn/typescript-course/the-design-mindset?from=home");
  await expect(page.locator(".courses-app")).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute(
    "data-test-first-sidebar-width",
    "252px",
  );
  await expect(page.locator("html")).toHaveAttribute(
    "data-test-first-curriculum-width",
    "300px",
  );
  await expect(page.locator("[data-app-loading]")).toHaveCount(0);
});

test("compiled client serves direct routes and bundled course artwork", async ({
  page,
}) => {
  const browserErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });
  page.on("pageerror", (error) => browserErrors.push(error.message));

  // Direct URLs intentionally return one stable loading boundary. The real
  // shell is mounted only after JavaScript restores persisted layout settings,
  // preventing a prerendered sidebar from shifting after first paint.
  const settingsDocument = await page.request.get("/settings/appearance");
  expect(settingsDocument.ok()).toBe(true);
  const settingsHtml = await settingsDocument.text();
  expect(settingsHtml).toContain("Loading your workspace");
  expect(settingsHtml).not.toContain("Display mode");

  const catalogueDocument = await page.request.get("/courses");
  expect(catalogueDocument.ok()).toBe(true);
  const catalogueHtml = await catalogueDocument.text();
  expect(catalogueHtml).toBe(settingsHtml);
  expect(catalogueHtml).not.toContain("UI/UX Design Mastery");

  await openApp(page, "/");
  await expect(
    page.getByRole("heading", { name: /Good evening, Ashi/ }),
  ).toBeVisible();

  await page.goto("/courses");
  await expect(
    page.getByRole("heading", { name: "Courses", level: 1 }),
  ).toBeVisible();
  const courseImages = page
    .getByRole("region", { name: "Courses" })
    .locator("img");
  await expect(courseImages).toHaveCount(7);
  await expect
    .poll(() =>
      courseImages.evaluateAll((images) =>
        images.every((image) => {
          const courseImage = image as HTMLImageElement;
          return courseImage.complete && courseImage.naturalWidth > 0;
        }),
      ),
    )
    .toBe(true);

  await page.goto("/settings/appearance");
  await expect(page.getByRole("tabpanel")).toHaveAttribute(
    "data-settings-tab",
    "appearance",
  );
  await expect(page).toHaveTitle(/^Settings .* ProCodrr$/);

  await page.goto("/COURSES");
  await expect(
    page.getByRole("heading", { name: /Good evening, Ashi/ }),
  ).toBeVisible();
  await expect(page).toHaveTitle(/^Home .* ProCodrr$/);
  expect(new URL(page.url()).pathname).toBe("/COURSES");
  expect(browserErrors).toEqual([]);
});

test("compiled learning route loads the same-origin adaptive HLS manifest", async ({
  page,
}) => {
  const manifestRequest = page.waitForRequest((request) =>
    /\/course-hls\/[a-z0-9-]+\/master\.m3u8(?:\?.*)?$/.test(request.url()),
  );
  const manifestResponse = page.waitForResponse((response) =>
    /\/course-hls\/[a-z0-9-]+\/master\.m3u8(?:\?.*)?$/.test(response.url()),
  );
  await openApp(page, "/learn/typescript-course");
  await expect(
    page.getByRole("heading", {
      name: "The Beginning of a Design Journey",
      level: 1,
    }),
  ).toBeVisible();
  const player = page.getByRole("region", { name: /Lesson video player/ });
  await expect(player).toBeVisible();
  const mediaUrl = new URL((await manifestRequest).url());
  expect(mediaUrl.pathname).toMatch(/\/course-hls\/[a-z0-9-]+\/master\.m3u8$/);
  const mediaResponse = await manifestResponse;
  expect(mediaResponse.ok()).toBe(true);
  expect(mediaResponse.headers()["content-type"]).toMatch(
    /application\/(?:vnd\.apple\.)?mpegurl/i,
  );
  expect(await mediaResponse.text()).toContain("#EXTM3U");
});
