import { test, expect } from "./app.fixture.ts";
import { installBaselineState, openApp, prepareVisualPage } from "./support.ts";

test.describe("@visual", () => {
  test("student Home desktop · dark Graphite", async ({ page }) => {
    await installBaselineState(page);
    await openApp(page, "/");
    await prepareVisualPage(page);
    await expect(page).toHaveScreenshot("student-home-dark.png", {
      fullPage: true,
    });
  });

  test("Courses desktop · dark Graphite", async ({ page }) => {
    await installBaselineState(page);
    await openApp(page, "/courses");
    await prepareVisualPage(page);
    await expect(page).toHaveScreenshot("courses-dark.png", { fullPage: true });
  });

  test("Courses desktop · light Ocean", async ({ page }) => {
    await installBaselineState(page, {
      local: {
        "veolms-theme": "light",
        "veolms-academy-theme": "ocean",
        "veolms-academy-theme-version": "veo-onyx-default-v2",
      },
    });
    await openApp(page, "/courses");
    await prepareVisualPage(page);
    await expect(page).toHaveScreenshot("courses-light-ocean.png", {
      fullPage: true,
    });
  });

  test("creator Dashboard desktop · dark Graphite", async ({ page }) => {
    await installBaselineState(page, { local: { "veolms-role": "creator" } });
    await openApp(page, "/");
    await prepareVisualPage(page);
    await expect(page).toHaveScreenshot("creator-dashboard-dark.png", {
      fullPage: true,
    });
  });

  test("Settings Appearance desktop · light Graphite", async ({ page }) => {
    await installBaselineState(page, { local: { "veolms-theme": "light" } });
    await openApp(page, "/settings/appearance");
    await prepareVisualPage(page);
    await expect(page).toHaveScreenshot("settings-appearance-light.png", {
      fullPage: true,
    });
  });

  test("Settings Sidebar desktop · dark Graphite", async ({ page }) => {
    await installBaselineState(page);
    await openApp(page, "/settings/sidebar");
    await prepareVisualPage(page);
    await expect(page).toHaveScreenshot("settings-sidebar-dark.png", {
      fullPage: true,
    });
  });

  test("Settings Profile desktop · dark Graphite", async ({ page }) => {
    await installBaselineState(page);
    await openApp(page, "/settings/profile");
    await prepareVisualPage(page);
    await expect(page).toHaveScreenshot("settings-profile-dark.png", {
      fullPage: true,
    });
  });

  test("Settings Profile desktop · light Graphite", async ({ page }) => {
    await installBaselineState(page, { local: { "veolms-theme": "light" } });
    await openApp(page, "/settings/profile");
    await prepareVisualPage(page);
    await expect(page).toHaveScreenshot("settings-profile-light.png", {
      fullPage: true,
    });
  });

  test("Settings Profile mobile · dark Graphite", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await installBaselineState(page);
    await openApp(page, "/settings/profile");
    await prepareVisualPage(page);
    await expect(page).toHaveScreenshot("settings-profile-mobile-dark.png", {
      fullPage: true,
    });
  });

  test("Settings Profile mobile · light Graphite", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await installBaselineState(page, { local: { "veolms-theme": "light" } });
    await openApp(page, "/settings/profile");
    await prepareVisualPage(page);
    await expect(page).toHaveScreenshot("settings-profile-mobile-light.png", {
      fullPage: true,
    });
  });

  test("Settings Appearance mobile · dark Graphite", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await installBaselineState(page);
    await openApp(page, "/settings/appearance");
    await prepareVisualPage(page);
    await expect(page).toHaveScreenshot("settings-appearance-mobile-dark.png", {
      fullPage: true,
    });
  });

  test("Discussions mobile · dark Graphite", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await installBaselineState(page);
    await openApp(page, "/discussions/q-and-a");
    await prepareVisualPage(page);
    await expect(page).toHaveScreenshot("discussions-mobile-dark.png", {
      fullPage: true,
    });
  });

  test("Notifications placeholder mobile · dark Graphite", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await installBaselineState(page);
    await openApp(page, "/notifications");
    await prepareVisualPage(page);
    await expect(page).toHaveScreenshot("notifications-mobile-dark.png", {
      fullPage: true,
    });
  });

  test("learning workspace desktop · dark Graphite", async ({ page }) => {
    await installBaselineState(page);
    await openApp(page, "/learn/typescript-course");
    await prepareVisualPage(page);
    await expect(page).toHaveScreenshot("learning-workspace-dark.png", {
      fullPage: true,
    });
  });

  test("player sliders desktop · dark Graphite", async ({ page }) => {
    await installBaselineState(page);
    await openApp(page, "/learn/typescript-course");
    const player = page.getByRole("region", {
      name: /Lesson video player for The Beginning of a Design Journey/,
    });
    await player.locator("video").evaluate((element: HTMLVideoElement) => {
      element.pause();
      element.currentTime = 0;
      element.dispatchEvent(new Event("timeupdate"));
    });
    const volume = player.getByRole("slider", { name: "Volume" });
    await volume.focus();
    await expect(volume).toHaveCSS("width", "72px");
    await prepareVisualPage(page);
    await expect(player).toHaveScreenshot("player-sliders-dark.png");
  });

  test("Courses mobile · dark Graphite", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await installBaselineState(page);
    await openApp(page, "/courses");
    await prepareVisualPage(page);
    await expect(page).toHaveScreenshot("courses-mobile-dark.png", {
      fullPage: true,
    });
  });

  test("learning drawer mobile · dark Graphite", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await installBaselineState(page);
    await openApp(page, "/learn/typescript-course");
    await page.getByRole("button", { name: "Open course lessons" }).click();
    await expect(
      page.getByRole("dialog", { name: "Course lessons" }),
    ).toBeVisible();
    await prepareVisualPage(page);
    await expect(page).toHaveScreenshot("learning-drawer-mobile-dark.png", {
      fullPage: true,
    });
  });
});
