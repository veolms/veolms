export type SettingsTab =
  | "profile"
  | "appearance"
  | "sidebar"
  | "learning"
  | "notifications"
  | "security"
  | "account";

export type DiscussionTab =
  "q-and-a" | "comments" | "mentions" | "following" | "saved";

export const SETTINGS_DEFAULT_TAB: SettingsTab = "profile";
export const DISCUSSIONS_DEFAULT_TAB: DiscussionTab = "q-and-a";
export const SETTINGS_TAB_SESSION_KEY = "veolms-session-settings-tab";
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

const discussionTabs = new Set<DiscussionTab>([
  "q-and-a",
  "comments",
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

export const rememberDiscussionTab = (tab: DiscussionTab) => {
  try {
    getSessionStorage()?.setItem(DISCUSSIONS_TAB_SESSION_KEY, tab);
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
  if (normalizedPathname === "/discussions") {
    return `/discussions/${readDiscussionTab()}${suffix}`;
  }
  return path;
};
