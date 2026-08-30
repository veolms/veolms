import { render } from "@testing-library/react";
import React from "react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AuthLayout from "../../src/routes/auth-layout.tsx";
import { useAuthAppearance } from "../../src/auth/useAuthAppearance.ts";
import { academyThemes } from "../../src/themes.ts";

vi.mock("../../src/auth/AuthBrandPanel.tsx", () => ({
  AuthBrandPanel: () => null,
}));

function AppearanceHarness() {
  useAuthAppearance();
  return null;
}

function storePalette(palette: string) {
  window.localStorage.setItem("veolms-academy-theme", palette);
  window.localStorage.setItem(
    "veolms-academy-theme-version",
    "veo-onyx-default-v2",
  );
}

beforeEach(() => {
  const root = document.documentElement;
  root.dataset.theme = "dark";
  root.dataset.palette = "codex";
  delete root.dataset.reduceAnimations;
  delete root.dataset.highContrast;
});

describe("useAuthAppearance", () => {
  it("uses the default academy appearance when no preference is stored", () => {
    render(<AppearanceHarness />);

    expect(document.documentElement.dataset.palette).toBe("codex");
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("uses the stored academy palette on auth screens", () => {
    storePalette("graphite");

    render(<AppearanceHarness />);

    expect(document.documentElement.dataset.palette).toBe("graphite");
  });

  it.each(
    academyThemes.flatMap(({ id }) =>
      (["light", "dark"] as const).map((themeMode) => [id, themeMode] as const),
    ),
  )("supports the %s academy palette in %s mode", (palette, themeMode) => {
    storePalette(palette);
    window.localStorage.setItem("veolms-theme", themeMode);

    render(<AppearanceHarness />);

    expect(document.documentElement.dataset.palette).toBe(palette);
    expect(document.documentElement.dataset.theme).toBe(themeMode);
  });

  it("uses the stored light or dark choice", () => {
    window.localStorage.setItem("veolms-theme", "light");

    render(<AppearanceHarness />);

    expect(document.documentElement.dataset.theme).toBe("light");
  });

  it("resolves the stored device choice from the operating-system theme", () => {
    window.localStorage.setItem("veolms-theme", "device");

    render(<AppearanceHarness />);

    expect(document.documentElement.dataset.appearance).toBe("device");
    expect(document.documentElement.dataset.theme).toBe("light");
  });

  it("hands the palette and mode back when the visitor leaves the auth screens", () => {
    const root = document.documentElement;
    root.dataset.palette = "ocean";
    root.dataset.theme = "light";

    const { unmount } = render(<AppearanceHarness />);
    unmount();

    expect(root.dataset.palette).toBe("ocean");
    expect(root.dataset.theme).toBe("light");
  });

  it("clears the palette and mode again when the page carried none", () => {
    const root = document.documentElement;
    delete root.dataset.palette;
    delete root.dataset.theme;

    const { unmount } = render(<AppearanceHarness />);
    unmount();

    expect(root.dataset.palette).toBeUndefined();
    expect(root.dataset.theme).toBeUndefined();
  });

  it("applies the stored reduce-animations preference", () => {
    window.localStorage.setItem("veolms-reduce-animations", "true");

    render(<AppearanceHarness />);

    expect(document.documentElement.dataset.reduceAnimations).toBe("true");
  });

  it("applies the stored high-contrast preference", () => {
    window.localStorage.setItem("veolms-high-contrast", "true");

    render(<AppearanceHarness />);

    expect(document.documentElement.dataset.highContrast).toBe("true");
  });

  it("leaves the accessibility toggles off when nothing is stored", () => {
    render(<AppearanceHarness />);

    expect(document.documentElement.dataset.reduceAnimations).toBe("false");
    expect(document.documentElement.dataset.highContrast).toBe("false");
  });

  it("renders quietly when storage cannot be read", () => {
    const consoleError = vi.spyOn(console, "error");
    vi.spyOn(window, "localStorage", "get").mockImplementation(() => {
      throw new Error("storage is disabled");
    });

    expect(() => render(<AppearanceHarness />)).not.toThrow();

    expect(document.documentElement.dataset.palette).toBe("codex");
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(consoleError).not.toHaveBeenCalled();
  });
});

describe("useAuthAppearance ?theme= preview", () => {
  afterEach(() => {
    window.history.replaceState(null, "", "/");
    vi.unstubAllEnvs();
  });

  it("lets a developer preview another palette on the auth screens", () => {
    window.history.replaceState(null, "", "/login?theme=grove");

    render(<AppearanceHarness />);

    expect(document.documentElement.dataset.palette).toBe("grove");
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("falls back to the saved appearance when the parameter names no palette", () => {
    window.history.replaceState(null, "", "/login?theme=not-a-real-palette");

    render(<AppearanceHarness />);

    expect(document.documentElement.dataset.palette).toBe("codex");
  });

  it("falls back to the saved appearance when the parameter is empty", () => {
    window.history.replaceState(null, "", "/login?theme=");

    render(<AppearanceHarness />);

    expect(document.documentElement.dataset.palette).toBe("codex");
  });

  it("is absent from a production build", () => {
    vi.stubEnv("DEV", false);
    window.history.replaceState(null, "", "/login?theme=grove");

    render(<AppearanceHarness />);

    expect(document.documentElement.dataset.palette).toBe("codex");
  });
});

describe("AuthLayout", () => {
  it("renders in the visitor's saved academy appearance", () => {
    storePalette("ocean");
    window.localStorage.setItem("veolms-theme", "light");

    render(
      <MemoryRouter initialEntries={["/login"]}>
        <AuthLayout />
      </MemoryRouter>,
    );

    expect(document.documentElement.dataset.palette).toBe("ocean");
    expect(document.documentElement.dataset.theme).toBe("light");
  });

  it("uses the saved appearance without adding an auth-only control", () => {
    const { container } = render(
      <MemoryRouter initialEntries={["/login"]}>
        <AuthLayout />
      </MemoryRouter>,
    );

    expect(container.querySelector(".auth-appearance")).toBeNull();
  });
});
