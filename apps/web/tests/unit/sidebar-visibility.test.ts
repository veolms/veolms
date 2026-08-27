import { describe, expect, it } from "vitest";
import {
  canStartSidebarTouchGesture,
  getResponsiveSidebarMode,
  getSidebarPresentation,
} from "../../src/shell/sidebarVisibility";

describe("sidebar visibility on touch layouts", () => {
  it("keeps hidden mode distinct from the collapsed rail", () => {
    expect(getSidebarPresentation("hidden")).toEqual({
      collapsed: false,
      hidden: true,
    });
  });

  it("collapses at the compact breakpoint and expands above it", () => {
    expect(getResponsiveSidebarMode("expanded", true)).toBe("collapsed");
    expect(getResponsiveSidebarMode("collapsed", false)).toBe("expanded");
  });

  it("does not reveal a deliberately hidden sidebar during resizing", () => {
    expect(getResponsiveSidebarMode("hidden", true)).toBe("hidden");
    expect(getResponsiveSidebarMode("hidden", false)).toBe("hidden");
  });

  it("allows a hidden sidebar to be revealed from a compact touch layout", () => {
    expect(
      canStartSidebarTouchGesture({
        compactNavigation: true,
        hidden: true,
        isPrimary: true,
        pointerType: "touch",
      }),
    ).toBe(true);
  });

  it("leaves compact navigation gestures disabled while the sidebar is visible", () => {
    expect(
      canStartSidebarTouchGesture({
        compactNavigation: true,
        hidden: false,
        isPrimary: true,
        pointerType: "touch",
      }),
    ).toBe(false);
  });
});
