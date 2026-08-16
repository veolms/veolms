import { test, expect } from "./app.fixture.ts";
import { installBaselineState, openApp } from "./support.ts";

test.beforeEach(async ({ page }) => {
  await installBaselineState(page);
});

test("compiled client serves direct routes and bundled course artwork", async ({
  page,
}) => {
  await openApp(page, "/");
  await expect(
    page.getByRole("heading", { name: /Good evening, Ashi/ }),
  ).toBeVisible();

  await page.goto("/explore-courses");
  await expect(
    page.getByRole("heading", { name: "Explore Courses", level: 1 }),
  ).toBeVisible();
  const courseImages = page
    .getByRole("region", { name: "Explore Courses" })
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
});

test("compiled learning route keeps the deployment-provided course-media URL contract", async ({
  page,
}) => {
  await openApp(page, "/learn/typescript-course");
  await expect(
    page.getByRole("heading", {
      name: "The Beginning of a Design Journey",
      level: 1,
    }),
  ).toBeVisible();
  const player = page.getByRole("region", { name: /Lesson video player/ });
  await expect(player).toBeVisible();
  const video = player.locator("video");
  const mediaSource = await video.getAttribute("src");
  expect(mediaSource).not.toBeNull();
  const mediaUrl = new URL(mediaSource!, page.url());
  expect(mediaUrl.pathname).toMatch(/\/course-videos\/.+\.mp4$/);
  expect(mediaUrl.pathname).toContain("%20");
});
