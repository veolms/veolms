import { useEffect, useId, useRef, type RefObject } from "react";
import {
  PlayerKeyboardArbiter,
  createPlayerKeyboardController,
  type PlayerKeyboardRegistrationHandle,
  type PlayerShortcutOverrides,
} from "../keyboard";
import {
  formatPlaybackRate,
  getKeyboardPlaybackRate,
  playbackRatesMatch,
} from "../playback/playbackRates";
import { usePlayerController } from "../react/context";

interface SharedKeyboardScope {
  arbiter: PlayerKeyboardArbiter;
  detach: () => void;
  registrations: number;
}

const keyboardScopes = new WeakMap<Window, SharedKeyboardScope>();

function acquireKeyboardScope(target: Window): SharedKeyboardScope {
  const existing = keyboardScopes.get(target);
  if (existing) {
    existing.registrations += 1;
    return existing;
  }
  const arbiter = new PlayerKeyboardArbiter();
  const scope = {
    arbiter,
    detach: arbiter.attach(target),
    registrations: 1,
  };
  keyboardScopes.set(target, scope);
  return scope;
}

function releaseKeyboardScope(
  target: Window,
  scope: SharedKeyboardScope,
): void {
  scope.registrations -= 1;
  if (scope.registrations > 0) return;
  scope.detach();
  scope.arbiter.dispose();
  keyboardScopes.delete(target);
}

export interface UsePlayerKeyboardOptions {
  rootRef: RefObject<HTMLElement | null>;
  shortcuts?: PlayerShortcutOverrides;
  onToggleTheater?: () => void;
  seekIntervalSeconds?: number;
  enabled?: boolean;
}

/** Connects the centralized shortcut controller to the active player only. */
export function usePlayerKeyboard({
  enabled = true,
  onToggleTheater,
  rootRef,
  seekIntervalSeconds = 10,
  shortcuts,
}: UsePlayerKeyboardOptions): void {
  const controller = usePlayerController();
  const id = useId();
  const registrationRef = useRef<PlayerKeyboardRegistrationHandle | null>(null);
  const rateBeforeBoostRef = useRef<number | null>(null);
  const pausedBeforeBoostRef = useRef(false);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return undefined;
    const scope = acquireKeyboardScope(window);
    const keyboardController = createPlayerKeyboardController({
      bindings: shortcuts,
      getPlayerRoot: () => rootRef.current,
      actions: {
        togglePlayPause: () => controller.togglePlayback(),
        seekBy: (seconds) =>
          controller.seekBy(
            Math.abs(seconds) === 5
              ? Math.sign(seconds) * seekIntervalSeconds
              : seconds,
          ),
        seekToPercentage: (percentage) => {
          const duration = controller.getSnapshot().media.duration;
          controller.seekTo(duration * (percentage / 100));
        },
        toggleMute: () => controller.toggleMuted(),
        toggleCaptions: () => {
          const media = controller.getSnapshot().media;
          controller.selectTextTrack(
            media.selectedTextTrackId
              ? null
              : (media.textTracks[0]?.id ?? null),
          );
        },
        toggleFullscreen: () => controller.toggleFullscreen(),
        toggleTheaterMode: () => {
          if (onToggleTheater) onToggleTheater();
          else {
            controller.setTheaterMode(!controller.getSnapshot().ui.theater);
          }
        },
        togglePictureInPicture: () => controller.togglePictureInPicture(),
        adjustPlaybackRate: (direction) => {
          const current = controller.getSnapshot().media.playbackRate;
          const next = getKeyboardPlaybackRate(current, direction);
          if (playbackRatesMatch(current, next)) return;
          controller.setPlaybackRate(next);
          controller.showHud(formatPlaybackRate(next), {
            direction,
            variant: "playback-rate",
          });
        },
        beginTemporarySpeedBoost: () => {
          const media = controller.getSnapshot().media;
          rateBeforeBoostRef.current = media.playbackRate;
          pausedBeforeBoostRef.current = media.paused;
          controller.setPlaybackRate(2);
          if (media.paused) void controller.play().catch(() => undefined);
          controller.showHud("2× speed");
        },
        endTemporarySpeedBoost: () => {
          if (rateBeforeBoostRef.current !== null) {
            controller.setPlaybackRate(rateBeforeBoostRef.current);
            rateBeforeBoostRef.current = null;
          }
          if (pausedBeforeBoostRef.current) controller.pause();
          pausedBeforeBoostRef.current = false;
          controller.clearHud();
        },
      },
    });
    const registration = scope.arbiter.register({
      id,
      controller: keyboardController,
      getRoot: () => rootRef.current,
    });
    registrationRef.current = registration;
    const root = rootRef.current;
    const activate = () => registration.activate();
    root?.addEventListener("pointerdown", activate, { capture: true });
    root?.addEventListener("focusin", activate, { capture: true });

    return () => {
      root?.removeEventListener("pointerdown", activate, { capture: true });
      root?.removeEventListener("focusin", activate, { capture: true });
      registration.unregister();
      registrationRef.current = null;
      releaseKeyboardScope(window, scope);
    };
  }, [
    controller,
    enabled,
    id,
    onToggleTheater,
    rootRef,
    seekIntervalSeconds,
    shortcuts,
  ]);
}
