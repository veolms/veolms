import { afterEach, describe, expect, it } from "vitest";
import { installTabFocusVisibility } from "../../src/accessibility/tabFocusVisibility";

describe("tab focus visibility", () => {
  let cleanup: (() => void) | undefined;

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
    document.documentElement.dataset.tabNavigation = "false";
  });

  it("shows focus outlines only after Tab navigation", () => {
    const root = document.documentElement;
    root.dataset.tabNavigation = "false";
    cleanup = installTabFocusVisibility(root);

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "f" }));
    expect(root.dataset.tabNavigation).toBe("false");

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab" }));
    expect(root.dataset.tabNavigation).toBe("true");

    window.dispatchEvent(new Event("pointerdown"));
    expect(root.dataset.tabNavigation).toBe("false");
  });

  it("clears visible focus outlines across fullscreen transitions", () => {
    const root = document.documentElement;
    root.dataset.tabNavigation = "true";
    cleanup = installTabFocusVisibility(root);

    document.dispatchEvent(new Event("fullscreenchange"));

    expect(root.dataset.tabNavigation).toBe("false");
  });
});
