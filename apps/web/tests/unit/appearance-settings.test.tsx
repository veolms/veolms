import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppearanceSettings } from "../../src/settings/AppearanceSettings.js";

describe("AppearanceSettings", () => {
  it("places theme rotation directly after color theme", () => {
    render(
      <AppearanceSettings
        theme="dark"
        academyTheme="codex"
        pageTabColors="follow-sidebar"
        onPageTabColorsChange={vi.fn()}
      />,
    );

    const sectionHeadings = screen
      .getAllByRole("heading", { level: 2 })
      .map((heading) => heading.textContent);

    expect(sectionHeadings.slice(0, 3)).toEqual([
      "Display mode",
      "Color theme",
      "Theme rotation",
    ]);
  });
});
