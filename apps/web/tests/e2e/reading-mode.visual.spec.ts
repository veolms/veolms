import { test, expect } from "./app.fixture.ts";
import { installBaselineState, openApp, prepareVisualPage } from "./support.ts";

const READING_MODE_STORAGE_KEY = "veolms-reading-mode-v1";

interface ReadingModeVisualState {
  id: string;
  enabled: boolean;
  colorTemperature: number;
  texture: number;
}

const visualStates: readonly ReadingModeVisualState[] = [
  { id: "disabled", enabled: false, colorTemperature: 50, texture: 0 },
  { id: "texture-0", enabled: true, colorTemperature: 50, texture: 0 },
  { id: "texture-25", enabled: true, colorTemperature: 50, texture: 25 },
  { id: "texture-50", enabled: true, colorTemperature: 50, texture: 50 },
  { id: "texture-75", enabled: true, colorTemperature: 50, texture: 75 },
  { id: "texture-100", enabled: true, colorTemperature: 50, texture: 100 },
  { id: "temperature-0", enabled: true, colorTemperature: 0, texture: 0 },
  { id: "temperature-50", enabled: true, colorTemperature: 50, texture: 0 },
  { id: "temperature-100", enabled: true, colorTemperature: 100, texture: 0 },
  { id: "warm-texture-75", enabled: true, colorTemperature: 85, texture: 75 },
  { id: "warm-texture-100", enabled: true, colorTemperature: 85, texture: 100 },
];

test.describe("@visual reading mode", () => {
  for (const viewport of ["desktop", "mobile"] as const) {
    for (const state of visualStates) {
      test(`${state.id} ${viewport}`, async ({ page }) => {
        if (viewport === "mobile") {
          await page.setViewportSize({ width: 390, height: 844 });
        }
        await installBaselineState(page, {
          local: {
            [READING_MODE_STORAGE_KEY]: JSON.stringify({
              enabled: state.enabled,
              colorTemperature: state.colorTemperature,
              texture: state.texture,
            }),
          },
        });
        await openApp(page, "/explore-courses");
        await prepareVisualPage(page);
        await expect(page).toHaveScreenshot(
          `reading-mode-${state.id}-${viewport}.png`,
        );
      });
    }
  }

  for (const viewport of ["desktop", "mobile"] as const) {
    test(`Appearance controls ${viewport}`, async ({ page }) => {
      if (viewport === "mobile") {
        await page.setViewportSize({ width: 390, height: 844 });
      }
      await installBaselineState(page, {
        local: {
          [READING_MODE_STORAGE_KEY]: JSON.stringify({
            enabled: true,
            colorTemperature: 85,
            texture: 75,
          }),
        },
      });
      await openApp(page, "/settings/appearance");
      await prepareVisualPage(page);
      await expect(page.locator(".settings-reading-mode")).toHaveScreenshot(
        `reading-mode-settings-${viewport}.png`,
      );
    });
  }

  test("light mode maximum texture", async ({ page }) => {
    await installBaselineState(page, {
      local: {
        "veolms-theme": "light",
        [READING_MODE_STORAGE_KEY]: JSON.stringify({
          enabled: true,
          colorTemperature: 50,
          texture: 100,
        }),
      },
    });
    await openApp(page, "/explore-courses");
    await prepareVisualPage(page);
    await expect(page.locator(".reading-mode-effects__texture")).toHaveCSS(
      "mix-blend-mode",
      "multiply",
    );
    await expect(page).toHaveScreenshot(
      "reading-mode-texture-100-light-desktop.png",
    );
  });
});

test.describe("@visual reading mode high density", () => {
  test.use({ deviceScaleFactor: 2 });

  for (const texture of [0, 75, 100] as const) {
    test(`texture ${texture} desktop DPR2`, async ({ page }) => {
      await installBaselineState(page, {
        local: {
          [READING_MODE_STORAGE_KEY]: JSON.stringify({
            enabled: true,
            colorTemperature: 50,
            texture,
          }),
        },
      });
      await openApp(page, "/explore-courses");
      await prepareVisualPage(page);
      const textureLayer = page.locator(".reading-mode-effects__texture");
      await expect(textureLayer).toHaveCSS("background-size", "512px 512px");
      if (texture > 0) {
        await expect
          .poll(() =>
            page.evaluate(() =>
              performance
                .getEntriesByType("resource")
                .some((entry) =>
                  entry.name.endsWith("reading-mode-grain@2x.png"),
                ),
            ),
          )
          .toBe(true);
      }
      await expect(page).toHaveScreenshot(
        `reading-mode-texture-${texture}-desktop-dpr2.png`,
      );
    });
  }
});

test.describe("reading mode extra-high density", () => {
  test.use({ deviceScaleFactor: 3 });

  test("@visual retains visible grain scale on a DPR3 mobile display", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await installBaselineState(page, {
      local: {
        [READING_MODE_STORAGE_KEY]: JSON.stringify({
          enabled: true,
          colorTemperature: 50,
          texture: 100,
        }),
      },
    });
    await openApp(page, "/explore-courses");
    await prepareVisualPage(page);
    await expect(page.locator(".reading-mode-effects__texture")).toHaveCSS(
      "background-size",
      "768px 768px",
    );
    await expect
      .poll(() =>
        page.evaluate(() =>
          performance
            .getEntriesByType("resource")
            .some((entry) => entry.name.endsWith("reading-mode-grain@3x.png")),
        ),
      )
      .toBe(true);
    await expect(page).toHaveScreenshot(
      "reading-mode-texture-100-mobile-dpr3.png",
    );
  });
});
