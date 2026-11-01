import type { PointerEvent } from "react";

/**
 * A course card is links and buttons all over, so a plain drag on it never
 * selects its text. With Alt held it does, as on any link.
 *
 * The page is marked for as long as Alt is down, and
 * `ALT_DRAG_TEXT_SELECT_CLASSES` has a card's links and buttons let the
 * pointer through to the text meanwhile. It has to be so before the press:
 * a press that lands on a link starts in the link, wherever the pointer is
 * let through to afterwards. With the links out of the way, the click that
 * ends the press opens nothing either.
 */
const ALT_HELD_ATTRIBUTE = "data-alt-held";

if (typeof window !== "undefined") {
  const root = document.documentElement;
  const release = () => root.removeAttribute(ALT_HELD_ATTRIBUTE);
  window.addEventListener("keydown", (event) => {
    if (event.key === "Alt") root.setAttribute(ALT_HELD_ATTRIBUTE, "");
  });
  window.addEventListener("keyup", (event) => {
    if (event.key === "Alt") release();
  });
  // Alt held while the window is left (Alt+Tab) is never seen coming up.
  window.addEventListener("blur", release);
}

export const ALT_DRAG_TEXT_SELECT_CLASSES =
  "[[data-alt-held]_&]:cursor-text [[data-alt-held]_&]:select-text [[data-alt-held]_&_a]:pointer-events-none [[data-alt-held]_&_button]:pointer-events-none [[data-alt-held]_&_button]:select-text";

/**
 * For a card that can itself be dragged: a draggable element carries its
 * text away instead of selecting it, and the browser drops a selection made
 * inside one. So an Alt press makes the card not draggable, and it stays so
 * for as long as some of its text is selected. Goes on the card's
 * `onPointerDownCapture`.
 */
export function suspendDragForAltTextSelect(event: PointerEvent<HTMLElement>) {
  if (!event.altKey || event.pointerType !== "mouse") return;
  const card = event.currentTarget;
  if (!card.draggable) return;
  card.draggable = false;

  const holdsSelection = () => {
    const selection = window.getSelection();
    return Boolean(
      selection && !selection.isCollapsed && selection.containsNode(card, true),
    );
  };
  const restoreOnceUnselected = () => {
    if (card.isConnected && holdsSelection()) return;
    document.removeEventListener("selectionchange", restoreOnceUnselected);
    card.draggable = true;
  };
  const pressEnded = () => {
    window.removeEventListener("pointerup", pressEnded, true);
    window.removeEventListener("pointercancel", pressEnded, true);
    document.addEventListener("selectionchange", restoreOnceUnselected);
    restoreOnceUnselected();
  };
  window.addEventListener("pointerup", pressEnded, true);
  window.addEventListener("pointercancel", pressEnded, true);
}
