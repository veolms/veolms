import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AppSlider } from "../../src/AppSlider";

describe("AppSlider", () => {
  it("maps its value to a clamped progress fill", () => {
    const { rerender } = render(
      <AppSlider
        aria-label="Example"
        min={20}
        max={120}
        value={70}
        onChange={() => undefined}
      />,
    );
    const slider = screen.getByRole("slider", { name: "Example" });

    expect(slider).toHaveClass("app-slider", "app-slider--accent");
    expect(slider.getAttribute("style")).toContain(
      "--app-slider-progress: 50%",
    );

    rerender(
      <AppSlider
        aria-label="Example"
        min={20}
        max={120}
        value={160}
        variant="temperature"
        onChange={() => undefined}
      />,
    );
    expect(slider).toHaveClass("app-slider--temperature");
    expect(slider.getAttribute("style")).toContain(
      "--app-slider-progress: 100%",
    );
    expect(slider.getAttribute("style")).toContain(
      "--app-slider-thumb-accent: rgb(242 173 101)",
    );
  });

  it("uses an empty fill when the range is degenerate or malformed", () => {
    const { rerender } = render(
      <AppSlider aria-label="Degenerate" min={10} max={10} value={10} />,
    );
    const slider = screen.getByRole("slider", { name: "Degenerate" });
    expect(slider.getAttribute("style")).toContain("--app-slider-progress: 0%");

    rerender(
      <AppSlider aria-label="Degenerate" min="bad" max="bad" value="bad" />,
    );
    expect(slider.getAttribute("style")).toContain("--app-slider-progress: 0%");
  });
});
