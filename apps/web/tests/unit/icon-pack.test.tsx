import { act, render } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { IdentifierForm } from "../../src/auth/IdentifierForm.tsx";
import { Icon } from "../../src/icons/Icon.tsx";
import {
  DEFAULT_ICON_PACK,
  ICON_PACK_KEY,
  setIconPack,
} from "../../src/icons/iconPack.ts";
import { ICON_PACKS, iconRegistry } from "../../src/icons/registry.ts";
import type { IconName } from "../../src/icons/registry.ts";

const LUCIDE_VIEW_BOX = "0 0 24 24";
const PHOSPHOR_VIEW_BOX = "0 0 256 256";

afterEach(() => {
  act(() => setIconPack(DEFAULT_ICON_PACK));
});

describe("icon registry", () => {
  it("resolves every semantic name in both packs", () => {
    const names = Object.keys(iconRegistry) as IconName[];

    expect(names.length).toBeGreaterThan(0);
    for (const name of names) {
      for (const pack of ICON_PACKS) {
        const Glyph = iconRegistry[name][pack];
        const { container, unmount } = render(<Glyph size={16} />);

        expect(container.querySelector("svg")).not.toBeNull();
        unmount();
      }
    }
  });

  it("names the glyphs the auth screens ask for", () => {
    expect(Object.keys(iconRegistry).sort()).toEqual([
      "arrowRight",
      "authenticator",
      "copy",
      "email",
      "mobile",
      "passkey",
      "person",
      "recommended",
      "refreshTimer",
      "shield",
      "validationError",
      "verified",
    ]);
  });
});

describe("icon", () => {
  it("draws the lucide glyph until another pack is chosen", () => {
    const { container } = render(<Icon aria-hidden name="email" size={18} />);

    expect(container.querySelector("svg")).toHaveAttribute(
      "viewBox",
      LUCIDE_VIEW_BOX,
    );
  });

  it("swaps the rendered glyph when the pack changes", () => {
    const { container } = render(<Icon aria-hidden name="email" size={18} />);

    act(() => setIconPack("phosphor"));

    expect(container.querySelector("svg")).toHaveAttribute(
      "viewBox",
      PHOSPHOR_VIEW_BOX,
    );
  });

  it("forwards the size and the decorative flag to whichever pack draws it", () => {
    const { container } = render(
      <Icon
        aria-hidden
        className="auth-form__invalid-mark"
        name="email"
        size={22}
      />,
    );
    const glyph = container.querySelector("svg");

    expect(glyph).toHaveAttribute("width", "22");
    expect(glyph).toHaveAttribute("height", "22");
    expect(glyph).toHaveAttribute("aria-hidden", "true");
    expect(glyph).toHaveClass("auth-form__invalid-mark");
  });
});

describe("icon pack storage", () => {
  it("restores the stored pack on a fresh load", async () => {
    window.localStorage.setItem(ICON_PACK_KEY, "phosphor");
    vi.resetModules();

    const reloaded = await import("../../src/icons/iconPack.ts");

    expect(reloaded.getIconPack()).toBe("phosphor");
  });

  it("ignores a stored value that names no pack", async () => {
    window.localStorage.setItem(ICON_PACK_KEY, "material");
    vi.resetModules();

    const reloaded = await import("../../src/icons/iconPack.ts");

    expect(reloaded.getIconPack()).toBe("lucide");
  });

  it("falls back to lucide when storage cannot be read, and stays quiet", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("storage is blocked");
    });
    vi.resetModules();

    const reloaded = await import("../../src/icons/iconPack.ts");

    expect(reloaded.getIconPack()).toBe("lucide");
    expect(consoleError).not.toHaveBeenCalled();
  });

  it("survives a storage that refuses to be written to", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("storage is full");
    });

    act(() => setIconPack("phosphor"));

    expect(consoleError).not.toHaveBeenCalled();
  });
});

describe("icon pack selection", () => {
  it("switches the pack and remembers the choice", () => {
    act(() => setIconPack("phosphor"));

    expect(window.localStorage.getItem(ICON_PACK_KEY)).toBe("phosphor");
  });

  it("keeps the glyphs on the identifier form in step with the chosen pack", () => {
    const { container } = render(
      <IdentifierForm status="idle" onSubmit={vi.fn()} />,
    );
    const fieldGlyph = () =>
      container.querySelector(".auth-form__input-shell > svg");

    expect(fieldGlyph()).toHaveAttribute("viewBox", LUCIDE_VIEW_BOX);

    act(() => setIconPack("phosphor"));

    expect(fieldGlyph()).toHaveAttribute("viewBox", PHOSPHOR_VIEW_BOX);
  });
});
