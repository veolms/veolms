import { useEffect, useRef, useState, type RefObject } from "react";
import { isEditingShortcutTarget } from "../../keyboardShortcuts";
import { playEnterKeySound } from "./enterKeySound";

/** What has a use of its own for Enter while the focus is on it. */
const OWN_ENTER_SELECTOR =
  "a[href], button, summary, [role='button'], [role='link'], [role='menuitem'], [role='option'], [role='tab'], [role='switch'], [role='checkbox'], [role='radio']";

/** A dialog shown over the page (the rest of the page cannot be used). */
function isModalOpen() {
  try {
    return document.querySelector(":modal") !== null;
  } catch {
    return false;
  }
}

/**
 * Whether the element may be pressed with the key right now: nothing lies
 * over the middle of the part of it that is in the window (a dialog, a
 * menu, a drawer). Scrolled out of the window, it may be pressed as long as
 * the page itself is what is in front: no modal dialog is open, and what
 * lies at the window's middle is part of the page the element is on.
 */
function isReachable(element: Element) {
  if (isModalOpen()) return false;
  const box = element.getBoundingClientRect();
  const left = Math.max(box.left, 0);
  const right = Math.min(box.right, window.innerWidth);
  const top = Math.max(box.top, 0);
  const bottom = Math.min(box.bottom, window.innerHeight);
  if (right > left && bottom > top) {
    const hit = document.elementFromPoint(
      (left + right) / 2,
      (top + bottom) / 2,
    );
    return Boolean(hit) && element.contains(hit);
  }
  const page = element.closest("main");
  const hit = document.elementFromPoint(
    window.innerWidth / 2,
    window.innerHeight / 2,
  );
  return Boolean(hit && page?.contains(hit));
}

/**
 * Lets the Enter key press an action drawn as an Enter key: the action goes
 * down with the key and is carried out when the key comes back up, as a key
 * on a keyboard is, and it sounds like one both ways. Returns whether it is
 * down.
 *
 * It is a shortcut, whether or not the action is drawn: where the page has
 * no room for it (a phone, which may have a keyboard too), `standInRef`,
 * what the action belongs to, takes its place for the checks below.
 *
 * The key is left alone wherever Enter already means something: while
 * typing, on a link or a button that has the focus (on the action itself
 * the browser does the pressing, and only the sound is added), with a
 * modifier held, and while it repeats, as it does when held from the page
 * before. It is also left alone while something covers the action or the
 * page (see `isReachable`).
 */
export function useEnterKeyAction(
  actionRef: RefObject<HTMLElement | null>,
  onPress: () => void,
  standInRef?: RefObject<HTMLElement | null>,
) {
  const [pressed, setPressed] = useState(false);
  const armedRef = useRef(false);
  const onPressRef = useRef(onPress);
  useEffect(() => {
    onPressRef.current = onPress;
  });

  useEffect(() => {
    const release = () => {
      armedRef.current = false;
      setPressed(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.key !== "Enter" ||
        event.repeat ||
        event.isComposing ||
        event.defaultPrevented ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        event.shiftKey
      ) {
        return;
      }
      const action = actionRef.current;
      if (!action) return;
      if (event.target instanceof Node && action.contains(event.target)) {
        playEnterKeySound("down");
        return;
      }
      // Hidden (`display: none`), the action has no box to test.
      const drawn =
        action.getClientRects().length > 0
          ? action
          : (standInRef?.current ?? null);
      if (
        !drawn ||
        isEditingShortcutTarget(event.target) ||
        (event.target instanceof Element &&
          event.target.closest(OWN_ENTER_SELECTOR)) ||
        !isReachable(drawn)
      ) {
        return;
      }
      armedRef.current = true;
      setPressed(true);
      playEnterKeySound("down");
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key !== "Enter" || !armedRef.current) return;
      release();
      playEnterKeySound("up");
      onPressRef.current();
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", release);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", release);
    };
  }, [actionRef, standInRef]);

  return pressed;
}
