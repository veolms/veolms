import { useEffect } from "react";

/** Marks a `title` this put there, as opposed to one the markup gave. */
const AUTO_TITLE_ATTRIBUTE = "data-truncated-title";
/** How far up from the hovered element a cut-off ancestor is looked for. */
const MAX_ANCESTORS = 4;
/** How many of the elements stacked under the pointer are looked at. */
const MAX_STACKED = 12;
/** A hovered element's surroundings are searched only up to this size. */
const MAX_NEIGHBOURS = 400;
/** The least time between two looks while the mouse keeps moving. */
const LOOK_INTERVAL_MS = 80;

/** Whether the element clamps its text to a number of lines. */
function clampsLines(style: CSSStyleDeclaration): boolean {
  const lineClamp = style.getPropertyValue("-webkit-line-clamp");
  return lineClamp !== "" && lineClamp !== "none";
}

/**
 * Whether the element's text is cut off with an ellipsis and some of it is
 * in fact hidden. A single line is cut off sideways and clamped lines
 * downwards; each is judged only that way, because a line that fits can
 * still be a pixel or two taller than its box (the tails of its letters),
 * which is not text being cut off.
 */
function isCutOff(element: HTMLElement): boolean {
  const style = getComputedStyle(element);
  if (clampsLines(style)) {
    return element.scrollHeight > element.clientHeight + 1;
  }
  return (
    style.textOverflow === "ellipsis" &&
    element.scrollWidth > element.clientWidth + 1
  );
}

function containsPoint(element: Element, x: number, y: number): boolean {
  const box = element.getBoundingClientRect();
  return x >= box.left && x <= box.right && y >= box.top && y <= box.bottom;
}

/**
 * The cut-off text under the pointer, if there is any.
 *
 * It is often not the element the mouse is "over". A card that is one big
 * link has that link lying over its title, and some titles let the pointer
 * through altogether. So three places are looked in, the cheapest first:
 * the hovered element and a few of its ancestors, then whatever else is
 * stacked under the pointer, then the hovered element's neighbours (which
 * is where text that lets the pointer through is found).
 */
function findCutOffText(
  hovered: HTMLElement,
  x: number,
  y: number,
): HTMLElement | null {
  let ancestor: HTMLElement | null = hovered;
  for (
    let depth = 0;
    ancestor && ancestor !== document.body && depth <= MAX_ANCESTORS;
    depth += 1, ancestor = ancestor.parentElement
  ) {
    if (isCutOff(ancestor)) return ancestor;
  }

  for (const stacked of document
    .elementsFromPoint(x, y)
    .slice(0, MAX_STACKED)) {
    if (stacked instanceof HTMLElement && isCutOff(stacked)) return stacked;
  }

  const surroundings = hovered.parentElement;
  if (!surroundings) return null;
  const neighbours = surroundings.getElementsByTagName("*");
  if (neighbours.length > MAX_NEIGHBOURS) return null;
  for (const neighbour of neighbours) {
    if (
      neighbour instanceof HTMLElement &&
      containsPoint(neighbour, x, y) &&
      isCutOff(neighbour)
    ) {
      return neighbour;
    }
  }
  return null;
}

/**
 * Gives every piece of text the app cuts off with an ellipsis a tooltip
 * with the whole of it.
 *
 * Text is truncated in a great many places (`truncate`, `line-clamp-*`), and
 * whether a given one is actually cut off depends on its width at that
 * moment. So instead of a `title` on each, one listener looks at what lies
 * under a mouse as it moves (see `findCutOffText`). Where that is cut-off
 * text, its full text is put in a `title`: on the text itself when the mouse
 * is over it, and otherwise on the element that is in the way, because a
 * browser shows the tooltip of the element under the pointer. A title the
 * markup already supplies is left alone, and one put here is taken off again
 * when the pointer moves on or the text fits.
 */
export function useTruncatedTextTitles(): void {
  useEffect(() => {
    /** The element currently carrying a title put here. */
    let holder: HTMLElement | null = null;
    let lastLookAt = 0;
    let pending = 0;
    let latest: PointerEvent | null = null;
    /** The title the holder had of its own, to be given back to it. */
    let ownTitle: string | null = null;

    const clear = () => {
      if (!holder) return;
      if (holder.hasAttribute(AUTO_TITLE_ATTRIBUTE)) {
        if (ownTitle === null) holder.removeAttribute("title");
        else holder.setAttribute("title", ownTitle);
        holder.removeAttribute(AUTO_TITLE_ATTRIBUTE);
      }
      holder = null;
      ownTitle = null;
    };

    const look = () => {
      pending = 0;
      lastLookAt = performance.now();
      const event = latest;
      latest = null;
      const hovered =
        event?.target instanceof HTMLElement ? event.target : null;
      if (!event || !hovered || !hovered.isConnected) {
        clear();
        return;
      }

      const text = findCutOffText(hovered, event.clientX, event.clientY);
      if (!text) {
        clear();
        return;
      }
      // The tooltip a browser shows is the hovered element's, or that of an
      // ancestor of it.
      const nextHolder = text.contains(hovered) ? text : hovered;
      if (nextHolder !== holder) clear();
      const fullText = text.innerText.replace(/\s+/g, " ").trim();
      if (!fullText) return;
      if (
        nextHolder.hasAttribute("title") &&
        !nextHolder.hasAttribute(AUTO_TITLE_ATTRIBUTE)
      ) {
        // Text that names itself keeps the title it was given. Something
        // lying over the text (a card's link, say) has a title about itself,
        // which gives way while the pointer is on the cut-off text and is
        // given back when the pointer moves on.
        if (nextHolder === text) return;
        ownTitle = nextHolder.getAttribute("title");
      }
      if (nextHolder.getAttribute("title") !== fullText) {
        nextHolder.setAttribute("title", fullText);
      }
      nextHolder.setAttribute(AUTO_TITLE_ATTRIBUTE, "");
      holder = nextHolder;
    };

    const handlePointerMove = (event: PointerEvent) => {
      // A drag is not a hover, and only a mouse has tooltips.
      if (event.pointerType !== "mouse" || event.buttons !== 0) return;
      latest = event;
      if (pending) return;
      const wait = Math.max(
        0,
        LOOK_INTERVAL_MS - (performance.now() - lastLookAt),
      );
      pending = window.setTimeout(look, wait);
    };

    document.addEventListener("pointermove", handlePointerMove, {
      passive: true,
    });
    return () => {
      document.removeEventListener("pointermove", handlePointerMove);
      window.clearTimeout(pending);
      clear();
    };
  }, []);
}
