import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyReadingModePreferences,
  getReadingModeBootstrapScript,
  getReadingModeTextureGrainScale,
  getReadingModeTextureTileSize,
  getReadingModeVisuals,
  normalizeReadingModePreferences,
  persistReadingModePreferences,
  READING_MODE_DEFAULTS,
  READING_MODE_STORAGE_KEY,
  readReadingModePreferences,
} from "../../src/reading-mode/readingModePreferences.ts";
import { ReadingModeSettings } from "../../src/settings/ReadingModeSettings.tsx";

beforeEach(() => {
  delete document.documentElement.dataset.readingMode;
  delete document.documentElement.dataset.readingModeColors;
  document.documentElement.removeAttribute("style");
});

describe("reading mode preferences", () => {
  it("uses disabled, neutral defaults with paper texture set to 90%", () => {
    expect(readReadingModePreferences()).toEqual(READING_MODE_DEFAULTS);
  });

  it("normalizes malformed and out-of-range stored values", () => {
    expect(
      normalizeReadingModePreferences({
        enabled: "yes",
        colorTemperature: 140,
        texture: -12,
        textureGrainSize: 140,
      }),
    ).toEqual({
      enabled: false,
      colorTemperature: 100,
      texture: 0,
      textureGrainSize: 100,
      colors: "full",
    });
    expect(
      normalizeReadingModePreferences({
        colorTemperature: "",
        texture: null,
        textureGrainSize: null,
      }),
    ).toMatchObject({
      colorTemperature: 50,
      texture: 90,
      textureGrainSize: 50,
    });
    expect(
      normalizeReadingModePreferences({
        colorTemperature: "25",
        texture: "75",
        textureGrainSize: "25",
      }),
    ).toMatchObject({
      colorTemperature: 25,
      texture: 75,
      textureGrainSize: 25,
    });
  });

  it("keeps bootstrap normalization in parity with runtime preferences", () => {
    localStorage.setItem(
      READING_MODE_STORAGE_KEY,
      JSON.stringify({
        enabled: true,
        colorTemperature: "",
        texture: null,
        textureGrainSize: null,
        colors: "light",
      }),
    );

    window.eval(getReadingModeBootstrapScript());

    expect(document.documentElement).toHaveAttribute(
      "data-reading-mode",
      "true",
    );
    expect(document.documentElement).toHaveAttribute(
      "data-reading-mode-colors",
      "light",
    );
    expect(
      document.documentElement.style.getPropertyValue(
        "--reading-mode-temperature-opacity",
      ),
    ).toBe("0.00000");
    expect(
      document.documentElement.style.getPropertyValue(
        "--reading-mode-texture-opacity-dark",
      ),
    ).toBe(
      getReadingModeVisuals(READING_MODE_DEFAULTS).textureOpacityDark.toFixed(
        5,
      ),
    );
    expect(
      document.documentElement.style.getPropertyValue(
        "--reading-mode-texture-tile-size",
      ),
    ).toBe("256.00px");
  });

  it("accepts each color treatment and falls back to full colors", () => {
    expect(normalizeReadingModePreferences({ colors: "light" }).colors).toBe(
      "light",
    );
    expect(
      normalizeReadingModePreferences({ colors: "black-and-white" }).colors,
    ).toBe("black-and-white");
    expect(
      normalizeReadingModePreferences({ colors: "unsupported" }).colors,
    ).toBe("full");
  });

  it("uses the nonlinear texture curve and a truly neutral midpoint", () => {
    const zero = getReadingModeVisuals({ colorTemperature: 50, texture: 0 });
    const medium = getReadingModeVisuals({
      colorTemperature: 50,
      texture: 75,
    });
    const maximum = getReadingModeVisuals({
      colorTemperature: 100,
      texture: 100,
    });

    expect(zero.textureOpacityDark).toBe(0);
    expect(zero.temperatureOpacity).toBe(0);
    expect(medium.textureStrength).toBeCloseTo(Math.pow(0.75, 1.3), 6);
    expect(medium.textureOpacityDark).toBeCloseTo(0.15136, 4);
    expect(maximum.textureOpacityDark).toBe(0.22);
    expect(maximum.textureOpacityLight).toBe(0.1);
    expect(maximum.temperatureOpacity).toBe(0.3);
  });

  it("maps grain size around the existing default at each pixel density", () => {
    expect(getReadingModeTextureGrainScale(0)).toBe(0.5);
    expect(getReadingModeTextureGrainScale(50)).toBe(1);
    expect(getReadingModeTextureGrainScale(100)).toBe(2);
    expect(getReadingModeTextureTileSize(50, 1)).toBe(256);
    expect(getReadingModeTextureTileSize(75, 2)).toBe(768);
    expect(getReadingModeTextureTileSize(100, 3)).toBe(1536);
  });

  it("applies and persists one coherent preference object", () => {
    const preferences = persistReadingModePreferences({
      enabled: true,
      colorTemperature: 80,
      texture: 75,
      textureGrainSize: 75,
      colors: "black-and-white",
    });

    expect(
      JSON.parse(localStorage.getItem(READING_MODE_STORAGE_KEY) || ""),
    ).toEqual(preferences);
    expect(document.documentElement).toHaveAttribute(
      "data-reading-mode",
      "true",
    );
    expect(document.documentElement).toHaveAttribute(
      "data-reading-mode-colors",
      "black-and-white",
    );
    expect(
      document.documentElement.style.getPropertyValue(
        "--reading-mode-texture-opacity-dark",
      ),
    ).toBe("0.15136");
    expect(
      document.documentElement.style.getPropertyValue(
        "--reading-mode-texture-tile-size",
      ),
    ).toBe("384.00px");

    applyReadingModePreferences({ ...preferences, enabled: false });
    expect(
      document.documentElement.style.getPropertyValue(
        "--reading-mode-temperature-opacity",
      ),
    ).toBe("0");
  });

  it("applies and announces changes when local storage is blocked", () => {
    const changed = vi.fn();
    window.addEventListener("veolms:reading-mode-change", changed);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Blocked", "SecurityError");
    });

    expect(() =>
      persistReadingModePreferences({
        enabled: true,
        colorTemperature: 65,
        texture: 80,
        textureGrainSize: 50,
        colors: "full",
      }),
    ).not.toThrow();
    expect(document.documentElement).toHaveAttribute(
      "data-reading-mode",
      "true",
    );
    expect(changed).toHaveBeenCalledTimes(1);
    window.removeEventListener("veolms:reading-mode-change", changed);
  });
});

