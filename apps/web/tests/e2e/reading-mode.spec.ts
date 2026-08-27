import { test, expect } from "./app.fixture.ts";
import {
  installBaselineState,
  openApp,
  expectAppearanceSettingsReady,
} from "./support.ts";

const READING_MODE_STORAGE_KEY = "veolms-reading-mode-v1";

test("reading mode persists, stays interactive, and covers viewport UI", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await installBaselineState(page);
  await openApp(page, "/settings/appearance");
  await expectAppearanceSettingsReady(page);

  const toggle = page.getByRole("switch", {
    name: "Reading mode",
    exact: true,
  });
  const temperature = page.getByRole("slider", {
    name: "Color temperature",
  });
  const texture = page.getByRole("slider", { name: "Texture" });
  const grainSize = page.getByRole("slider", { name: "Grain size" });

  await expect(toggle).toHaveAttribute("aria-checked", "false");
  await expect(temperature).toHaveValue("50");
  await expect(texture).toHaveValue("90");
  await expect(grainSize).toHaveValue("50");
  await expect(texture).toHaveCSS("--app-slider-track-height", "10px");

  await page.getByRole("switch", { name: "Turn reading mode on" }).click();
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  await page.getByRole("switch", { name: "Turn reading mode off" }).click();
  await expect(toggle).toHaveAttribute("aria-checked", "false");

  await texture.focus();
  await page.keyboard.press("ArrowRight");
  await expect(texture).toHaveValue("91");
  await texture.evaluate((input: HTMLInputElement) => {
    const setValue = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set;
    setValue?.call(input, "75");
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await expect(texture).toHaveValue("75");
  await temperature.evaluate((input: HTMLInputElement) => {
    const setValue = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set;
    setValue?.call(input, "85");
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await expect(temperature).toHaveValue("85");
  await expect(page.locator("html")).toHaveAttribute(
    "data-reading-mode",
    "false",
  );

  await toggle.click();
  await expect(page.locator("html")).toHaveAttribute(
    "data-reading-mode",
    "true",
  );

  const contrastRatios = await page
    .locator(
      ".settings-reading-mode__status.is-enabled, .settings-reading-mode__restore",
    )
    .evaluateAll((elements) => {
      const canvas = document.createElement("canvas");
      canvas.width = 1;
      canvas.height = 1;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) return [];

      const sample = (color: string) => {
        context.clearRect(0, 0, 1, 1);
        context.fillStyle = color;
        context.fillRect(0, 0, 1, 1);
        return Array.from(context.getImageData(0, 0, 1, 1).data).slice(0, 3);
      };
      const luminance = (rgb: number[]) => {
        const channels = rgb.map((value) => {
          const channel = value / 255;
          return channel <= 0.04045
            ? channel / 12.92
            : ((channel + 0.055) / 1.055) ** 2.4;
        });
        const [red = 0, green = 0, blue = 0] = channels;
        return red * 0.2126 + green * 0.7152 + blue * 0.0722;
      };

      return elements.map((element) => {
        const styles = getComputedStyle(element);
        const foreground = luminance(sample(styles.color));
        const background = luminance(sample(styles.backgroundColor));
        return (
          (Math.max(foreground, background) + 0.05) /
          (Math.min(foreground, background) + 0.05)
        );
      });
    });
  expect(contrastRatios).toHaveLength(1);
  for (const ratio of contrastRatios) expect(ratio).toBeGreaterThanOrEqual(4.5);
  await expect
    .poll(() =>
      page.evaluate((key) => {
        const value = localStorage.getItem(key);
        return value ? JSON.parse(value) : null;
      }, READING_MODE_STORAGE_KEY),
    )
    .toEqual({
      enabled: true,
      colorTemperature: 85,
      texture: 75,
      textureGrainSize: 50,
      colors: "full",
    });

  const effects = page.locator("[data-reading-mode-effects]");
  await expect(effects).toHaveCSS("position", "fixed");
  await expect(effects).toHaveCSS("pointer-events", "none");
  await expect(effects).toHaveCSS("user-select", "none");
  await expect(page.locator(".reading-mode-effects__texture")).toHaveCSS(
    "background-image",
    /reading-mode-grain(?:@(?:2x|3x))?\.webp/,
  );
  const [effectBounds, viewport] = await Promise.all([
    effects.evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      return {
        top: bounds.top,
        left: bounds.left,
        width: bounds.width,
        height: bounds.height,
      };
    }),
    page.evaluate(() => ({ width: innerWidth, height: innerHeight })),
  ]);
  expect(effectBounds).toEqual({ top: 0, left: 0, ...viewport });

  await page.setViewportSize({ width: 390, height: 844 });
  const mobileControlSizes = await Promise.all(
    [
      toggle,
      temperature,
      texture,
      grainSize,
      page.getByRole("switch", { name: "Turn reading mode off" }),
      page.getByRole("button", { name: "Restore defaults" }),
    ].map(async (control) => {
      const bounds = await control.boundingBox();
      return bounds ? { width: bounds.width, height: bounds.height } : null;
    }),
  );
  for (const size of mobileControlSizes) {
    expect(size).not.toBeNull();
    expect(size?.width).toBeGreaterThanOrEqual(44);
    expect(size?.height).toBeGreaterThanOrEqual(44);
  }
  await page
    .getByRole("navigation", { name: "Student mobile navigation" })
    .getByRole("button", { name: "More navigation options" })
    .click();
  await expect(page.getByRole("dialog", { name: /More/ })).toBeVisible();
  await expect(effects).toHaveCSS("display", "block");
  await page.keyboard.press("Escape");

  await page.reload();
  await expectAppearanceSettingsReady(page);
  await expect(page.locator("html")).toHaveAttribute(
    "data-reading-mode",
    "true",
  );
  await expect(texture).toHaveValue("75");
  await expect(grainSize).toHaveValue("50");

  await openApp(page, "/settings/learning");
  await expect(page.getByRole("tabpanel")).toHaveAttribute(
    "data-settings-tab",
    "learning",
  );
  await page.getByRole("button", { name: "Default video quality" }).click();
  const portalledSelect = page.locator(".themed-select__content");
  await expect(portalledSelect).toBeVisible();
  expect(
    await portalledSelect.evaluate(
      (element) => !document.getElementById("root")?.contains(element),
    ),
  ).toBe(true);
  expect(
    await effects.evaluate((element) =>
      Number.parseInt(getComputedStyle(element).zIndex, 10),
    ),
  ).toBeGreaterThan(
    await portalledSelect.evaluate((element) =>
      Number.parseInt(getComputedStyle(element).zIndex, 10),
    ),
  );
  await page.keyboard.press("Escape");
  await openApp(page, "/settings/appearance");
  await expectAppearanceSettingsReady(page);
  await expect(page.getByRole("tabpanel")).toHaveAttribute(
    "data-settings-tab",
    "appearance",
  );

  await page.getByRole("button", { name: "Restore defaults" }).click();
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  await expect(temperature).toHaveValue("50");
  await expect(texture).toHaveValue("90");
  await expect(grainSize).toHaveValue("50");
});

