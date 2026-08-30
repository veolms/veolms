import type { FocusEvent, KeyboardEvent } from "react";

const TAB_SELECTOR = '[role="tab"]:not([disabled])';

/**
 * Keeps keyboard-focused tabs visible without moving a control underneath an
 * active pointer. Scrolling a partially clipped tab during pointer focus can
 * cancel the pointer's first click, which makes touch controls feel like they
 * require two taps.
 */
export function scrollKeyboardFocusedTabIntoView(
  event: FocusEvent<HTMLButtonElement>,
) {
  if (!event.currentTarget.matches(":focus-visible")) return;
  event.currentTarget.scrollIntoView({
    block: "nearest",
    inline: "nearest",
  });
}

/**
 * Applies the WAI-ARIA tablist keyboard model to an existing tab button.
 * Selection remains owned by each feature through its normal click handler.
 */
export function handleRovingTabKeyDown(
  event: KeyboardEvent<HTMLButtonElement>,
) {
  const { key } = event;
  if (
    key !== "ArrowLeft" &&
    key !== "ArrowRight" &&
    key !== "ArrowUp" &&
    key !== "ArrowDown" &&
    key !== "Home" &&
    key !== "End"
  )
    return;

  const tablist = event.currentTarget.closest<HTMLElement>('[role="tablist"]');
  if (!tablist) return;
  const tabs = [...tablist.querySelectorAll<HTMLButtonElement>(TAB_SELECTOR)];
  const currentIndex = tabs.indexOf(event.currentTarget);
  if (currentIndex < 0 || tabs.length === 0) return;

  event.preventDefault();
  const nextIndex =
    key === "Home"
      ? 0
      : key === "End"
        ? tabs.length - 1
        : (currentIndex +
            (key === "ArrowRight" || key === "ArrowDown" ? 1 : -1) +
            tabs.length) %
          tabs.length;
  const nextTab = tabs[nextIndex];
  nextTab?.focus({ preventScroll: true });
  nextTab?.click();
}
