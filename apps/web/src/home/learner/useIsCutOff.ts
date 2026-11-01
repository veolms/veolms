import { useEffect, useState, type RefObject } from "react";

/**
 * Whether the text in an element is cut off with an ellipsis right now:
 * along its one line, or below the last of the lines it is held to. It is
 * measured again whenever the element changes size, which is also what
 * gives the first reading. `text` is what the element shows, so a new text
 * is measured too.
 */
export function useIsCutOff(
  elementRef: RefObject<HTMLElement | null>,
  text: string,
) {
  const [cutOff, setCutOff] = useState(false);

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;
    const observer = new ResizeObserver(() => {
      setCutOff(
        element.scrollWidth > element.clientWidth + 1 ||
          // A line's box is a little shorter than its letters, so a line
          // that fits still measures a pixel or two over.
          element.scrollHeight > element.clientHeight + 3,
      );
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [elementRef, text]);

  return cutOff;
}
