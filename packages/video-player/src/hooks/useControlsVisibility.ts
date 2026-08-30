import { useEffect, useRef, type RefObject } from "react";
import { usePlayerController } from "../react/context";
import { usePlayerState } from "../react/usePlayerState";

const FINE_POINTER_QUERY = "(hover: hover) and (pointer: fine)";

type PlayerPointerMode = "mouse" | "touch";
type PlayerInputMode = "keyboard" | "pointer";

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
  const pointerModeRef = useRef<PlayerPointerMode>("touch");
  const pointerInsideRef = useRef(false);
  const inputModeRef = useRef<PlayerInputMode>("pointer");
  const pointerFocusPendingRef = useRef(false);
  const initializedPointerModeRef = useRef(false);
  const previousPausedRef = useRef(true);
  const { controlsLocked, controlsVisible, paused, scrubbing, settingsOpen } =
    usePlayerState(
      ({ media, ui }) => ({
        controlsLocked: ui.controlsLocked,
        controlsVisible: ui.controlsVisible,
        paused: media.paused,
        scrubbing: ui.scrubbing,
        settingsOpen: ui.settingsView !== "closed",
      }),
      (left, right) =>
        left.controlsLocked === right.controlsLocked &&
        left.controlsVisible === right.controlsVisible &&
        left.paused === right.paused &&
        left.scrubbing === right.scrubbing &&
        left.settingsOpen === right.settingsOpen,
    );

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;

    const pointerQuery =
      typeof window !== "undefined" && typeof window.matchMedia === "function"
        ? window.matchMedia(FINE_POINTER_QUERY)
        : null;
    if (!initializedPointerModeRef.current) {
      pointerModeRef.current = pointerQuery?.matches ? "mouse" : "touch";
      initializedPointerModeRef.current = true;
      previousPausedRef.current = paused;
    }

    const clearTimer = () => {
      if (hideTimerRef.current === null) return;
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    };

    const hasKeyboardFocus = () =>
      inputModeRef.current === "keyboard" &&
      root.contains(document.activeElement);

    const controlsMustRemainVisible = () =>
      scrubbing || settingsOpen || controlsLocked || hasKeyboardFocus();

    const scheduleHide = () => {
      clearTimer();
      if (controlsMustRemainVisible()) {
        controller.setControlsVisible(true);
        return;
      }

      if (pointerModeRef.current === "mouse") {
        if (!pointerInsideRef.current) {
          controller.setControlsVisible(false);
          return;
        }
        if (paused) {
          controller.setControlsVisible(true);
          return;
        }
      } else if (paused) {
        return;
      }

      hideTimerRef.current = setTimeout(() => {
        hideTimerRef.current = null;
        if (controlsMustRemainVisible()) {
          controller.setControlsVisible(true);
          return;
        }
        controller.setControlsVisible(false);
      }, idleDelay);
    };

    const revealFromPointer = (event: PointerEvent) => {
      inputModeRef.current = "pointer";
      pointerModeRef.current =
        event.pointerType === "mouse" ? "mouse" : "touch";
      if (event.pointerType === "mouse") pointerInsideRef.current = true;
      controller.setControlsVisible(true);
      scheduleHide();
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;
      revealFromPointer(event);
    };

    const handlePointerDown = (event: PointerEvent) => {
      revealFromPointer(event);
      pointerFocusPendingRef.current = true;
      queueMicrotask(() => {
        pointerFocusPendingRef.current = false;
      });
    };

    const handlePointerEnter = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;
      revealFromPointer(event);
    };

    const handlePointerLeave = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;
      pointerInsideRef.current = false;
      clearTimer();
      if (settingsOpen) controller.setSettingsView("closed");
      if (scrubbing || controlsLocked || hasKeyboardFocus()) return;
      controller.setControlsVisible(false);
    };

    const handleDocumentKeyDown = (event: KeyboardEvent) => {
      inputModeRef.current = "keyboard";
      if (!(event.target instanceof Node) || !root.contains(event.target))
        return;
      controller.setControlsVisible(true);
      scheduleHide();
    };

    const handleFocusIn = () => {
      if (!pointerFocusPendingRef.current) inputModeRef.current = "keyboard";
      controller.setControlsVisible(true);
      scheduleHide();
    };

    const handleFocusOut = (event: FocusEvent) => {
      const nextTarget = event.relatedTarget;
      if (nextTarget instanceof Node && root.contains(nextTarget)) return;
      scheduleHide();
    };

    const handlePointerCapabilityChange = (event: MediaQueryListEvent) => {
      pointerModeRef.current = event.matches ? "mouse" : "touch";
      pointerInsideRef.current = false;
      clearTimer();
      if (event.matches) controller.setControlsVisible(false);
      else if (paused) controller.setControlsVisible(true);
      else scheduleHide();
    };

    const becamePaused = paused && !previousPausedRef.current;
    previousPausedRef.current = paused;
    if (becamePaused && pointerModeRef.current === "touch") {
      controller.setControlsVisible(true);
    } else if (controlsVisible) {
      scheduleHide();
    } else if (
      pointerModeRef.current === "mouse" &&
      !pointerInsideRef.current &&
      !controlsMustRemainVisible()
    ) {
      controller.setControlsVisible(false);
    }

    root.addEventListener("pointermove", handlePointerMove, { passive: true });
    root.addEventListener("pointerdown", handlePointerDown, { passive: true });
    root.addEventListener("pointerenter", handlePointerEnter, {
      passive: true,
    });
    root.addEventListener("pointerleave", handlePointerLeave, {
      passive: true,
    });
    root.addEventListener("focusin", handleFocusIn);
    root.addEventListener("focusout", handleFocusOut);
    document.addEventListener("keydown", handleDocumentKeyDown, true);
    pointerQuery?.addEventListener("change", handlePointerCapabilityChange);

    return () => {
      clearTimer();
      root.removeEventListener("pointermove", handlePointerMove);
      root.removeEventListener("pointerdown", handlePointerDown);
      root.removeEventListener("pointerenter", handlePointerEnter);
      root.removeEventListener("pointerleave", handlePointerLeave);
      root.removeEventListener("focusin", handleFocusIn);
      root.removeEventListener("focusout", handleFocusOut);
      document.removeEventListener("keydown", handleDocumentKeyDown, true);
      pointerQuery?.removeEventListener(
        "change",
        handlePointerCapabilityChange,
      );
    };
  }, [
    controller,
    controlsLocked,
    controlsVisible,
    idleDelay,
    paused,
    rootRef,
    scrubbing,
    settingsOpen,
  ]);
}
