import { describe, expect, it, vi } from "vitest";
import {
  ACADEMY_THEME_VERSION,
  academyThemes,
  getInitialAcademyTheme,
  getThemeRotationPreferences,
  persistAcademyTheme,
  persistThemeRotationPreferences,
  pickRandomAcademyTheme,
} from "../../src/themes.js";

describe("academy theme persistence", () => {
  it("defaults to Veo Onyx when no compatible preference exists", () => {
    expect(getInitialAcademyTheme()).toBe("codex");

    localStorage.setItem("veolms-academy-theme", "ocean");
    expect(getInitialAcademyTheme()).toBe("codex");
  });

  it("restores a known palette only for the current preference version", () => {
    localStorage.setItem("veolms-academy-theme-version", ACADEMY_THEME_VERSION);
    localStorage.setItem("veolms-academy-theme", "ocean");
    expect(getInitialAcademyTheme()).toBe("ocean");

    localStorage.setItem("veolms-academy-theme", "not-a-palette");
    expect(getInitialAcademyTheme()).toBe("codex");
  });

  it("writes the palette and compatibility version together", () => {
    persistAcademyTheme("rose");

    expect(localStorage.getItem("veolms-academy-theme")).toBe("rose");
    expect(localStorage.getItem("veolms-academy-theme-version")).toBe(
      ACADEMY_THEME_VERSION,
    );
  });

  it("keeps one shared order with the requested leading themes", () => {
    const ids = academyThemes.map(({ id }) => id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toHaveLength(16);
    expect(ids.slice(0, 3)).toEqual(["codex", "ocean", "midnight"]);
    expect(ids.slice(-4)).toEqual(["brainwave", "lilac", "champagne", "lime"]);
    expect(academyThemes.find(({ id }) => id === "violet")?.name).toBe(
      "Copper Slate",
    );
  });
});

describe("academy theme rotation", () => {
  it("defaults to a disabled rotation containing every theme", () => {
    expect(getThemeRotationPreferences()).toEqual({
      enabled: false,
      pool: academyThemes.map(({ id }) => id),
    });
  });

  it("persists a valid user-selected pool", () => {
    persistThemeRotationPreferences({
      enabled: true,
      pool: ["codex", "ocean", "midnight"],
    });

    expect(getThemeRotationPreferences()).toEqual({
      enabled: true,
      pool: ["codex", "ocean", "midnight"],
    });
  });

  it("repairs invalid or ineffective pools to the complete theme set", () => {
    persistThemeRotationPreferences({ enabled: true, pool: ["unknown"] });

    expect(getThemeRotationPreferences().pool).toEqual(
      academyThemes.map(({ id }) => id),
    );
  });

  it("picks from the pool and avoids immediately repeating the current theme", () => {
    expect(
      pickRandomAcademyTheme(["codex", "ocean", "midnight"], "codex", () => 0),
    ).toBe("ocean");
    expect(
      pickRandomAcademyTheme(
        ["codex", "ocean", "midnight"],
        "codex",
        () => 0.999,
      ),
    ).toBe("midnight");
  });

  it("chooses once and remains stable throughout the app session", () => {
    localStorage.setItem("veolms-academy-theme-version", ACADEMY_THEME_VERSION);
    localStorage.setItem("veolms-academy-theme", "codex");
    persistThemeRotationPreferences({
      enabled: true,
      pool: ["ocean", "midnight"],
    });
    sessionStorage.clear();
    vi.spyOn(Math, "random").mockReturnValue(0);

    expect(getInitialAcademyTheme()).toBe("ocean");
    expect(getInitialAcademyTheme()).toBe("ocean");
    expect(sessionStorage.getItem("veolms-session-academy-theme")).toBe(
      "ocean",
    );
  });

  it("keeps the active theme until a genuinely new app session", () => {
    persistAcademyTheme("graphite");
    persistThemeRotationPreferences({
      enabled: true,
      pool: ["ocean", "midnight"],
    });
    vi.spyOn(Math, "random").mockReturnValue(0);

    expect(getInitialAcademyTheme()).toBe("graphite");

    sessionStorage.clear();
    expect(getInitialAcademyTheme()).toBe("ocean");
  });
});
