export const isEditingShortcutTarget = (target: EventTarget | null): boolean =>
  target instanceof Element &&
  Boolean(
    target.closest(
      "input, textarea, select, [role='textbox'], [contenteditable]:not([contenteditable='false'])",
    ),
  );

export const getNumberShortcutIndex = (
  event: Pick<
    KeyboardEvent,
    "key" | "code" | "ctrlKey" | "metaKey" | "shiftKey"
  >,
): number | null => {
  if (event.ctrlKey || event.metaKey || event.shiftKey) return null;
  const digit = /^Digit([1-9])$/.exec(event.code)?.[1] ?? event.key;
  if (!/^[1-9]$/.test(digit)) return null;
  return Number(digit) - 1;
};

/**
 * The right-side panel's shortcut, the partner of Ctrl/⌘+B for the left
 * sidebar: it opens and closes the panel beside the page (the Discussions
 * page's discussion, the lesson page's course content). Matched by the key's
 * place, because Alt/⌥ changes the character it types.
 */
export const isRightPanelShortcut = (
  event: Pick<
    KeyboardEvent,
    "code" | "ctrlKey" | "metaKey" | "altKey" | "shiftKey"
  >,
): boolean =>
  (event.ctrlKey || event.metaKey) &&
  event.altKey &&
  !event.shiftKey &&
  event.code === "KeyB";

export const RIGHT_PANEL_SHORTCUT_ARIA = "Control+Alt+B Meta+Alt+B";

/**
 * The lesson page's course content had Alt/⌥+C before the right-side
 * panel's shortcut existed; it still works there, so nobody who learned it
 * loses it. Matched as it always was: by the key's place or its letter.
 */
export const isLegacyCourseContentShortcut = (
  event: Pick<
    KeyboardEvent,
    "code" | "key" | "ctrlKey" | "metaKey" | "altKey" | "shiftKey"
  >,
): boolean =>
  event.altKey &&
  !event.ctrlKey &&
  !event.metaKey &&
  !event.shiftKey &&
  (event.code === "KeyC" || event.key.toLowerCase() === "c");

/** The course content's shortcuts, as `aria-keyshortcuts` lists them. */
export const COURSE_CONTENT_SHORTCUT_ARIA = `${RIGHT_PANEL_SHORTCUT_ARIA} Alt+C`;

export const getRightPanelShortcutLabel = (
  platform: "windows" | "mac",
): "⌘+⌥+B" | "Ctrl+Alt+B" => (platform === "mac" ? "⌘+⌥+B" : "Ctrl+Alt+B");

export const isApplePlatform = (platform: string): boolean =>
  /Mac|iPhone|iPad|iPod/i.test(platform);

export type ShortcutPlatformPreference = "system" | "windows" | "mac";
export type ShortcutPlatform = Exclude<ShortcutPlatformPreference, "system">;

export const SHORTCUT_PLATFORM_PREFERENCE_KEY = "veolms-shortcut-platform";
export const SHORTCUT_PLATFORM_PREFERENCE_EVENT =
  "veolms-shortcut-platform-change";
export const SHORTCUT_PLATFORM_PREFERENCE_DEFAULT: ShortcutPlatformPreference =
  "system";

export const normalizeShortcutPlatformPreference = (
  value: unknown,
): ShortcutPlatformPreference =>
  value === "windows" || value === "mac" || value === "system"
    ? value
    : SHORTCUT_PLATFORM_PREFERENCE_DEFAULT;

export const readShortcutPlatformPreference =
  (): ShortcutPlatformPreference => {
    if (typeof window === "undefined")
      return SHORTCUT_PLATFORM_PREFERENCE_DEFAULT;
    try {
      return normalizeShortcutPlatformPreference(
        window.localStorage.getItem(SHORTCUT_PLATFORM_PREFERENCE_KEY),
      );
    } catch {
      return SHORTCUT_PLATFORM_PREFERENCE_DEFAULT;
    }
  };

const readNavigatorPlatform = (): string => {
  if (typeof navigator === "undefined") return "";
  const navigatorWithUserAgentData = navigator as Navigator & {
    userAgentData?: { platform?: string };
  };
  return (
    navigatorWithUserAgentData.userAgentData?.platform ||
    navigator.platform ||
    navigator.userAgent ||
    ""
  );
};

export const resolveShortcutPlatform = (
  preference = readShortcutPlatformPreference(),
  systemPlatform = readNavigatorPlatform(),
): ShortcutPlatform => {
  const normalizedPreference = normalizeShortcutPlatformPreference(preference);
  if (normalizedPreference !== "system") return normalizedPreference;
  return isApplePlatform(systemPlatform) ? "mac" : "windows";
};

export const persistShortcutPlatformPreference = (
  preference: ShortcutPlatformPreference,
): ShortcutPlatformPreference => {
  const normalizedPreference = normalizeShortcutPlatformPreference(preference);
  if (typeof window === "undefined") return normalizedPreference;
  try {
    window.localStorage.setItem(
      SHORTCUT_PLATFORM_PREFERENCE_KEY,
      normalizedPreference,
    );
  } catch {
    // The preference event still updates the current tab when storage is blocked.
  }
  window.dispatchEvent(
    new CustomEvent(SHORTCUT_PLATFORM_PREFERENCE_EVENT, {
      detail: normalizedPreference,
    }),
  );
  return normalizedPreference;
};
