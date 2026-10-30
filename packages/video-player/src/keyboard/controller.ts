import { shouldIgnorePlayerShortcut } from "./guards.js";
import {
  resolvePlayerShortcut,
  resolvePlayerShortcutBindings,
} from "./keymap.js";
import type {
  PlayerKeyboardActions,
  PlayerKeyboardController,
  PlayerKeyboardControllerOptions,
  PlayerShortcutAction,
  ResolvedPlayerShortcut,
  ResolvedPlayerShortcutBindings,
} from "./types.js";

const invoke = (callback: (() => void | Promise<void>) | undefined): void => {
  if (!callback) return;
  try {
    void Promise.resolve(callback()).catch(() => undefined);
  } catch {
    // Shortcut failures are surfaced by the engine event channel when useful;
    // they must never become uncaught browser errors from a global handler.
  }
};

function runShortcutAction(
  shortcut: ResolvedPlayerShortcut,
  actions: PlayerKeyboardActions,
): boolean {
  const callbacks: Partial<Record<PlayerShortcutAction, () => void>> = {
    playPause: () => invoke(actions.togglePlayPause),
    seekBackward: () => invoke(() => actions.seekBy?.(-5)),
    seekForward: () => invoke(() => actions.seekBy?.(5)),
    seekBackwardLarge: () => invoke(() => actions.seekBy?.(-10)),
    seekForwardLarge: () => invoke(() => actions.seekBy?.(10)),
    toggleMute: () => invoke(actions.toggleMute),
    toggleCaptions: () => invoke(actions.toggleCaptions),
    toggleFullscreen: () => invoke(actions.toggleFullscreen),
    toggleTheaterMode: () => invoke(actions.toggleTheaterMode),
    togglePictureInPicture: () => invoke(actions.togglePictureInPicture),
    seekToStart: () => invoke(() => actions.seekToPercentage?.(0)),
    seekToEnd: () => invoke(() => actions.seekToPercentage?.(100)),
    seekToPercentage: () => {
      if (shortcut.percentage !== undefined) {
        invoke(() => actions.seekToPercentage?.(shortcut.percentage!));
      }
    },
    decreasePlaybackRate: () => invoke(() => actions.adjustPlaybackRate?.(-1)),
    increasePlaybackRate: () => invoke(() => actions.adjustPlaybackRate?.(1)),
  };
  const run = callbacks[shortcut.action];
  if (!run) return false;
  run();
  return true;
}

function isSpacePlayPause(shortcut: ResolvedPlayerShortcut): boolean {
  return (
    shortcut.action === "playPause" &&
    shortcut.binding.split("+").at(-1)?.trim().toLowerCase() === "space"
  );
}

export function createPlayerKeyboardController(
  initialOptions: PlayerKeyboardControllerOptions,
): PlayerKeyboardController {
  let actions = initialOptions.actions;
  let bindings: ResolvedPlayerShortcutBindings = resolvePlayerShortcutBindings(
    initialOptions.bindings,
  );
  let getPlayerRoot = initialOptions.getPlayerRoot ?? (() => null);
  let temporarySpeedBoostActive = false;

  const endTemporarySpeedBoost = () => {
    if (!temporarySpeedBoostActive) return;
    temporarySpeedBoostActive = false;
    invoke(actions.endTemporarySpeedBoost);
  };

  const controller: PlayerKeyboardController = {
    handleKeyDown(event) {
      if (shouldIgnorePlayerShortcut(event, getPlayerRoot())) return false;
      const shortcut = resolvePlayerShortcut(event, bindings);
      if (!shortcut) return false;

      if (isSpacePlayPause(shortcut)) {
        event.preventDefault();
        if (event.repeat && !temporarySpeedBoostActive) {
          temporarySpeedBoostActive = true;
          invoke(actions.beginTemporarySpeedBoost);
        }
        return true;
      }

      event.preventDefault();
      return runShortcutAction(shortcut, actions);
    },

    handleKeyUp(event) {
      const shortcut = resolvePlayerShortcut(event, bindings);
      if (!shortcut || !isSpacePlayPause(shortcut)) return false;

      // Always release a boost, even if focus moved to an editor while Space was
      // held. This prevents a player from becoming stuck at its temporary rate.
      if (temporarySpeedBoostActive) {
        event.preventDefault();
        endTemporarySpeedBoost();
        return true;
      }
      if (shouldIgnorePlayerShortcut(event, getPlayerRoot())) return false;

      event.preventDefault();
      invoke(actions.togglePlayPause);
      return true;
    },

    handleBlur() {
      endTemporarySpeedBoost();
    },

    isTemporarySpeedBoostActive() {
      return temporarySpeedBoostActive;
    },

    update(options) {
      if (options.actions !== undefined) actions = options.actions;
      if (options.bindings !== undefined) {
        bindings = resolvePlayerShortcutBindings(options.bindings);
      }
      if (options.getPlayerRoot !== undefined) {
        getPlayerRoot = options.getPlayerRoot;
      }
    },

    dispose() {
      endTemporarySpeedBoost();
    },
  };

  return controller;
}
