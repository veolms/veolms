import { useEffect, type RefObject } from "react";

/**
 * How closely the card follows the pointer: the time, in milliseconds, in
 * which it covers about two thirds of the way to where the pointer is.
 */
const FOLLOW_MS = 130;
/** Closer to its target than this, a value is put on it and left there. */
const SETTLED = 0.0005;
/**
 * How far a pressed pointer has to travel before the card starts to follow
 * it. Less than that is a tap or a click. A finger also has to travel more
 * across than down: down or up first is the start of a scroll.
 */
const DRAG_START = 8;

const PROPERTIES = ["--tilt-x", "--tilt-y", "--tilt-lift"] as const;
/** On the card's place for as long as the card is away from rest. */
const TILTING_ATTRIBUTE = "data-tilting";

/**
 * Follows a pointer that is dragged over a card so the card can lean
 * towards it: a finger, a pen, or a mouse with its button held. Merely
 * moving a mouse over the card does nothing.
 *
 * It is given the card's place, a box around the card that does not move,
 * not the card: a leaning card's outline shifts under a pointer near its
 * edge, which would then leave it and come back on every frame.
 *
 * All this does is keep three numbers on that box, as custom properties
 * the card inherits, easing them towards the pointer on every frame the
 * card is moving:
 * - `--tilt-x` and `--tilt-y`: where the pointer is over the card, from
 *   -0.5 at its left or top edge to 0.5 at its right or bottom one;
 * - `--tilt-lift`: 0 at rest, 1 while the card follows a pointer.
 * The card's own styles turn those into its tilt, the drift of its layers
 * and the glare on it, each reading the numbers with a fallback of 0.
 * Nothing is rendered again. At rest the properties are taken off, and so
 * is the `data-tilting` attribute that marks the place while the card is
 * away from rest: the card's styles give it its transforms only then, so a
 * card nobody is leaning costs the browser nothing.
 *
 * A finger only leans the card once it has moved across it: a touch that
 * moves down or up first scrolls the page, as it would anywhere else, and
 * one that barely moves is a tap. For the sideways drag to reach this at
 * all, the place has to keep it from the browser (`touch-action: pan-y`).
 * A mouse or pen leans it once dragged in any direction. The card then
 * follows the pointer wherever it goes until it is released, and the click
 * that would open the card's link at the end of a drag is swallowed.
 *
 * A drag would otherwise select the card's words, or pick its link up to
 * be dropped somewhere: both are stopped for a press that may lean the
 * card. With Alt held the press is left alone instead, so Alt and a drag
 * still select the words.
 *
 * A card takes part only while its place's styles set `--tilt-on: 1`, and
 * with motion reduced the card does not move.
 */
