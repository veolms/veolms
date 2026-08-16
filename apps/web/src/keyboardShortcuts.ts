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
