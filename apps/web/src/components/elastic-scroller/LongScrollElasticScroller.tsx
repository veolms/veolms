import { useEffect, useState } from "react";
import { ElasticScroller } from "./ElasticScroller";
import { scrollEventTarget } from "./pageScrollport";
import type { ElasticScrollerProps } from "./ElasticScroller";

/** The scroller is offered once there is this many screens' worth to scroll. */
const DEFAULT_MIN_SCROLL_SCREENS = 2;

export interface LongScrollElasticScrollerProps extends ElasticScrollerProps {
  /** How many scrollport heights of scrolling make the content "long". */
  minScrollScreens?: number;
}

/**
 * The elements whose boxes make up the scrollport's content: its children,
 * and in place of a `display: contents` wrapper (which has no box, so a
 * ResizeObserver never reports it) that wrapper's own children. The
 * wrappers are returned too, so that a page swapped in under one is seen.
 */
const collectContentBoxes = (
  parent: Element,
  boxes: Element[],
  wrappers: Element[],
) => {
  for (const child of parent.children) {
    if (getComputedStyle(child).display === "contents") {
      wrappers.push(child);
      collectContentBoxes(child, boxes, wrappers);
    } else {
      boxes.push(child);
    }
  }
};

/**
 * The elastic scroller for a scrollport whose content is sometimes short and
 * sometimes very long (a list of students, orders or discussions). It is
 * only there while the content is long; a page that scrolls a little is
 * left alone. Render it as the first child of the scrollport, like
 * `ElasticScroller`.
 */
export function LongScrollElasticScroller({
  scrollportRef,
  minScrollScreens = DEFAULT_MIN_SCROLL_SCREENS,
  disabled = false,
  ...props
}: LongScrollElasticScrollerProps) {
  const [long, setLong] = useState(false);

  useEffect(() => {
    const scrollport = scrollportRef.current;
    if (!scrollport || disabled) return undefined;

    const measure = () => {
      setLong(
        scrollport.clientHeight > 0 &&
          scrollport.scrollHeight - scrollport.clientHeight >=
            scrollport.clientHeight * minScrollScreens,
      );
    };

    // The content's height is what matters, and the scrollport's own box
    // does not change with it, so the content's boxes are watched too. The
    // shell puts each page inside `display: contents` wrappers, so these
    // are found below them; watching only the wrappers missed a page whose
    // content grew after its first layout (Discussions, whose tab panel
    // sets its height a frame after the list arrives).
    const sizes = new ResizeObserver(measure);
    const children = new MutationObserver(() => {
      observeContent();
      measure();
    });
    const observeContent = () => {
      sizes.disconnect();
      children.disconnect();
      const boxes: Element[] = [];
      const wrappers: Element[] = [scrollport];
      collectContentBoxes(scrollport, boxes, wrappers);
      sizes.observe(scrollport);
      for (const box of boxes) sizes.observe(box);
      for (const wrapper of wrappers) {
        children.observe(wrapper, { childList: true });
      }
    };
    observeContent();
    measure();
    // A check while scrolling as well: the control only shows on a scroll,
    // so it is then always right, whatever the observers missed.
    const scrollEvents = scrollEventTarget(scrollport);
    scrollEvents.addEventListener("scroll", measure, { passive: true });

    return () => {
      sizes.disconnect();
      children.disconnect();
      scrollEvents.removeEventListener("scroll", measure);
    };
  }, [disabled, minScrollScreens, scrollportRef]);

  return (
    <ElasticScroller
      {...props}
      scrollportRef={scrollportRef}
      disabled={disabled || !long}
    />
  );
}
