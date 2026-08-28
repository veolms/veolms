export const PLAYER_SHORTCUT_ACTIONS = [
  "playPause",
  "seekBackward",
  "seekForward",
  "seekBackwardLarge",
  "seekForwardLarge",
  "toggleMute",
  "toggleCaptions",
  "toggleFullscreen",
  "toggleTheaterMode",
  "togglePictureInPicture",
  "seekToStart",
  "seekToEnd",
  "seekToPercentage",
  "decreasePlaybackRate",
  "increasePlaybackRate",
] as const;

export type PlayerShortcutAction = (typeof PLAYER_SHORTCUT_ACTIONS)[number];

export type ShortcutBinding = string;

export type PlayerShortcutOverrides = Partial<
  Record<PlayerShortcutAction, readonly ShortcutBinding[] | false>
>;

export type ResolvedPlayerShortcutBindings = Record<
  PlayerShortcutAction,
  readonly ShortcutBinding[]
>;

export interface PlayerKeyboardActions {
  togglePlayPause?: () => void | Promise<void>;
  seekBy?: (seconds: number) => void | Promise<void>;
  seekToPercentage?: (percentage: number) => void | Promise<void>;
  toggleMute?: () => void | Promise<void>;
  toggleCaptions?: () => void | Promise<void>;
  toggleFullscreen?: () => void | Promise<void>;
  toggleTheaterMode?: () => void | Promise<void>;
  togglePictureInPicture?: () => void | Promise<void>;
  adjustPlaybackRate?: (direction: -1 | 1) => void | Promise<void>;
  beginTemporarySpeedBoost?: () => void | Promise<void>;
  endTemporarySpeedBoost?: () => void | Promise<void>;
}

export interface PlayerKeyboardControllerOptions {
  actions: PlayerKeyboardActions;
  bindings?: PlayerShortcutOverrides;
  getPlayerRoot?: () => Element | null;
}

export interface PlayerKeyboardControllerUpdate {
  actions?: PlayerKeyboardActions;
  bindings?: PlayerShortcutOverrides;
  getPlayerRoot?: () => Element | null;
}

export interface PlayerKeyboardController {
  handleKeyDown: (event: KeyboardEvent) => boolean;
  handleKeyUp: (event: KeyboardEvent) => boolean;
  handleBlur: () => void;
  isTemporarySpeedBoostActive: () => boolean;
  update: (options: PlayerKeyboardControllerUpdate) => void;
  dispose: () => void;
}

export interface ResolvedPlayerShortcut {
  action: PlayerShortcutAction;
  binding: ShortcutBinding;
  percentage?: number;
}

export interface PlayerKeyboardRegistration {
  id: string;
  controller: PlayerKeyboardController;
  getRoot: () => Element | null;
  activateOnRegister?: boolean;
}

export interface PlayerKeyboardRegistrationHandle {
  activate: () => void;
  deactivate: () => void;
  isActive: () => boolean;
  unregister: () => void;
}