export function useCardTilt(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const place = ref.current;
    if (!place) return undefined;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

    const current = [0, 0, 0];
    const target = [0, 0, 0];
    let following = false;
    let frame = 0;
    let lastTime = 0;
    /** A pointer that is down on the card and may yet be dragged across it. */
    let press: { pointerId: number; x: number; y: number } | null = null;
    /** The press that is ending was a drag, so its click is not a tap. */
    let dragged = false;

    const step = (time: number) => {
      // A frame that comes late (the tab was in the background) must not
      // throw the card across in one jump.
      const elapsed = lastTime ? Math.min(time - lastTime, 64) : 16;
      lastTime = time;
      const ease = 1 - Math.exp(-elapsed / FOLLOW_MS);

      let moving = false;
      for (let index = 0; index < current.length; index += 1) {
        const gap = target[index]! - current[index]!;
        if (Math.abs(gap) > SETTLED) {
          current[index] = current[index]! + gap * ease;
          moving = true;
        } else {
          current[index] = target[index]!;
        }
      }

      const atRest = !moving && current.every((value) => value === 0);
      PROPERTIES.forEach((property, index) => {
        if (atRest) place.style.removeProperty(property);
        else place.style.setProperty(property, current[index]!.toFixed(4));
      });
      if (atRest) place.removeAttribute(TILTING_ATTRIBUTE);

      if (moving) {
        frame = requestAnimationFrame(step);
      } else {
        frame = 0;
        lastTime = 0;
      }
    };
    const ease = () => {
      if (!frame) frame = requestAnimationFrame(step);
    };

    const canTilt = () =>
      !reducedMotion.matches &&
      getComputedStyle(place).getPropertyValue("--tilt-on").trim() === "1";

    /** Leans the card towards where the pointer is over its place. */
    const follow = (event: PointerEvent) => {
      const box = place.getBoundingClientRect();
      if (!box.width || !box.height) return;
      const x = (event.clientX - box.left) / box.width;
      const y = (event.clientY - box.top) / box.height;
      target[0] = Math.min(Math.max(x, 0), 1) - 0.5;
      target[1] = Math.min(Math.max(y, 0), 1) - 0.5;
      target[2] = 1;
      place.setAttribute(TILTING_ATTRIBUTE, "");
      ease();
    };
    /** Lets the card go back to lying flat. */
    const release = () => {
      following = false;
      press = null;
      if (!frame && current.every((value) => value === 0)) return;
      target.fill(0);
      ease();
    };

    const onDown = (event: PointerEvent) => {
      dragged = false;
      press = null;
      if (!event.isPrimary) return;
      if (event.pointerType !== "touch") {
        // Only the main button, and not with Alt: that drag selects text.
        if (event.button !== 0 || event.altKey) return;
      }
      if (!canTilt()) return;
      press = {
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
      };
    };
    const onMove = (event: PointerEvent) => {
      if (!press || press.pointerId !== event.pointerId) return;
      if (!following) {
        const across = Math.abs(event.clientX - press.x);
        const down = Math.abs(event.clientY - press.y);
        if (Math.max(across, down) < DRAG_START) return;
        if (event.pointerType === "touch" && down >= across) {
          // The page is being scrolled.
          press = null;
          return;
        }
        following = true;
        dragged = true;
        if (event.pointerType !== "touch") {
          // Followed to wherever the pointer goes, off the card included,
          // until the button is let go.
          try {
            place.setPointerCapture(event.pointerId);
          } catch {
            // Without capture the card lies back when the pointer leaves.
          }
        }
      }
      follow(event);
    };
    const onUp = (event: PointerEvent) => {
      if (press && press.pointerId !== event.pointerId) return;
      release();
    };
    /** A press that may lean the card selects nothing and drags no link. */
    const onSelectOrDragStart = (event: Event) => {
      if (press) event.preventDefault();
    };
    const onClick = (event: MouseEvent) => {
      if (!dragged) return;
      dragged = false;
      event.preventDefault();
      event.stopPropagation();
    };

    place.addEventListener("pointerdown", onDown);
    place.addEventListener("pointermove", onMove);
    place.addEventListener("pointerup", onUp);
    place.addEventListener("pointerleave", release);
    place.addEventListener("pointercancel", release);
    place.addEventListener("click", onClick, true);
    place.addEventListener("selectstart", onSelectOrDragStart);
    place.addEventListener("dragstart", onSelectOrDragStart);
    return () => {
      cancelAnimationFrame(frame);
      place.removeEventListener("pointerdown", onDown);
      place.removeEventListener("pointermove", onMove);
      place.removeEventListener("pointerup", onUp);
      place.removeEventListener("pointerleave", release);
      place.removeEventListener("pointercancel", release);
      place.removeEventListener("click", onClick, true);
      place.removeEventListener("selectstart", onSelectOrDragStart);
      place.removeEventListener("dragstart", onSelectOrDragStart);
      PROPERTIES.forEach((property) => place.style.removeProperty(property));
      place.removeAttribute(TILTING_ATTRIBUTE);
    };
  }, [ref]);
}
