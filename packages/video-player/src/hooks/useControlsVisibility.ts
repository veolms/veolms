import { useEffect, useRef, type RefObject } from "react";
import { usePlayerController } from "../react/context";
import { usePlayerState } from "../react/usePlayerState";
import { usePlayerMobileInteraction } from "../react/PlayerInteractionMode";

const FINE_POINTER_QUERY = "(hover: hover) and (pointer: fine)";

type PlayerPointerMode = "mouse" | "touch";
type PlayerInputMode = "keyboard" | "pointer";

export interface UseControlsVisibilityOptions {
  rootRef: RefObject<HTMLElement | null>;
  idleDelay?: number;
  /**
   * How long the controls stay after a touch, when that differs from
   * `idleDelay`. A finger has no hover to keep them: a tap shows them and
   * the next tap must find them still there, so a phone keeps them longer
   * than a mouse that can wake them by moving.
   */
  touchIdleDelay?: number;
  keepVisibleUntilFirstPlay?: boolean;
}

export function useControlsVisibility({
  idleDelay = 2_200,
  touchIdleDelay = idleDelay,
  keepVisibleUntilFirstPlay = false,
  rootRef,
}: UseControlsVisibilityOptions): void {
  const controller = usePlayerController();
  const mobileInteraction = usePlayerMobileInteraction();
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pointerModeRef = useRef<PlayerPointerMode>("touch");
  const pointerInsideRef = useRef(false);
  const inputModeRef = useRef<PlayerInputMode>("pointer");
  // A keyboard shortcut showed the controls: they stay for the idle delay
  // even with the mouse away from the player, as after a mouse move.
  const keyboardRevealRef = useRef(false);
  const pointerFocusPendingRef = useRef(false);
  const initializedPointerModeRef = useRef(false);
  const previousPausedRef = useRef(true);
  const activeSourceKeyRef = useRef<string | null>(null);
  const hasPlayedActiveSourceRef = useRef(false);
  // Before a source has played, its controls are held on screen so the
  // viewer is not left looking at a still frame with nothing to press. A
  // tap on the empty picture is the viewer asking for them to go, though,
  // and ends that hold: from then on taps show and hide them as usual.
  const firstPlayHoldDismissedRef = useRef(false);
  const deferredTouchPointersRef = useRef(new Set<number>());
  const {
    controlsLocked,
    controlsVisible,
    paused,
    playing,
    scrubbing,
    sourceKey,
    settingsOpen,
    temporarySpeedBoost,
  } = usePlayerState(
    ({ media, ui }) => ({
      controlsLocked: ui.controlsLocked,
      controlsVisible: ui.controlsVisible,
      paused: media.paused,
      playing: media.playing,
      scrubbing: ui.scrubbing,
      sourceKey: media.source ? (media.source.id ?? media.source.src) : null,
      settingsOpen: ui.settingsView !== "closed",
      temporarySpeedBoost: ui.temporarySpeedBoost,
    }),
    (left, right) =>
      left.controlsLocked === right.controlsLocked &&
      left.controlsVisible === right.controlsVisible &&
      left.paused === right.paused &&
      left.playing === right.playing &&
      left.scrubbing === right.scrubbing &&
      left.sourceKey === right.sourceKey &&
      left.settingsOpen === right.settingsOpen &&
      left.temporarySpeedBoost === right.temporarySpeedBoost,
  );

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    const pointerRoot = root.closest<HTMLElement>(".video-shell") ?? root;
    const deferredTouchPointers = deferredTouchPointersRef.current;
    if (activeSourceKeyRef.current !== sourceKey) {
      activeSourceKeyRef.current = sourceKey;
      hasPlayedActiveSourceRef.current = false;
      firstPlayHoldDismissedRef.current = false;
    }
    if (playing) hasPlayedActiveSourceRef.current = true;
    const firstPlaybackPending =
      keepVisibleUntilFirstPlay &&
      !hasPlayedActiveSourceRef.current &&
      !firstPlayHoldDismissedRef.current;

    const pointerQuery =
      typeof window !== "undefined" && typeof window.matchMedia === "function"
        ? window.matchMedia(FINE_POINTER_QUERY)
        : null;
    // A mouse shows the controls as it comes over the player and hides them
    // as it leaves, in the phone layout too (a narrow window on a computer).
    // In between, the desktop layout shows them whenever the mouse moves;
    // the phone layout leaves that to a click, as a tap, which shows or
    // hides them (PlayerGestureSurface), and moving only keeps up the ones
    // that are already showing. A finger shows and hides them with taps.
    const usesDesktopPointer = () => pointerQuery?.matches ?? false;
    const isDesktopMousePointer = (event: PointerEvent) =>
      event.pointerType === "mouse";
    if (!initializedPointerModeRef.current || mobileInteraction) {
      if (!initializedPointerModeRef.current) {
        pointerModeRef.current = usesDesktopPointer() ? "mouse" : "touch";
      }
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
      firstPlaybackPending ||
      scrubbing ||
      settingsOpen ||
      controlsLocked ||
      hasKeyboardFocus();
    const controlsTemporarilySuppressed = () =>
      !firstPlaybackPending &&
      (temporarySpeedBoost ||
        controller.getSnapshot().ui.hud?.variant === "mobile-seek");
    const delaysControlsReveal = (target: EventTarget | null) =>
      target instanceof Element &&
      target.closest('[data-player-controls-reveal="delayed"]') !== null;

    const scheduleHide = () => {
      clearTimer();
      if (controlsTemporarilySuppressed()) {
        controller.setControlsVisible(false);
        return;
      }
      if (controlsMustRemainVisible()) {
        controller.setControlsVisible(true);
        return;
      }

      if (
        pointerModeRef.current === "mouse" &&
        !pointerInsideRef.current &&
        !keyboardRevealRef.current
      ) {
        controller.setControlsVisible(false);
        return;
      }
      if (paused) {
        return;
      }

      hideTimerRef.current = setTimeout(
        () => {
          hideTimerRef.current = null;
          keyboardRevealRef.current = false;
          if (controlsMustRemainVisible()) {
            controller.setControlsVisible(true);
            return;
          }
          controller.setControlsVisible(false);
        },
        pointerModeRef.current === "touch" ? touchIdleDelay : idleDelay,
      );
    };

    const revealFromPointer = (event: PointerEvent) => {
      inputModeRef.current = "pointer";
      keyboardRevealRef.current = false;
      const desktopMousePointer = isDesktopMousePointer(event);
      pointerModeRef.current = desktopMousePointer ? "mouse" : "touch";
      pointerInsideRef.current = desktopMousePointer;
      if (controlsTemporarilySuppressed()) {
        controller.setControlsVisible(false);
        return;
      }
      controller.setControlsVisible(true);
      scheduleHide();
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (!isDesktopMousePointer(event)) return;
      if (mobileInteraction && !controller.getSnapshot().ui.controlsVisible) {
        pointerModeRef.current = "mouse";
        pointerInsideRef.current = true;
        return;
      }
      revealFromPointer(event);
    };

    const handlePointerDown = (event: PointerEvent) => {
      if (
        event.pointerType === "touch" &&
        event.target instanceof Element &&
        event.target.closest("[data-player-zoom-surface]")
      ) {
        firstPlayHoldDismissedRef.current = true;
      }
      if (delaysControlsReveal(event.target)) {
        deferredTouchPointers.delete(event.pointerId);
        inputModeRef.current = "pointer";
        pointerModeRef.current = isDesktopMousePointer(event)
          ? "mouse"
          : "touch";
        pointerInsideRef.current = false;
        clearTimer();
        controller.setControlsVisible(false);
      } else if (
        event.pointerType === "touch" &&
        !controller.getSnapshot().ui.controlsVisible
      ) {
        inputModeRef.current = "pointer";
        pointerModeRef.current = "touch";
        pointerInsideRef.current = false;
        clearTimer();
        if (controlsTemporarilySuppressed()) {
          controller.setControlsVisible(false);
        } else {
          deferredTouchPointers.add(event.pointerId);
        }
      } else {
        revealFromPointer(event);
      }
      pointerFocusPendingRef.current = true;
      queueMicrotask(() => {
        pointerFocusPendingRef.current = false;
      });
    };

    const handlePointerUp = (event: PointerEvent) => {
      if (!deferredTouchPointers.delete(event.pointerId)) return;
      if (deferredTouchPointers.size > 0) return;
      revealFromPointer(event);
    };

    const handlePointerCancel = (event: PointerEvent) => {
      deferredTouchPointers.delete(event.pointerId);
    };

    const handlePointerEnter = (event: PointerEvent) => {
      if (!isDesktopMousePointer(event)) return;
      revealFromPointer(event);
    };

    const handlePointerLeave = (event: PointerEvent) => {
      if (!isDesktopMousePointer(event)) return;
      pointerInsideRef.current = false;
      keyboardRevealRef.current = false;
      clearTimer();
      if (controlsMustRemainVisible()) {
        controller.setControlsVisible(true);
        return;
      }
      controller.setControlsVisible(false);
    };

    const revealFromKeyboard = () => {
      if (controlsTemporarilySuppressed()) {
        controller.setControlsVisible(false);
        return;
      }
      keyboardRevealRef.current = true;
      controller.setControlsVisible(true);
      scheduleHide();
    };

    const handleDocumentKeyDown = (event: KeyboardEvent) => {
      // Moving between the controls with Tab keeps them on screen while one
      // of them has focus. A shortcut (an arrow, Space) does not: the
      // controls it shows hide again after the idle delay, as after a mouse
      // move, though the player kept the focus a click gave it.
      if (event.key === "Tab") inputModeRef.current = "keyboard";
      if (!(event.target instanceof Node) || !root.contains(event.target))
        return;
      revealFromKeyboard();
    };

    const handleFocusIn = (event: FocusEvent) => {
      if (!pointerFocusPendingRef.current) inputModeRef.current = "keyboard";
      if (delaysControlsReveal(event.target)) {
        clearTimer();
        controller.setControlsVisible(false);
        return;
      }
      if (controlsTemporarilySuppressed()) {
        controller.setControlsVisible(false);
        return;
      }
      controller.setControlsVisible(true);
      scheduleHide();
    };

    const handleFocusOut = (event: FocusEvent) => {
      const nextTarget = event.relatedTarget;
      if (nextTarget instanceof Node && root.contains(nextTarget)) return;
      scheduleHide();
    };

    const handlePointerCapabilityChange = () => {
      const desktopPointer = usesDesktopPointer();
      pointerModeRef.current = desktopPointer ? "mouse" : "touch";
      pointerInsideRef.current = false;
      clearTimer();
      if (desktopPointer && !controlsMustRemainVisible()) {
        controller.setControlsVisible(false);
      } else if (paused) controller.setControlsVisible(true);
      else scheduleHide();
    };

    const becamePaused = paused && !previousPausedRef.current;
    previousPausedRef.current = paused;
    if (firstPlaybackPending) {
      clearTimer();
      controller.setControlsVisible(true);
    } else if (becamePaused && pointerModeRef.current === "touch") {
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

    pointerRoot.addEventListener("pointermove", handlePointerMove, {
      passive: true,
    });
    pointerRoot.addEventListener("pointerdown", handlePointerDown, {
      passive: true,
    });
    pointerRoot.addEventListener("pointerup", handlePointerUp, {
      passive: true,
    });
    pointerRoot.addEventListener("pointercancel", handlePointerCancel, {
      passive: true,
    });
    pointerRoot.addEventListener("pointerenter", handlePointerEnter, {
      passive: true,
    });
    pointerRoot.addEventListener("pointerleave", handlePointerLeave, {
      passive: true,
    });
    root.addEventListener("focusin", handleFocusIn);
    root.addEventListener("focusout", handleFocusOut);
    document.addEventListener("keydown", handleDocumentKeyDown, true);
    const stopRevealRequests = controller.onControlsReveal(revealFromKeyboard);
    pointerQuery?.addEventListener("change", handlePointerCapabilityChange);

    return () => {
      clearTimer();
      deferredTouchPointers.clear();
      pointerRoot.removeEventListener("pointermove", handlePointerMove);
      pointerRoot.removeEventListener("pointerdown", handlePointerDown);
      pointerRoot.removeEventListener("pointerup", handlePointerUp);
      pointerRoot.removeEventListener("pointercancel", handlePointerCancel);
      pointerRoot.removeEventListener("pointerenter", handlePointerEnter);
      pointerRoot.removeEventListener("pointerleave", handlePointerLeave);
      root.removeEventListener("focusin", handleFocusIn);
      root.removeEventListener("focusout", handleFocusOut);
      document.removeEventListener("keydown", handleDocumentKeyDown, true);
      stopRevealRequests();
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
    touchIdleDelay,
    keepVisibleUntilFirstPlay,
    mobileInteraction,
    paused,
    playing,
    rootRef,
    scrubbing,
    sourceKey,
    settingsOpen,
    temporarySpeedBoost,
  ]);
}
