import { useEffect, type RefObject } from "react";
import type { PlayerShortcutOverrides } from "../keyboard";
import { useControlsVisibility } from "../hooks/useControlsVisibility";
import { usePlayerKeyboard } from "../hooks/usePlayerKeyboard";
import { usePlayerState } from "./usePlayerState";

export interface PlayerBehaviorBridgeProps {
  rootRef: RefObject<HTMLElement | null>;
  shortcuts?: PlayerShortcutOverrides;
  keyboardEnabled?: boolean;
  controlsIdleDelay?: number;
  onToggleTheater?: () => void;
}

export function PlayerBehaviorBridge({
  controlsIdleDelay,
  keyboardEnabled,
  onToggleTheater,
  rootRef,
  shortcuts,
}: PlayerBehaviorBridgeProps) {
  const { controlsVisible, playing } = usePlayerState(
    ({ media, ui }) => ({
      controlsVisible: ui.controlsVisible,
      playing: media.playing,
    }),
    (left, right) =>
      left.controlsVisible === right.controlsVisible &&
      left.playing === right.playing,
  );
  usePlayerKeyboard({
    enabled: keyboardEnabled,
    onToggleTheater,
    rootRef,
    shortcuts,
  });
  useControlsVisibility({ idleDelay: controlsIdleDelay, rootRef });

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    root.dataset.playing = playing ? "true" : "false";
    root.dataset.controlsVisible = controlsVisible ? "true" : "false";
  }, [controlsVisible, playing, rootRef]);

  return null;
}
