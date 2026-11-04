import type { PointerEvent as ReactPointerEvent } from "react";

/**
 * Where the last press on text that can also be selected began, and
 * whether some of that text was selected then. One press at a time.
 */
let press: {
  target: EventTarget;
  x: number;
  y: number;
  /** How far it may move and still be a click, not a drag. */
  slop: number;
  hadSelection: boolean;
} | null = null;

function selectionWithin(node: Node) {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
    return null;
  }
  return selection.getRangeAt(0).intersectsNode(node) ? selection : null;
}

/**
 * For `onPointerDownCapture` on text that can also be selected, beside
 * `endsTextSelection` on its click.
 */
export function notePress(event: ReactPointerEvent<HTMLElement>) {
  press = {
    target: event.currentTarget,
    x: event.clientX,
    y: event.clientY,
    slop: event.pointerType === "mouse" ? 4 : 12,
    hadSelection: selectionWithin(event.currentTarget) !== null,
  };
}

/**
 * Says whether a click on text that can also be selected was part of
 * selecting it rather than a press of what it landed on:
 * - the release of a drag, whether or not the drag selected anything;
 * - the second or third click of a double or triple click (a word, a line);
 * - a click while some of the text was selected, which only lets go of the
 *   selection (cleared here too: a browser keeps a selection inside a
 *   button when the button is pressed);
 * - the end of a selection made some other way.
 * A key press (detail 0) is always a press.
 */
export function endsTextSelection(event: {
  currentTarget: Node;
  detail: number;
  clientX: number;
  clientY: number;
}) {
  const start = press?.target === event.currentTarget ? press : null;
  press = null;
  if (event.detail === 0) return false;
  if (event.detail > 1) return true;
  if (start) {
    const moved = Math.hypot(event.clientX - start.x, event.clientY - start.y);
    if (moved > start.slop) return true;
    if (start.hadSelection) {
      selectionWithin(event.currentTarget)?.removeAllRanges();
      return true;
    }
  }
  return selectionWithin(event.currentTarget) !== null;
}