describe("reading mode settings", () => {
  it("synchronizes quick-setting changes made in the same tab", () => {
    render(<ReadingModeSettings />);

    act(() => {
      persistReadingModePreferences({
        enabled: true,
        colorTemperature: 30,
        texture: 45,
        textureGrainSize: 35,
        colors: "light",
      });
    });

    expect(
      screen.getByRole("slider", { name: "Color temperature" }),
    ).toHaveValue("30");
    expect(screen.getByRole("slider", { name: "Texture" })).toHaveValue("45");
    expect(
      screen.getByRole("slider", { name: "Grain size" }),
    ).toHaveValue("35");
    expect(
      screen.getByRole("button", { name: /Reading mode colors:/ }),
    ).toHaveTextContent("Light colors");
  });

  it("preserves configured values while disabled and restores only the sliders", () => {
    render(<ReadingModeSettings />);

    const toggle = screen.getByRole("switch", { name: "Reading mode" });
    const temperature = screen.getByRole("slider", {
      name: "Color temperature",
    });
    const texture = screen.getByRole("slider", { name: "Texture" });
    const grainSize = screen.getByRole("slider", {
      name: "Grain size",
    });
    const colors = screen.getByRole("button", {
      name: /Reading mode colors:/,
    });
    const restore = screen.getByRole("button", { name: "Restore defaults" });
    const quickToggle = screen.getByRole("switch", {
      name: "Turn reading mode on",
    });
    const previewGuidance = screen.getByText(
      "Tune the preview first, then enable reading mode when it feels right.",
    );

    expect(toggle).toHaveAttribute("aria-checked", "false");
    expect(temperature).toHaveValue("50");
    expect(texture).toHaveValue("90");
    expect(grainSize).toHaveValue("50");
    expect(colors).toHaveTextContent("Full colors");
    expect(restore).toBeDisabled();
    expect(previewGuidance).toBeVisible();
    expect(quickToggle).toHaveAttribute("aria-checked", "false");

    fireEvent.click(quickToggle);
    expect(toggle).toHaveAttribute("aria-checked", "true");
    expect(quickToggle).toHaveAttribute("aria-checked", "true");
    expect(quickToggle).toHaveAccessibleName("Turn reading mode off");

    fireEvent.click(quickToggle);
    expect(toggle).toHaveAttribute("aria-checked", "false");

    fireEvent.change(temperature, { target: { value: "85" } });
    fireEvent.change(texture, { target: { value: "75" } });
    fireEvent.change(grainSize, { target: { value: "75" } });
    expect(texture.getAttribute("style")).toContain(
      "--app-slider-progress: 75%",
    );
    expect(document.documentElement).toHaveAttribute(
      "data-reading-mode",
      "false",
    );
    expect(texture).toHaveValue("75");
    expect(grainSize).toHaveValue("75");
    expect(
      document.documentElement.style.getPropertyValue(
        "--reading-mode-texture-tile-size",
      ),
    ).toBe("384.00px");

    fireEvent.click(toggle);
    expect(document.documentElement).toHaveAttribute(
      "data-reading-mode",
      "true",
    );
    expect(previewGuidance).toBeVisible();
    expect(quickToggle).toHaveAttribute("aria-checked", "true");

    fireEvent.click(toggle);
    expect(texture).toHaveValue("75");
    expect(temperature).toHaveValue("85");
    expect(grainSize).toHaveValue("75");

    fireEvent.click(restore);
    expect(toggle).toHaveAttribute("aria-checked", "false");
    expect(temperature).toHaveValue("50");
    expect(texture).toHaveValue("90");
    expect(grainSize).toHaveValue("50");

    fireEvent.click(toggle);
    fireEvent.change(temperature, { target: { value: "15" } });
    fireEvent.change(texture, { target: { value: "20" } });
    fireEvent.change(grainSize, { target: { value: "90" } });
    fireEvent.click(restore);
    expect(toggle).toHaveAttribute("aria-checked", "true");
    expect(temperature).toHaveValue("50");
    expect(texture).toHaveValue("90");
    expect(grainSize).toHaveValue("50");
  });
});
