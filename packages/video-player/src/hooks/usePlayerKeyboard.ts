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
import { PLAYER_FEEDBACK_DURATION_MS } from "../controls/feedbackTiming";

/** One press of Up or Down: 5% of the volume, as on YouTube. */
const KEYBOARD_VOLUME_STEP = 0.05;

interface KeyboardSeekRun {
  direction: -1 | 1;
  totalSeconds: number;
  at: number;
}

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
  const controlsVisibleBeforeBoostRef = useRef(true);
  // Presses in the same direction while the last one is still on screen
  // add up, as double taps do: "+10", "+20", "+30".
  const seekRunRef = useRef<KeyboardSeekRun | null>(null);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return undefined;
    const scope = acquireKeyboardScope(window);
    const keyboardController = createPlayerKeyboardController({
      bindings: shortcuts,
      getPlayerRoot: () => rootRef.current,
      actions: {
        togglePlayPause: () => controller.togglePlayback(),
        seekBy: (seconds) => {
          const delta =
            Math.abs(seconds) === 5
              ? Math.sign(seconds) * seekIntervalSeconds
              : seconds;
          if (delta === 0) return;
          const direction: -1 | 1 = delta < 0 ? -1 : 1;
          const now = performance.now();
          const run = seekRunRef.current;
          const totalSeconds =
            (run?.direction === direction &&
            now - run.at < PLAYER_FEEDBACK_DURATION_MS
              ? run.totalSeconds
              : 0) + Math.round(Math.abs(delta));
          seekRunRef.current = { direction, totalSeconds, at: now };
          controller.seekBy(delta);
          controller.showHud(`${direction < 0 ? "−" : "+"}${totalSeconds}`, {
            direction,
            variant: "keyboard-seek",
          });
          controller.revealControls();
        },
        adjustVolume: (direction) => {
          const { muted, volume } = controller.getSnapshot().media;
          if (muted && direction < 0) {
            // Down leaves a muted video muted (setVolume would unmute it).
            controller.showHud("Muted", {
              direction,
              level: 0,
              variant: "volume",
            });
            controller.revealControls();
            return;
          }
          // Kept on the 5% steps, whatever the slider left it at; any step
          // brings a muted video's sound back (setVolume does).
          const next = Math.min(
            1,
            Math.max(
              0,
              Math.round((volume + direction * KEYBOARD_VOLUME_STEP) * 20) / 20,
            ),
          );
          if (next !== volume) controller.setVolume(next);
          else if (muted && next > 0) controller.setMuted(false);
          controller.showVolume(next, direction);
          controller.revealControls();
        },
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
          const snapshot = controller.getSnapshot();
          const media = snapshot.media;
          rateBeforeBoostRef.current = media.playbackRate;
          pausedBeforeBoostRef.current = media.paused;
          controlsVisibleBeforeBoostRef.current = snapshot.ui.controlsVisible;
          controller.setSettingsView("closed");
          controller.setTemporarySpeedBoost(true);
          controller.setControlsVisible(false);
          controller.setPlaybackRate(2);
          if (media.paused) void controller.play().catch(() => undefined);
          controller.showHud("2× speed", { variant: "temporary-speed" });
        },
        endTemporarySpeedBoost: () => {
          const shouldRestoreControls =
            pausedBeforeBoostRef.current ||
            controlsVisibleBeforeBoostRef.current;
          if (rateBeforeBoostRef.current !== null) {
            controller.setPlaybackRate(rateBeforeBoostRef.current);
            rateBeforeBoostRef.current = null;
          }
          if (pausedBeforeBoostRef.current) controller.pause();
          pausedBeforeBoostRef.current = false;
          controller.setTemporarySpeedBoost(false);
          controller.setControlsVisible(shouldRestoreControls);
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
