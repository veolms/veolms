import { render } from "@testing-library/react";
import React from "react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AuthLayout from "../../src/routes/auth-layout.tsx";
import { useAuthAppearance } from "../../src/auth/useAuthAppearance.ts";

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
  it("holds the auth screens on the palette the sign-in artwork is drawn for", () => {
    render(<AppearanceHarness />);

    expect(document.documentElement.dataset.palette).toBe("midnight");
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("ignores a stored palette, because nobody is signed in yet", () => {
    storePalette("graphite");

    render(<AppearanceHarness />);

    expect(document.documentElement.dataset.palette).toBe("midnight");
  });

  it("ignores a stored light or dark choice", () => {
    window.localStorage.setItem("veolms-theme", "light");

    render(<AppearanceHarness />);

    expect(document.documentElement.dataset.theme).toBe("dark");
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

    expect(document.documentElement.dataset.palette).toBe("midnight");
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

  it("stays locked when the parameter names no palette", () => {
    window.history.replaceState(null, "", "/login?theme=not-a-real-palette");

    render(<AppearanceHarness />);

    expect(document.documentElement.dataset.palette).toBe("midnight");
  });

  it("stays locked when the parameter is empty", () => {
    window.history.replaceState(null, "", "/login?theme=");

    render(<AppearanceHarness />);

    expect(document.documentElement.dataset.palette).toBe("midnight");
  });

  it("is absent from a production build", () => {
    vi.stubEnv("DEV", false);
    window.history.replaceState(null, "", "/login?theme=grove");

    render(<AppearanceHarness />);

    expect(document.documentElement.dataset.palette).toBe("midnight");
  });
});

describe("AuthLayout", () => {
  it("renders in the fixed auth appearance whatever the visitor stored", () => {
    storePalette("ocean");
    window.localStorage.setItem("veolms-theme", "light");

    render(
      <MemoryRouter initialEntries={["/login"]}>
        <AuthLayout />
      </MemoryRouter>,
    );

    expect(document.documentElement.dataset.palette).toBe("midnight");
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("offers no appearance control, because the auth screens have one look", () => {
    const { container } = render(
      <MemoryRouter initialEntries={["/login"]}>
        <AuthLayout />
      </MemoryRouter>,
    );

    expect(container.querySelector(".auth-appearance")).toBeNull();
  });
});