test("grain size control persists and scales the paper texture", async ({
  page,
}) => {
  await installBaselineState(page);
  await openApp(page, "/settings/appearance");
  await expectAppearanceSettingsReady(page);

  const grainSize = page.getByRole("slider", { name: "Grain size" });
  const textureLayer = page.locator(".reading-mode-effects__texture");
  const previewTexture = page.locator(
    ".settings-reading-mode__preview-texture",
  );

  await expect(grainSize).toHaveValue("50");
  await expect(grainSize).toHaveAttribute("aria-valuetext", "50% grain size");
  await grainSize.fill("75");

  await expect(grainSize).toHaveValue("75");
  await expect(page.locator("html")).toHaveCSS(
    "--reading-mode-texture-tile-size",
    "384.00px",
  );
  await expect(textureLayer).toHaveCSS("background-size", "384px 384px");
  await expect(previewTexture).toHaveCSS("background-size", "384px 384px");
  await expect
    .poll(() =>
      page.evaluate((key) => {
        const value = localStorage.getItem(key);
        return value ? JSON.parse(value).textureGrainSize : null;
      }, READING_MODE_STORAGE_KEY),
    )
    .toBe(75);

  await page.reload();
  await expectAppearanceSettingsReady(page);
  await expect(grainSize).toHaveValue("75");

  await page.getByRole("button", { name: "Restore defaults" }).click();
  await expect(grainSize).toHaveValue("50");
  await expect(page.locator("html")).toHaveCSS(
    "--reading-mode-texture-tile-size",
    "256.00px",
  );
});

test("neutral temperature and zero texture leave every effect layer inactive", async ({
  page,
}) => {
  await installBaselineState(page);
  await openApp(page, "/courses");
  const textureLayer = page.locator(".reading-mode-effects__texture");
  const temperatureLayer = page.locator(".reading-mode-effects__temperature");
  await expect(textureLayer).toHaveCSS("display", "none");
  await expect(temperatureLayer).toHaveCSS("display", "none");

  await page.evaluate((key) => {
    localStorage.setItem(
      key,
      JSON.stringify({ enabled: true, colorTemperature: 50, texture: 0 }),
    );
    window.dispatchEvent(new CustomEvent("veolms:reading-mode-change"));
  }, READING_MODE_STORAGE_KEY);
  await expect(page.locator("html")).toHaveAttribute(
    "data-reading-mode",
    "true",
  );
  await expect(page.locator("html")).toHaveAttribute(
    "data-reading-mode-texture",
    "false",
  );
  await expect(page.locator("html")).toHaveAttribute(
    "data-reading-mode-temperature",
    "false",
  );
  await expect(textureLayer).toHaveCSS("display", "none");
  await expect(temperatureLayer).toHaveCSS("display", "none");
  await expect(textureLayer).toHaveCSS("opacity", "0");
  await expect(temperatureLayer).toHaveCSS("opacity", "0");
});

test("reading mode effects and preview are disabled for print", async ({
  page,
}) => {
  await installBaselineState(page, {
    local: {
      [READING_MODE_STORAGE_KEY]: JSON.stringify({
        enabled: true,
        colorTemperature: 100,
        texture: 100,
      }),
    },
  });
  await openApp(page, "/settings/appearance");
  await expectAppearanceSettingsReady(page);
  await expect(page.locator("[data-reading-mode-effects]")).toHaveCSS(
    "display",
    "block",
  );
  await expect(
    page.locator(".settings-reading-mode__preview-texture"),
  ).toHaveCSS("display", "block");
  await expect(
    page.locator(".settings-reading-mode__preview-temperature"),
  ).toHaveCSS("display", "block");

  await page.emulateMedia({ media: "print" });
  await expect(page.locator("[data-reading-mode-effects]")).toHaveCSS(
    "display",
    "none",
  );
  await expect(
    page.locator(".settings-reading-mode__preview-texture"),
  ).toHaveCSS("display", "none");
  await expect(
    page.locator(".settings-reading-mode__preview-temperature"),
  ).toHaveCSS("display", "none");
});
