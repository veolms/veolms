export interface ApplicationScrollPosition {
  left: number;
  top: number;
}

const desktopFramedLayout = "(min-width: 821px)";

export const getApplicationScrollElement = (): HTMLElement | null => {
  if (typeof document === "undefined" || typeof window === "undefined") {
    return null;
  }

  if (
    document.documentElement.dataset.contentLayout !== "framed" ||
    !window.matchMedia(desktopFramedLayout).matches
  ) {
    return null;
  }

  return document.querySelector<HTMLElement>("main.courses-main");
};

export const readApplicationScrollPosition = (): ApplicationScrollPosition => {
  const scrollElement = getApplicationScrollElement();
  return scrollElement
    ? { left: scrollElement.scrollLeft, top: scrollElement.scrollTop }
    : { left: window.scrollX, top: window.scrollY };
};

export const scrollApplicationTo = (options: ScrollToOptions): void => {
  const scrollElement = getApplicationScrollElement();
  const behaviorElement = scrollElement ?? document.documentElement;
  const previousScrollBehavior = behaviorElement.style.scrollBehavior;

  // `auto` normally inherits the global smooth-scroll rule. Route restoration
  // must be synchronous so an old page position is never animated on screen.
  if (options.behavior === "auto") {
    behaviorElement.style.scrollBehavior = "auto";
  }

  try {
    if (scrollElement) {
      scrollElement.scrollTo(options);
      return;
    }

    window.scrollTo(options);
  } finally {
    if (options.behavior === "auto") {
      behaviorElement.style.scrollBehavior = previousScrollBehavior;
    }
  }
};
