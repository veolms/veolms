import { describe, expect, it, vi } from "vitest";
import type { FocusEvent } from "react";
import { scrollKeyboardFocusedTabIntoView } from "../../src/accessibility/rovingTabFocus";

const createFocusEvent = (focusVisible: boolean) => {
  const button = document.createElement("button");
  const scrollIntoView = vi.fn();
  Object.defineProperty(button, "scrollIntoView", {
    configurable: true,
    value: scrollIntoView,
  });
  vi.spyOn(button, "matches").mockImplementation(
    (selector) => selector === ":focus-visible" && focusVisible,
  );

  return {
    event: { currentTarget: button } as FocusEvent<HTMLButtonElement>,
    scrollIntoView,
  };
};

describe("scrollKeyboardFocusedTabIntoView", () => {
  it("does not move a tab focused by a pointer", () => {
    const { event, scrollIntoView } = createFocusEvent(false);

    scrollKeyboardFocusedTabIntoView(event);

    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it("keeps keyboard-focused tabs visible", () => {
    const { event, scrollIntoView } = createFocusEvent(true);

    scrollKeyboardFocusedTabIntoView(event);

    expect(scrollIntoView).toHaveBeenCalledWith({
      block: "nearest",
      inline: "nearest",
    });
  });
});
