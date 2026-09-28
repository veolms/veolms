import { useCallback, useEffect, useRef } from "react";
import type { RefObject } from "react";

interface PendingSectionAnchor {
  sectionId: number;
  collapsingSectionIds: Set<number>;
  header: HTMLElement;
  scrollport: HTMLElement;
  top: number;
  animationFrameId: number;
  timeoutId: number;
  cleanup: () => void;
}

function getTransitionTimeMs(element: HTMLElement) {
  const styles = window.getComputedStyle(element);
  const durations = styles.transitionDuration
    .split(",")
    .map((value) => value.trim());
  const delays = styles.transitionDelay.split(",").map((value) => value.trim());
  const toMilliseconds = (value: string) => {
    const parsed = Number.parseFloat(value);
    if (!Number.isFinite(parsed)) return 0;
    return value.endsWith("ms") ? parsed : parsed * 1000;
  };

  return durations.reduce((maximum, duration, index) => {
    const delay = delays[index % Math.max(1, delays.length)] ?? "0s";
    return Math.max(maximum, toMilliseconds(duration) + toMilliseconds(delay));
  }, 0);
}

export function useCurriculumSectionScrollAnchor(
  scrollportRef: RefObject<HTMLElement | null>,
  isSectionExpanded: (sectionId: number) => boolean,
) {
  const pendingAnchorRef = useRef<PendingSectionAnchor | null>(null);

  const clearPendingAnchor = useCallback(() => {
    const pending = pendingAnchorRef.current;
    if (!pending) return;

    pendingAnchorRef.current = null;
    window.cancelAnimationFrame(pending.animationFrameId);
    window.clearTimeout(pending.timeoutId);
    pending.cleanup();
  }, []);

  const restoreAnchor = useCallback(() => {
    const pending = pendingAnchorRef.current;
    if (!pending || pending.collapsingSectionIds.size > 0) return;

    clearPendingAnchor();
    if (
      !pending.header.isConnected ||
      !pending.scrollport.isConnected ||
      !isSectionExpanded(pending.sectionId)
    ) {
      return;
    }

    const currentTop =
      pending.header.getBoundingClientRect().top -
      pending.scrollport.getBoundingClientRect().top;
    const offsetDelta = currentTop - pending.top;
    if (Math.abs(offsetDelta) > 1) {
      pending.scrollport.scrollTop += offsetDelta;
    }
  }, [clearPendingAnchor, isSectionExpanded]);

  const prepareSectionChange = useCallback(
    (
      sectionId: number,
      collapsingSectionIds: readonly number[],
      header: HTMLElement | null,
    ) => {
      clearPendingAnchor();
      const scrollport = scrollportRef.current;
      if (!header || !scrollport || collapsingSectionIds.length === 0) return;

      const pending: PendingSectionAnchor = {
        sectionId,
        collapsingSectionIds: new Set(collapsingSectionIds),
        header,
        scrollport,
        top:
          header.getBoundingClientRect().top -
          scrollport.getBoundingClientRect().top,
        animationFrameId: 0,
        timeoutId: 0,
        cleanup: () => {},
      };
      const cancelForUserInput = () => clearPendingAnchor();
      pending.cleanup = () => {
        scrollport.removeEventListener("wheel", cancelForUserInput);
        scrollport.removeEventListener("touchstart", cancelForUserInput);
        scrollport.removeEventListener("pointerdown", cancelForUserInput);
        scrollport.removeEventListener("keydown", cancelForUserInput);
      };
      pendingAnchorRef.current = pending;
      scrollport.addEventListener("wheel", cancelForUserInput, {
        passive: true,
      });
      scrollport.addEventListener("touchstart", cancelForUserInput, {
        passive: true,
      });
      scrollport.addEventListener("pointerdown", cancelForUserInput);
      scrollport.addEventListener("keydown", cancelForUserInput);

      pending.animationFrameId = window.requestAnimationFrame(() => {
        if (pendingAnchorRef.current !== pending) return;
        const collapsingPanels = Array.from(
          scrollport.querySelectorAll<HTMLElement>(
            "[data-curriculum-section-panel]",
          ),
        ).filter((panel) =>
          pending.collapsingSectionIds.has(
            Number(panel.dataset.curriculumSectionPanel),
          ),
        );
        const transitionTime = collapsingPanels.reduce(
          (maximum, panel) => Math.max(maximum, getTransitionTimeMs(panel)),
          0,
        );

        if (transitionTime <= 0) {
          pending.collapsingSectionIds.clear();
          restoreAnchor();
          return;
        }

        pending.timeoutId = window.setTimeout(() => {
          if (pendingAnchorRef.current !== pending) return;
          pending.collapsingSectionIds.clear();
          restoreAnchor();
        }, transitionTime + 120);
      });
    },
    [clearPendingAnchor, restoreAnchor, scrollportRef],
  );

  const handleCollapseTransitionEnd = useCallback(
    (sectionId: number) => {
      const pending = pendingAnchorRef.current;
      if (!pending || !pending.collapsingSectionIds.delete(sectionId)) return;
      if (pending.collapsingSectionIds.size === 0) restoreAnchor();
    },
    [restoreAnchor],
  );

  useEffect(
    () => () => {
      const pending = pendingAnchorRef.current;
      if (!pending) return;
      window.cancelAnimationFrame(pending.animationFrameId);
      window.clearTimeout(pending.timeoutId);
      pending.cleanup();
      pendingAnchorRef.current = null;
    },
    [],
  );

  return { prepareSectionChange, handleCollapseTransitionEnd };
}
