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
  if (scrollElement) {
    scrollElement.scrollTo(options);
    return;
  }

  window.scrollTo(options);
};
