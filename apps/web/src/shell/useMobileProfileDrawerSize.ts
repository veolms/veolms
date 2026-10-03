import { useCallback, useLayoutEffect, useState, type RefObject } from "react";

interface MobileProfileDrawerSizeOptions {
  open: boolean;
  popupRef: RefObject<HTMLDivElement | null>;
  initialSnapPoint: number;
  contentKey: string;
}

function outerHeight(element: HTMLElement) {
  const style = getComputedStyle(element);
  return (
    element.offsetHeight +
    (Number.parseFloat(style.marginTop) || 0) +
    (Number.parseFloat(style.marginBottom) || 0)
  );
}

export function useMobileProfileDrawerSize({
  open,
  popupRef,
  initialSnapPoint,
  contentKey,
}: MobileProfileDrawerSizeOptions) {
  const [popup, setPopup] = useState<HTMLDivElement | null>(null);
  const [snapPoint, setSnapPoint] = useState(initialSnapPoint);
  const ref = useCallback(
    (element: HTMLDivElement | null) => {
      popupRef.current = element;
      setPopup(element);
    },
    [popupRef],
  );

  useLayoutEffect(() => {
    if (!open || !popup) return;

    const body = popup.querySelector<HTMLElement>(".mobile-menu-sheet__body");
    const profile = popup.querySelector<HTMLElement>(
      ".mobile-menu-sheet__profile-wrap",
    );
    const scroll = popup.querySelector<HTMLElement>(
      ".mobile-menu-sheet__scroll",
    );
    const appearance = popup.querySelector<HTMLElement>(
      ".mobile-menu-sheet__appearance",
    );
    if (!body || !profile || !scroll || !appearance) return;

    const menu = scroll.firstElementChild as HTMLElement | null;
    let frame: number | null = null;
    const measure = () => {
      const viewportHeight =
        popup.closest<HTMLElement>('[data-slot="drawer-viewport"]')
          ?.offsetHeight ?? window.innerHeight;
      if (viewportHeight <= 0) return;

      const popupStyle = getComputedStyle(popup);
      const scrollStyle = getComputedStyle(scroll);
      // Match the body's visible-height allowance without reading animated heights.
      const chromeHeight =
        Number.parseFloat(
          popupStyle.getPropertyValue("--mobile-menu-sheet-top-space"),
        ) + Number.parseFloat(popupStyle.paddingBottom);
      const contentHeight =
        outerHeight(profile) +
        (menu ? outerHeight(menu) : 0) +
        Number.parseFloat(scrollStyle.paddingTop) +
        Number.parseFloat(scrollStyle.paddingBottom) +
        outerHeight(appearance) +
        chromeHeight;
      const next = Math.max(
        0.42,
        Math.min(1, Math.ceil(contentHeight) / viewportHeight),
      );
      setSnapPoint((current) =>
        Math.abs(current - next) * viewportHeight < 1 ? current : next,
      );
    };
    const scheduleMeasure = () => {
      if (frame !== null) return;
      frame = window.requestAnimationFrame(() => {
        frame = null;
        measure();
      });
    };

    measure();
    const observer = new ResizeObserver(scheduleMeasure);
    for (const element of [profile, menu, appearance]) {
      if (element) observer.observe(element);
    }
    window.addEventListener("resize", scheduleMeasure);
    window.visualViewport?.addEventListener("resize", scheduleMeasure);
    return () => {
      if (frame !== null) window.cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", scheduleMeasure);
      window.visualViewport?.removeEventListener("resize", scheduleMeasure);
    };
  }, [open, popup, contentKey]);

  return { ref, snapPoint };
}
