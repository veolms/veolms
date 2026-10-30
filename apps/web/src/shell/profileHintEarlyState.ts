import {
  NOTIFICATION_SUMMARY_SESSION_KEY_PREFIX,
  PROFILE_CHIP_SESSION_KEY,
} from "../store/accountBrowserState";

/**
 * The profile button before the session check has answered.
 *
 * The page is the same for everyone, so the button is in it in three forms
 * (see `EarlyProfileButtons`) and the document's head picks one before the
 * first paint:
 *
 * - nobody signed in (`data-session-hint` absent): "Login";
 * - signed in, and this tab remembers the account (the identity hint the
 *   app keeps in session storage): the signed-in button itself, its name,
 *   picture, second line, role icon and unread dot handed to the style as
 *   custom properties and attributes on <html> (`data-profile-hint…`);
 * - signed in, but nothing remembered in this tab (a new tab): a
 *   placeholder until the session check answers.
 *
 * The second line, its icon and the unread count are what the real button
 * showed last in this tab (`rememberProfileChip`, and the saved notification
 * summary), so the button the app draws when the session check answers is
 * the same one, to the pixel.
 */
export const PROFILE_HINT_ATTRIBUTE = "data-profile-hint";

/** What the signed-in button shows under the name. */
export interface ProfileChip {
  userId: string;
  /** "@handle", or the role ("Admin") of an account that switches views. */
  subtitle: string;
  /** The role icon after the subtitle, when there is one. */
  icon: "student" | "admin" | "creator" | null;
}

/** Kept for the next load of this tab (see the head script below). */
export function rememberProfileChip(chip: ProfileChip) {
  try {
    sessionStorage.setItem(PROFILE_CHIP_SESSION_KEY, JSON.stringify(chip));
  } catch {
    // Not remembered: the next load shows the handle from the identity hint.
  }
}

function applyProfileHint(keys: {
  identityHint: string;
  chip: string;
  notificationPrefix: string;
}) {
  try {
    const hint = JSON.parse(
      sessionStorage.getItem(keys.identityHint) || "null",
    );
    if (!hint || typeof hint.displayName !== "string" || !hint.displayName) {
      return;
    }
    // A CSS string: quotes, backslashes and line breaks escaped.
    const text = (value: string) =>
      '"' +
      value
        .replace(/\\/g, "\\\\")
        .replace(/"/g, '\\"')
        .replace(/[\r\n]+/g, " ") +
      '"';
    const root = document.documentElement;
    const mark = (name: string, value = "") =>
      root.setAttribute("data-profile-hint" + name, value);

    const chip = JSON.parse(sessionStorage.getItem(keys.chip) || "null");
    const ownChip = chip && chip.userId === hint.userId ? chip : null;
    const username = typeof hint.username === "string" ? hint.username : "";
    const subtitle =
      ownChip && typeof ownChip.subtitle === "string"
        ? ownChip.subtitle
        : username
          ? username.charAt(0) === "@"
            ? username
            : "@" + username
          : "Student";
    root.style.setProperty("--profile-hint-name", text(hint.displayName));
    root.style.setProperty("--profile-hint-subtitle", text(subtitle));
    if (subtitle.charAt(0) !== "@") mark("-role");
    if (ownChip && ownChip.icon) mark("-icon", String(ownChip.icon));

    if (
      typeof hint.avatarUrl === "string" &&
      /^https?:\/\//i.test(hint.avatarUrl)
    ) {
      root.style.setProperty(
        "--profile-hint-avatar",
        "url(" + text(hint.avatarUrl) + ")",
      );
      mark("-avatar");
    }

    const summary = JSON.parse(
      sessionStorage.getItem(keys.notificationPrefix + hint.userId) || "null",
    );
    if (summary && summary.value && summary.value.unreadCount > 0) {
      mark("-unread");
    }
    mark("");
  } catch {
    // Without the hint a signed-in tab shows the placeholder, as before.
  }
}

export const getProfileHintBootstrapScript = () =>
  `(${applyProfileHint.toString()})(${JSON.stringify({
    identityHint: "veolms-auth-identity",
    chip: PROFILE_CHIP_SESSION_KEY,
    notificationPrefix: NOTIFICATION_SUMMARY_SESSION_KEY_PREFIX,
  })});`;
