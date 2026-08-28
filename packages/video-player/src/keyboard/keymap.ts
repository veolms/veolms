import {
  PLAYER_SHORTCUT_ACTIONS,
  type PlayerShortcutAction,
  type PlayerShortcutOverrides,
  type ResolvedPlayerShortcut,
  type ResolvedPlayerShortcutBindings,
  type ShortcutBinding,
} from "./types.js";

export const DEFAULT_PLAYER_SHORTCUTS = {
  playPause: ["Space", "KeyK"],
  seekBackward: ["ArrowLeft"],
  seekForward: ["ArrowRight"],
  seekBackwardLarge: ["KeyJ"],
  seekForwardLarge: ["KeyL"],
  toggleMute: ["KeyM"],
  toggleCaptions: ["KeyC"],
  toggleFullscreen: ["KeyF"],
  toggleTheaterMode: ["KeyT"],
  togglePictureInPicture: ["KeyI"],
  seekToStart: ["Home"],
  seekToEnd: ["End"],
  seekToPercentage: [
    "Alt+Digit0",
    "Alt+Digit1",
    "Alt+Digit2",
    "Alt+Digit3",
    "Alt+Digit4",
    "Alt+Digit5",
    "Alt+Digit6",
    "Alt+Digit7",
    "Alt+Digit8",
    "Alt+Digit9",
  ],
  decreasePlaybackRate: ["Shift+Comma", "Shift+ArrowLeft"],
  increasePlaybackRate: ["Shift+Period", "Shift+ArrowRight"],
} as const satisfies ResolvedPlayerShortcutBindings;

interface ParsedShortcutBinding {
  altKey: boolean;
  codeOrKey: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
}

type ModifierName = "altKey" | "ctrlKey" | "metaKey" | "shiftKey";

const MODIFIER_NAMES: ReadonlyMap<string, ModifierName> = new Map([
  ["alt", "altKey"],
  ["ctrl", "ctrlKey"],
  ["control", "ctrlKey"],
  ["meta", "metaKey"],
  ["cmd", "metaKey"],
  ["command", "metaKey"],
  ["shift", "shiftKey"],
] as const);

const KEY_ALIASES: Readonly<Record<string, string>> = {
  space: " ",
  comma: ",",
  period: ".",
};

function parseShortcutBinding(binding: ShortcutBinding): ParsedShortcutBinding {
  const parts = binding
    .split("+")
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length === 0) {
    throw new TypeError("A keyboard shortcut binding cannot be empty.");
  }

  const parsed: ParsedShortcutBinding = {
    altKey: false,
    codeOrKey: "",
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
  };

  for (const part of parts) {
    const modifier = MODIFIER_NAMES.get(part.toLowerCase());
    if (modifier) {
      parsed[modifier] = true;
      continue;
    }
    if (parsed.codeOrKey) {
      throw new TypeError(
        `Keyboard shortcut binding "${binding}" contains more than one key.`,
      );
    }
    parsed.codeOrKey = part;
  }

  if (!parsed.codeOrKey) {
    throw new TypeError(
      `Keyboard shortcut binding "${binding}" does not contain a key.`,
    );
  }
  return parsed;
}

function bindingMatchesEvent(
  binding: ShortcutBinding,
  event: Pick<
    KeyboardEvent,
    "altKey" | "code" | "ctrlKey" | "key" | "metaKey" | "shiftKey"
  >,
): boolean {
  const parsed = parseShortcutBinding(binding);
  if (
    parsed.altKey !== event.altKey ||
    parsed.ctrlKey !== event.ctrlKey ||
    parsed.metaKey !== event.metaKey ||
    parsed.shiftKey !== event.shiftKey
  ) {
    return false;
  }

  const normalizedBindingKey = parsed.codeOrKey.toLowerCase();
  const aliasedKey = KEY_ALIASES[normalizedBindingKey];
  return (
    event.code.toLowerCase() === normalizedBindingKey ||
    event.key.toLowerCase() === normalizedBindingKey ||
    (aliasedKey !== undefined && event.key === aliasedKey)
  );
}

export function resolvePlayerShortcutBindings(
  overrides: PlayerShortcutOverrides = {},
): ResolvedPlayerShortcutBindings {
  return Object.fromEntries(
    PLAYER_SHORTCUT_ACTIONS.map((action) => {
      const override = overrides[action];
      return [
        action,
        override === false
          ? []
          : override === undefined
            ? DEFAULT_PLAYER_SHORTCUTS[action]
            : [...override],
      ];
    }),
  ) as unknown as ResolvedPlayerShortcutBindings;
}

function percentageForBinding(
  action: PlayerShortcutAction,
  event: Pick<KeyboardEvent, "code">,
): number | undefined {
  if (action !== "seekToPercentage") return undefined;
  const digit = /^Digit([0-9])$/.exec(event.code)?.[1];
  return digit === undefined ? undefined : Number(digit) * 10;
}

export function resolvePlayerShortcut(
  event: Pick<
    KeyboardEvent,
    "altKey" | "code" | "ctrlKey" | "key" | "metaKey" | "shiftKey"
  >,
  bindings: ResolvedPlayerShortcutBindings = DEFAULT_PLAYER_SHORTCUTS,
): ResolvedPlayerShortcut | null {
  for (const action of PLAYER_SHORTCUT_ACTIONS) {
    const binding = bindings[action].find((candidate) =>
      bindingMatchesEvent(candidate, event),
    );
    if (binding) {
      return {
        action,
        binding,
        percentage: percentageForBinding(action, event),
      };
    }
  }
  return null;
}
