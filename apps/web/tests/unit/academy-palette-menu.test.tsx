import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { AcademyPaletteMenu } from "../../src/shell/AcademyPaletteMenu.tsx";

const themes = [
  {
    id: "graphite",
    name: "Graphite",
    note: "Neutral dark",
    preview: "#1e1e1e",
    darkInk: false,
  },
  {
    id: "ocean",
    name: "Ocean Blue",
    note: "Cool contrast",
    preview: "#2277cc",
    darkInk: true,
  },
];

const gridThemes = [
  themes[0]!,
  themes[1]!,
  {
    id: "midnight",
    name: "Midnight Azure",
    note: "Deep blue",
    preview: "#4166d4",
    darkInk: false,
  },
  {
    id: "graphite-studio",
    name: "Graphite Studio",
    note: "Graphite & violet",
    preview: "#8b68ff",
    darkInk: false,
  },
  {
    id: "ember",
    name: "Ember Orange",
    note: "Warm & focused",
    preview: "#ff8a34",
    darkInk: true,
  },
  {
    id: "sunlit",
    name: "Sunlit Yellow",
    note: "Bright & optimistic",
    preview: "#f6c945",
    darkInk: true,
  },
  {
    id: "grove",
    name: "Grove Green",
    note: "Calm & grounded",
    preview: "#4dda85",
    darkInk: true,
  },
  {
    id: "rose",
    name: "Studio Rose",
    note: "Expressive & warm",
    preview: "#fb6f92",
    darkInk: true,
  },
];

describe("AcademyPaletteMenu", () => {
  it("renders selected state and delegates the selected theme id", () => {
    const onSelect = vi.fn();
    const onPreview = vi.fn();
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    const { container } = render(
      <AcademyPaletteMenu
        themes={themes}
        selectedTheme="ocean"
        className="sidebar-palette-menu mobile-palette-menu"
        id="mobile-theme-menu"
        mobile
        onSelect={onSelect}
        onPreview={onPreview}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );

    const menu = screen.getByRole("menu", { name: "Choose a color theme" });
    const selected = screen.getByRole("menuitemradio", { name: /Ocean Blue/ });

    expect(menu).toHaveClass("sidebar-palette-menu", "mobile-palette-menu");
    expect(menu).toHaveAttribute("id", "mobile-theme-menu");
    expect(menu).toHaveAttribute("data-mobile-palette-menu");
    expect(selected).toHaveAttribute("aria-checked", "true");
    expect(selected).toHaveClass("is-selected");
    expect(
      screen.getByRole("menuitemradio", { name: /Graphite/ }),
    ).toHaveAttribute("aria-checked", "false");
    expect(
      container.querySelector('[data-theme-swatch="graphite"]'),
    ).toHaveStyle({
      "--theme-swatch": "#1e1e1e",
    });
    expect(screen.queryByText("Ocean Blue")).not.toBeInTheDocument();

    fireEvent.click(selected);
    // fireEvent synthesizes clicks at the viewport origin, matching keyboard
    // activation: no reveal origin may be attributed.
    expect(onSelect).toHaveBeenCalledWith("ocean", undefined);
  });

  it("passes the pointer position as the reveal origin for pointer clicks", () => {
    const onSelect = vi.fn();
    render(
      <AcademyPaletteMenu
        themes={themes}
        selectedTheme="graphite"
        onSelect={onSelect}
        onPreview={vi.fn()}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    const ocean = screen.getByRole("menuitemradio", { name: /Ocean Blue/ });
    fireEvent.click(ocean, { clientX: 40, clientY: 70 });
    expect(onSelect).toHaveBeenCalledWith("ocean", { x: 40, y: 70 });
  });

  it("previews with arrow keys, confirms with Enter, and ignores hover", () => {
    const onSelect = vi.fn();
    const onPreview = vi.fn();
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <AcademyPaletteMenu
        themes={gridThemes}
        selectedTheme="graphite"
        onSelect={onSelect}
        onPreview={onPreview}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );

    const menu = screen.getByRole("menu", { name: "Choose a color theme" });
    const graphite = screen.getByRole("menuitemradio", {
      name: /^Graphite\./,
    });
    const ocean = screen.getByRole("menuitemradio", { name: /Ocean Blue/ });
    const ember = screen.getByRole("menuitemradio", { name: /Ember Orange/ });

    expect(graphite).toHaveFocus();
    fireEvent.mouseEnter(ocean);
    expect(onPreview).not.toHaveBeenCalled();

    fireEvent.keyDown(menu, { key: "ArrowDown" });
    // jsdom swatches have zero rects, so keyboard previews carry no origin
    // there; browsers report the focused swatch's center.
    expect(onPreview).toHaveBeenLastCalledWith("ember", undefined);
    expect(ember).toHaveFocus();
    expect(ember).toHaveAttribute("aria-checked", "true");
    expect(graphite).toHaveAttribute("aria-checked", "false");

    fireEvent.keyDown(menu, { key: "ArrowUp" });
    expect(graphite).toHaveFocus();

    fireEvent.keyDown(menu, { key: "ArrowRight" });
    expect(onPreview).toHaveBeenLastCalledWith("ocean", undefined);
    expect(ocean).toHaveFocus();

    fireEvent.keyDown(menu, { key: "ArrowLeft" });
    expect(graphite).toHaveFocus();

    fireEvent.keyDown(menu, { key: "ArrowDown" });
    fireEvent.keyDown(menu, { key: "Enter" });
    expect(onConfirm).toHaveBeenCalledWith("ember");

    fireEvent.keyDown(menu, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("reveals keyboard previews and Escape reverts from the focused swatch's center", () => {
    const onPreview = vi.fn();
    const onCancel = vi.fn();
    render(
      <AcademyPaletteMenu
        themes={themes}
        selectedTheme="graphite"
        onSelect={vi.fn()}
        onPreview={onPreview}
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />,
    );

    const menu = screen.getByRole("menu", { name: "Choose a color theme" });
    const ocean = screen.getByRole("menuitemradio", { name: /Ocean Blue/ });
    // jsdom reports zero rects, so measure the swatch explicitly to prove
    // the keyboard reveal emanates from the navigated item's center.
    ocean.getBoundingClientRect = () =>
      ({ left: 30, top: 60, width: 20, height: 10 }) as DOMRect;

    fireEvent.keyDown(menu, { key: "ArrowRight" });
    expect(onPreview).toHaveBeenLastCalledWith("ocean", { x: 40, y: 65 });

    fireEvent.keyDown(menu, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledWith({ x: 40, y: 65 });
  });
});
