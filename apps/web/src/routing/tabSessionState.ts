export type SettingsTab =
  | "profile"
  | "appearance"
  | "sidebar"
  | "learning"
  | "notifications"
  | "security"
  | "account";

/** The admin's Platform page (academy-wide settings). */
export type PlatformTab =
  "home" | "appearance" | "security" | "general" | "invoice";

export type DiscussionTab =
  "all" | "q-and-a" | "comments" | "notes" | "mentions" | "following" | "saved";

export const SETTINGS_DEFAULT_TAB: SettingsTab = "appearance";
export const DISCUSSIONS_DEFAULT_TAB: DiscussionTab = "all";
export const PLATFORM_DEFAULT_TAB: PlatformTab = "home";
export const SETTINGS_TAB_SESSION_KEY = "veolms-session-settings-tab";
export const PLATFORM_TAB_SESSION_KEY = "veolms-session-platform-tab";
export const DISCUSSIONS_TAB_SESSION_KEY = "veolms-session-discussions-tab";

const settingsTabs = new Set<SettingsTab>([
  "profile",
  "appearance",
  "sidebar",
  "learning",
  "notifications",
  "security",
  "account",
]);

// Profile, notifications, privacy and the account only mean something to a
// signed-in account; a guest's Settings leaves them out.
const signedInSettingsTabs = new Set<SettingsTab>([
  "notifications",
  "security",
  "profile",
  "account",
]);

export const isSignedInSettingsTab = (tab: SettingsTab) =>
  signedInSettingsTabs.has(tab);

export const PLATFORM_TABS: readonly PlatformTab[] = [
  "home",
  "appearance",
  "security",
  "general",
  "invoice",
];
const platformTabs = new Set<PlatformTab>(PLATFORM_TABS);

const discussionTabs = new Set<DiscussionTab>([
  "all",
  "q-and-a",
  "comments",
  "notes",
  "mentions",
  "following",
  "saved",
]);

const getSessionStorage = (): Storage | null => {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
};

export const normalizeSettingsTab = (value: unknown): SettingsTab =>
  typeof value === "string" && settingsTabs.has(value as SettingsTab)
    ? (value as SettingsTab)
    : SETTINGS_DEFAULT_TAB;

export const normalizePlatformTab = (value: unknown): PlatformTab =>
  typeof value === "string" && platformTabs.has(value as PlatformTab)
    ? (value as PlatformTab)
    : PLATFORM_DEFAULT_TAB;

export const normalizeDiscussionTab = (value: unknown): DiscussionTab =>
  typeof value === "string" && discussionTabs.has(value as DiscussionTab)
    ? (value as DiscussionTab)
    : DISCUSSIONS_DEFAULT_TAB;

export const readSettingsTab = (): SettingsTab => {
  try {
    return normalizeSettingsTab(
      getSessionStorage()?.getItem(SETTINGS_TAB_SESSION_KEY),
    );
  } catch {
    return SETTINGS_DEFAULT_TAB;
  }
};

export const readPlatformTab = (): PlatformTab => {
  try {
    return normalizePlatformTab(
      getSessionStorage()?.getItem(PLATFORM_TAB_SESSION_KEY),
    );
  } catch {
    return PLATFORM_DEFAULT_TAB;
  }
};

export const readDiscussionTab = (): DiscussionTab => {
  try {
    return normalizeDiscussionTab(
      getSessionStorage()?.getItem(DISCUSSIONS_TAB_SESSION_KEY),
    );
  } catch {
    return DISCUSSIONS_DEFAULT_TAB;
  }
};

export const rememberSettingsTab = (tab: SettingsTab) => {
  try {
    getSessionStorage()?.setItem(SETTINGS_TAB_SESSION_KEY, tab);
  } catch {
    // Session storage can be unavailable in privacy-restricted contexts.
  }
};

export const rememberPlatformTab = (tab: PlatformTab) => {
  try {
    getSessionStorage()?.setItem(PLATFORM_TAB_SESSION_KEY, tab);
  } catch {
    // Session storage can be unavailable in privacy-restricted contexts.
  }
};

export const rememberDiscussionTab = (tab: DiscussionTab) => {
  try {
    getSessionStorage()?.setItem(DISCUSSIONS_TAB_SESSION_KEY, tab);
  } catch {
    // Session storage can be unavailable in privacy-restricted contexts.
  }
};

/**
 * Forgets which Settings, Platform and Discussions tabs were last open. They are kept
 * for the browser tab, which outlives a sign-out, so the next account to
 * sign in there was taken to the previous account's last tab.
 */
export const forgetSessionTabs = () => {
  try {
    const storage = getSessionStorage();
    storage?.removeItem(SETTINGS_TAB_SESSION_KEY);
    storage?.removeItem(PLATFORM_TAB_SESSION_KEY);
    storage?.removeItem(DISCUSSIONS_TAB_SESSION_KEY);
  } catch {
    // Session storage can be unavailable in privacy-restricted contexts.
  }
};

export const resolveSessionTabPath = (path: string): string => {
  const suffixIndex = path.search(/[?#]/);
  const pathname = suffixIndex < 0 ? path : path.slice(0, suffixIndex);
  const suffix = suffixIndex < 0 ? "" : path.slice(suffixIndex);
  const normalizedPathname = pathname.replace(/\/+$/, "") || "/";

  if (normalizedPathname === "/settings") {
    return `/settings/${readSettingsTab()}${suffix}`;
  }
  if (normalizedPathname === "/platform") {
    return `/platform/${readPlatformTab()}${suffix}`;
  }
  if (normalizedPathname === "/discussions") {
    return `/discussions/${readDiscussionTab()}${suffix}`;
  }
  return path;
};
