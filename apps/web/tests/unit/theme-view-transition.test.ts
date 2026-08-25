import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyWithThemeViewTransition,
  themeRevealOriginFromClick,
  themeRevealOriginFromElement,
} from "../../src/shell/themeViewTransition.js";

type MockViewTransitionFactory = ReturnType<typeof installTransitionMock>;

function installTransitionMock() {
  const startViewTransition = vi.fn((updateCallback: () => void) => {
    updateCallback();
    const settled = Promise.resolve();
    return {
      finished: settled,
      ready: settled,
      updateCallbackDone: settled,
    };
  });
  Object.defineProperty(document, "startViewTransition", {
    value: startViewTransition,
    configurable: true,
    writable: true,
  });
  return startViewTransition;
}

function rootStyle(): CSSStyleDeclaration {
  return document.documentElement.style;
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

describe("applyWithThemeViewTransition", () => {
  let startViewTransition: MockViewTransitionFactory;
  const originalMatchMedia = window.matchMedia;

  beforeEach(() => {
    startViewTransition = installTransitionMock();
  });

  afterEach(() => {
    Reflect.deleteProperty(document, "startViewTransition");
    delete document.documentElement.dataset.themeTransition;
    for (const property of ["--theme-reveal-x", "--theme-reveal-y"]) {
      document.documentElement.style.removeProperty(property);
    }
    window.matchMedia = originalMatchMedia;
    vi.useRealTimers();
  });

  it("runs the commit inside the view transition", () => {
    const commit = vi.fn();
    applyWithThemeViewTransition(commit);
    expect(startViewTransition).toHaveBeenCalledTimes(1);
    expect(commit).toHaveBeenCalledTimes(1);
  });

  it("reveals from the explicitly passed pointer origin with a fixed duration", async () => {
    applyWithThemeViewTransition(vi.fn(), "mode", { x: 12, y: 34 });
    expect(rootStyle().getPropertyValue("--theme-reveal-x")).toBe("12px");
    expect(rootStyle().getPropertyValue("--theme-reveal-y")).toBe("34px");
    expect(rootStyle().getPropertyValue("--theme-reveal-duration")).toBe("");
    await vi.waitFor(() =>
      expect(rootStyle().getPropertyValue("--theme-reveal-x")).toBe(""),
    );
    expect(rootStyle().getPropertyValue("--theme-reveal-y")).toBe("");
    expect(document.documentElement.dataset.themeTransition).toBeUndefined();
  });

  it("keeps the same fixed pacing for center clicks as corner clicks", () => {
    const centerX = Math.round(window.innerWidth / 2);
    const centerY = Math.round(window.innerHeight / 2);
    applyWithThemeViewTransition(vi.fn(), "mode", {
      x: centerX,
      y: centerY,
    });
    expect(rootStyle().getPropertyValue("--theme-reveal-x")).toBe(
      `${centerX}px`,
    );
    expect(rootStyle().getPropertyValue("--theme-reveal-y")).toBe(
      `${centerY}px`,
    );
    // No duration override: the CSS default (1s) applies everywhere.
    expect(rootStyle().getPropertyValue("--theme-reveal-duration")).toBe("");
  });

  it("falls back to the CSS corner origins without a pointer origin", () => {
    // Keyboard and OS-triggered commits pass no origin; unrelated earlier
    // pointer interactions must never leak into the reveal.
    applyWithThemeViewTransition(vi.fn());
    expect(rootStyle().getPropertyValue("--theme-reveal-x")).toBe("");
    expect(rootStyle().getPropertyValue("--theme-reveal-y")).toBe("");
  });

  it("does not reuse a previous transition's pointer origin", async () => {
    applyWithThemeViewTransition(vi.fn(), "mode", { x: 12, y: 34 });
    await vi.waitFor(() =>
      expect(rootStyle().getPropertyValue("--theme-reveal-x")).toBe(""),
    );
    // A follow-up transition without an origin (keyboard/OS trigger) stages
    // nothing even though a pointer transition ran before it.
    applyWithThemeViewTransition(vi.fn());
    expect(rootStyle().getPropertyValue("--theme-reveal-x")).toBe("");
    expect(rootStyle().getPropertyValue("--theme-reveal-y")).toBe("");
  });

  it("clears a prior pointer origin for an overlapping originless transition", async () => {
    const firstTransitionFinished = deferred();
    const secondTransitionFinished = deferred();
    startViewTransition.mockImplementationOnce(() => ({
      finished: firstTransitionFinished.promise,
      ready: Promise.resolve(),
      updateCallbackDone: Promise.resolve(),
    }));
    startViewTransition.mockImplementationOnce(() => ({
      finished: secondTransitionFinished.promise,
      ready: Promise.resolve(),
      updateCallbackDone: Promise.resolve(),
    }));

    applyWithThemeViewTransition(vi.fn(), "mode", { x: 10, y: 20 });
    // An originless commit (OS-triggered flip) while the pointer reveal is
    // still animating must reveal from the CSS corner fallback, not the
    // earlier pointer position.
    applyWithThemeViewTransition(vi.fn(), "mode");
    expect(rootStyle().getPropertyValue("--theme-reveal-x")).toBe("");
    expect(rootStyle().getPropertyValue("--theme-reveal-y")).toBe("");

    // The pointer transition settling afterwards must not touch the
    // originless transition's corner fallback.
    firstTransitionFinished.resolve();
    await firstTransitionFinished.promise;
    expect(rootStyle().getPropertyValue("--theme-reveal-x")).toBe("");
    expect(rootStyle().getPropertyValue("--theme-reveal-y")).toBe("");

    secondTransitionFinished.resolve();
    await secondTransitionFinished.promise;
    expect(rootStyle().getPropertyValue("--theme-reveal-x")).toBe("");
    expect(rootStyle().getPropertyValue("--theme-reveal-y")).toBe("");
  });

  it("keeps origin vars restaged by a newer transition", async () => {
    const firstTransitionFinished = deferred();
    const secondTransitionFinished = deferred();
    startViewTransition.mockImplementationOnce(() => ({
      finished: firstTransitionFinished.promise,
      ready: Promise.resolve(),
      updateCallbackDone: Promise.resolve(),
    }));
    startViewTransition.mockImplementationOnce(() => ({
      finished: secondTransitionFinished.promise,
      ready: Promise.resolve(),
      updateCallbackDone: Promise.resolve(),
    }));

    applyWithThemeViewTransition(vi.fn(), "mode", { x: 10, y: 20 });
    applyWithThemeViewTransition(vi.fn(), "mode", { x: 30, y: 40 });
    expect(rootStyle().getPropertyValue("--theme-reveal-x")).toBe("30px");

    // Skipping the first transition must not wipe the second one's origin;
    // the module registered its finished handler before this await resumes.
    firstTransitionFinished.resolve();
    await firstTransitionFinished.promise;
    expect(rootStyle().getPropertyValue("--theme-reveal-x")).toBe("30px");
    expect(rootStyle().getPropertyValue("--theme-reveal-y")).toBe("40px");

    secondTransitionFinished.resolve();
    await secondTransitionFinished.promise;
    expect(rootStyle().getPropertyValue("--theme-reveal-x")).toBe("");
  });

  it("keeps the tag restaged by a newer same-kind transition", async () => {
    const firstTransitionFinished = deferred();
    const secondTransitionFinished = deferred();
    startViewTransition.mockImplementationOnce(() => ({
      finished: firstTransitionFinished.promise,
      ready: Promise.resolve(),
      updateCallbackDone: Promise.resolve(),
    }));
    startViewTransition.mockImplementationOnce(() => ({
      finished: secondTransitionFinished.promise,
      ready: Promise.resolve(),
      updateCallbackDone: Promise.resolve(),
    }));

    applyWithThemeViewTransition(vi.fn(), "palette");
    applyWithThemeViewTransition(vi.fn(), "palette");

    // The first palette transition finishing must not drop the tag the
    // second palette transition still needs for its mask corner.
    firstTransitionFinished.resolve();
    await firstTransitionFinished.promise;
    expect(document.documentElement.dataset.themeTransition).toBe("palette");

    secondTransitionFinished.resolve();
    await secondTransitionFinished.promise;
    expect(document.documentElement.dataset.themeTransition).toBeUndefined();
  });

  it("keeps origin vars restaged at the same x by a newer transition", async () => {
    const firstTransitionFinished = deferred();
    const secondTransitionFinished = deferred();
    startViewTransition.mockImplementationOnce(() => ({
      finished: firstTransitionFinished.promise,
      ready: Promise.resolve(),
      updateCallbackDone: Promise.resolve(),
    }));
    startViewTransition.mockImplementationOnce(() => ({
      finished: secondTransitionFinished.promise,
      ready: Promise.resolve(),
      updateCallbackDone: Promise.resolve(),
    }));

    applyWithThemeViewTransition(vi.fn(), "mode", { x: 25, y: 10 });
    applyWithThemeViewTransition(vi.fn(), "mode", { x: 25, y: 60 });
    expect(rootStyle().getPropertyValue("--theme-reveal-x")).toBe("25px");
    expect(rootStyle().getPropertyValue("--theme-reveal-y")).toBe("60px");

    // Same x-coordinate, different y: the first transition's cleanup must
    // not mistake the restaged origin for its own and wipe the y value.
    firstTransitionFinished.resolve();
    await firstTransitionFinished.promise;
    expect(rootStyle().getPropertyValue("--theme-reveal-x")).toBe("25px");
    expect(rootStyle().getPropertyValue("--theme-reveal-y")).toBe("60px");

    secondTransitionFinished.resolve();
    await secondTransitionFinished.promise;
    expect(rootStyle().getPropertyValue("--theme-reveal-x")).toBe("");
    expect(rootStyle().getPropertyValue("--theme-reveal-y")).toBe("");
  });

  it("keeps identical origin vars restaged by a newer transition", async () => {
    const firstTransitionFinished = deferred();
    const secondTransitionFinished = deferred();
    startViewTransition.mockImplementationOnce(() => ({
      finished: firstTransitionFinished.promise,
      ready: Promise.resolve(),
      updateCallbackDone: Promise.resolve(),
    }));
    startViewTransition.mockImplementationOnce(() => ({
      finished: secondTransitionFinished.promise,
      ready: Promise.resolve(),
      updateCallbackDone: Promise.resolve(),
    }));

    applyWithThemeViewTransition(vi.fn(), "mode", { x: 10, y: 20 });
    applyWithThemeViewTransition(vi.fn(), "mode", { x: 10, y: 20 });

    firstTransitionFinished.resolve();
    await firstTransitionFinished.promise;
    expect(rootStyle().getPropertyValue("--theme-reveal-x")).toBe("10px");
    expect(rootStyle().getPropertyValue("--theme-reveal-y")).toBe("20px");

    secondTransitionFinished.resolve();
    await secondTransitionFinished.promise;
    expect(rootStyle().getPropertyValue("--theme-reveal-x")).toBe("");
    expect(rootStyle().getPropertyValue("--theme-reveal-y")).toBe("");
  });

  it("commits directly when the browser lacks view transitions", () => {
    Reflect.deleteProperty(document, "startViewTransition");
    const commit = vi.fn();
    applyWithThemeViewTransition(commit);
    expect(commit).toHaveBeenCalledTimes(1);
  });

  it("commits directly under reduced motion", () => {
    window.matchMedia = vi.fn().mockReturnValue({
      matches: true,
      media: "(prefers-reduced-motion: reduce)",
      onchange: null,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
      dispatchEvent() {
        return false;
      },
    }) as unknown as typeof window.matchMedia;
    const commit = vi.fn();
    applyWithThemeViewTransition(commit);
    expect(commit).toHaveBeenCalledTimes(1);
    expect(startViewTransition).not.toHaveBeenCalled();
  });
});

describe("themeRevealOriginFromClick", () => {
  it("derives an origin from a pointer click", () => {
    expect(themeRevealOriginFromClick({ clientX: 40, clientY: 80 })).toEqual({
      x: 40,
      y: 80,
    });
  });

  it("rejects keyboard and programmatic clicks reported at the viewport origin", () => {
    // Enter/Space activations and element.click() both report (0, 0) with no
    // element to attribute the reveal to.
    expect(themeRevealOriginFromClick({ clientX: 0, clientY: 0 })).toBeNull();
  });

  it("reveals keyboard-activated clicks from the activated control's center", () => {
    const button = document.createElement("button");
    button.getBoundingClientRect = () =>
      ({ left: 100, top: 50, width: 40, height: 20 }) as DOMRect;
    expect(
      themeRevealOriginFromClick({
        clientX: 0,
        clientY: 0,
        currentTarget: button,
      }),
    ).toEqual({ x: 120, y: 60 });
  });

  it("rejects keyboard clicks on unmeasured controls", () => {
    // jsdom-style zero rects cannot yield a center; the corner applies.
    const button = document.createElement("button");
    expect(
      themeRevealOriginFromClick({
        clientX: 0,
        clientY: 0,
        currentTarget: button,
      }),
    ).toBeNull();
  });
});

describe("themeRevealOriginFromElement", () => {
  it("returns the element's box center", () => {
    const element = document.createElement("div");
    element.getBoundingClientRect = () =>
      ({ left: 10, top: 20, width: 100, height: 50 }) as DOMRect;
    expect(themeRevealOriginFromElement(element)).toEqual({ x: 60, y: 45 });
  });

  it("returns null for missing or unmeasured elements", () => {
    expect(themeRevealOriginFromElement(null)).toBeNull();
    expect(themeRevealOriginFromElement(undefined)).toBeNull();
    const element = document.createElement("div");
    expect(themeRevealOriginFromElement(element)).toBeNull();
  });
});
