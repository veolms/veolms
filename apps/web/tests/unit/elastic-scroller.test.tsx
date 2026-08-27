import { fireEvent, render, screen } from "@testing-library/react";
import { useLayoutEffect, useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ElasticScroller,
  getElasticScrollSpeed,
  getScrollDirectionAtEdge,
  getScrollProgress,
} from "../../src/components/elastic-scroller/index.js";

function ScrollerHarness() {
  const scrollportRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const scrollport = scrollportRef.current;
    if (!scrollport) return;
    Object.defineProperties(scrollport, {
      clientHeight: { configurable: true, value: 400 },
      scrollHeight: { configurable: true, value: 1000 },
    });
  }, []);

  return (
    <div ref={scrollportRef} data-testid="sample-scrollport" tabIndex={0}>
      <ElasticScroller
        scrollportRef={scrollportRef}
        ariaControls="sample-scrollport"
        scrollAreaLabel="Sample list"
      />
    </div>
  );
}

describe("ElasticScroller", () => {
  beforeEach(() => {
    window.localStorage.removeItem("veolms-elastic-scroll-appearance");
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("scales drag scrolling from a dead zone to a capped speed", () => {
    expect(getElasticScrollSpeed(Number.NaN)).toBe(0);
    expect(getElasticScrollSpeed(0)).toBe(0);
    expect(getElasticScrollSpeed(4)).toBe(0);
    expect(getElasticScrollSpeed(24)).toBeGreaterThan(0);
    expect(getElasticScrollSpeed(72)).toBeGreaterThan(
      getElasticScrollSpeed(24),
    );
    expect(getElasticScrollSpeed(96)).toBe(2800);
    expect(getElasticScrollSpeed(144)).toBeGreaterThan(2800);
    expect(getElasticScrollSpeed(192)).toBe(5600);
    expect(getElasticScrollSpeed(1000)).toBe(5600);
  });

  it("normalizes scroll progress and edge direction", () => {
    expect(getScrollProgress(Number.NaN, 1000, 400)).toBe(0);
    expect(getScrollProgress(0, 1000, 400)).toBe(0);
    expect(getScrollProgress(300, 1000, 400)).toBe(0.5);
    expect(getScrollProgress(600, 1000, 400)).toBe(1);
    expect(getScrollProgress(100, 400, 400)).toBe(0);
    expect(getScrollDirectionAtEdge(0, 1000, 400, "up")).toBe("down");
    expect(getScrollDirectionAtEdge(600, 1000, 400, "down")).toBe("up");
    expect(getScrollDirectionAtEdge(280, 1000, 400, "down")).toBe("down");
  });

  it("attaches to any supplied scrollport with reusable labels", () => {
    render(<ScrollerHarness />);
    const scrollport = screen.getByTestId("sample-scrollport");
    scrollport.scrollTop = 120;
    fireEvent.scroll(scrollport);

    const control = screen.getByRole("button", {
      name: "Scroll sample list to bottom",
    });
    expect(control).toHaveAttribute("aria-controls", "sample-scrollport");
    const gestureBoundary = control.closest(".elastic-scroller");
    expect(gestureBoundary).toHaveAttribute("data-base-ui-swipe-ignore");
    expect(gestureBoundary).toHaveAttribute("data-learning-swipe-ignore");
    expect(gestureBoundary).toHaveAttribute("data-sidebar-swipe-ignore");
    expect(gestureBoundary).toHaveAttribute("data-tab-swipe-ignore");
    expect(
      screen.getByRole("progressbar", { name: "Sample list scroll position" }),
    ).toHaveAttribute("aria-valuenow", "20");
  });

  it("uses one progress circle for the 3D recessed socket", () => {
    window.localStorage.setItem("veolms-elastic-scroll-appearance", "3d");

    render(<ScrollerHarness />);

    const scroller = document.querySelector(".elastic-scroller");
    expect(scroller).toHaveAttribute("data-appearance", "3d");
    expect(
      scroller?.querySelectorAll(".elastic-scroller__progress-puck circle"),
    ).toHaveLength(1);
  });
});
