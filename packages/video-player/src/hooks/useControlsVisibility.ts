import { useEffect, useRef, type RefObject } from "react";
import { usePlayerController } from "../react/context";
import { usePlayerState } from "../react/usePlayerState";

export interface UseControlsVisibilityOptions {
  rootRef: RefObject<HTMLElement | null>;
  idleDelay?: number;
}

export function useControlsVisibility({
  idleDelay = 2_200,
  rootRef,
}: UseControlsVisibilityOptions): void {
  const controller = usePlayerController();
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { controlsLocked, paused, scrubbing, settingsOpen } = usePlayerState(
    ({ media, ui }) => ({
      controlsLocked: ui.controlsLocked,
      paused: media.paused,
      scrubbing: ui.scrubbing,
      settingsOpen: ui.settingsView !== "closed",
    }),
    (left, right) =>
      left.controlsLocked === right.controlsLocked &&
      left.paused === right.paused &&
      left.scrubbing === right.scrubbing &&
      left.settingsOpen === right.settingsOpen,
  );

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    const clearTimer = () => {
      if (hideTimerRef.current === null) return;
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    };
    const scheduleHide = (respectCurrentFocus = true) => {
      clearTimer();
      if (
        paused ||
        scrubbing ||
        settingsOpen ||
        controlsLocked ||
        (respectCurrentFocus && root.contains(document.activeElement))
      ) {
        controller.setControlsVisible(true);
        return;
      }
      hideTimerRef.current = setTimeout(
        () => {
          hideTimerRef.current = null;
          if (root.contains(document.activeElement)) {
            controller.setControlsVisible(true);
            return;
          }
          controller.setControlsVisible(false);
        },
        idleDelay,
      );
    };
    const reveal = () => {
      controller.setControlsVisible(true);
      scheduleHide();
    };
    const handleFocusOut = (event: FocusEvent) => {
      const nextTarget = event.relatedTarget;
      if (nextTarget instanceof Node && root.contains(nextTarget)) return;
      scheduleHide(false);
    };
    root.addEventListener("pointermove", reveal, { passive: true });
    root.addEventListener("pointerdown", reveal, { passive: true });
    root.addEventListener("focusin", reveal);
    root.addEventListener("focusout", handleFocusOut);
    root.addEventListener("keydown", reveal);
    scheduleHide();

    return () => {
      clearTimer();
      root.removeEventListener("pointermove", reveal);
      root.removeEventListener("pointerdown", reveal);
      root.removeEventListener("focusin", reveal);
      root.removeEventListener("focusout", handleFocusOut);
      root.removeEventListener("keydown", reveal);
    };
  }, [
    controller,
    controlsLocked,
    idleDelay,
    paused,
    rootRef,
    scrubbing,
    settingsOpen,
  ]);
}
