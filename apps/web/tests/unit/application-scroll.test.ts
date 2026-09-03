import { afterEach, describe, expect, it, vi } from "vitest";
import { scrollApplicationTo } from "../../src/shell/applicationScroll.js";

describe("application scrolling", () => {
  afterEach(() => {
    document.documentElement.style.removeProperty("scroll-behavior");
  });

  it("makes auto-positioning immediate even when the page uses smooth scrolling", () => {
    document.documentElement.style.scrollBehavior = "smooth";
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => {
      expect(document.documentElement.style.scrollBehavior).toBe("auto");
    });

    scrollApplicationTo({ left: 0, top: 240, behavior: "auto" });

    expect(scrollTo).toHaveBeenCalledWith({
      left: 0,
      top: 240,
      behavior: "auto",
    });
    expect(document.documentElement.style.scrollBehavior).toBe("smooth");
  });
});
