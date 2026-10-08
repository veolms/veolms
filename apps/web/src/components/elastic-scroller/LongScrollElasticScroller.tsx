import { useEffect, useState } from "react";
import { ElasticScroller } from "./ElasticScroller";
import type { ElasticScrollerProps } from "./ElasticScroller";

/** The scroller is offered once there is this many screens' worth to scroll. */
const DEFAULT_MIN_SCROLL_SCREENS = 2;

export interface LongScrollElasticScrollerProps extends ElasticScrollerProps {
  /** How many scrollport heights of scrolling make the content "long". */
  minScrollScreens?: number;
}

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
    // does not change with it, so its children are watched too.
    const sizes = new ResizeObserver(measure);
    const observeChildren = () => {
      sizes.disconnect();
      sizes.observe(scrollport);
      for (const child of scrollport.children) sizes.observe(child);
    };
    const children = new MutationObserver(() => {
      observeChildren();
      measure();
    });
    observeChildren();
    children.observe(scrollport, { childList: true });
    measure();

    return () => {
      sizes.disconnect();
      children.disconnect();
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
