import { fireEvent, render, screen } from "@testing-library/react";
import { useLayoutEffect, useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ElasticScrollControl,
  getElasticScrollSpeed,
  getScrollDirectionAtEdge,
  getScrollProgress,
} from "../../src/components/elastic-scroll-control/index.js";

function ScrollControlHarness() {
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
      <ElasticScrollControl
        scrollportRef={scrollportRef}
        ariaControls="sample-scrollport"
        scrollAreaLabel="Sample list"
      />
    </div>
  );
}

describe("ElasticScrollControl", () => {
  beforeEach(() => {
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
    expect(getElasticScrollSpeed(96)).toBe(1560);
    expect(getElasticScrollSpeed(144)).toBeGreaterThan(1560);
    expect(getElasticScrollSpeed(192)).toBe(2800);
    expect(getElasticScrollSpeed(1000)).toBe(2800);
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
    render(<ScrollControlHarness />);
    const scrollport = screen.getByTestId("sample-scrollport");
    scrollport.scrollTop = 120;
    fireEvent.scroll(scrollport);

    expect(
      screen.getByRole("button", { name: "Scroll sample list to bottom" }),
    ).toHaveAttribute("aria-controls", "sample-scrollport");
    expect(
      screen.getByRole("progressbar", { name: "Sample list scroll position" }),
    ).toHaveAttribute("aria-valuenow", "20");
  });
});
