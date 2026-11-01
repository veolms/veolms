import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import googleSansFontUrl from "../assets/fonts/google-sans-latin.woff2?url";
import { GoogleBrandIcon } from "./SocialBrandIcons";
import { OneTapAndroidProgressLine } from "./OneTapAndroidProgressLine";
import type { CredentialAccount } from "./OneTapSigningInCard";

/**
 * Chrome on Android shows Google's sign-in as its own sheet along the
 * bottom of the screen, not as a card in the corner: full width on a phone,
 * 600px wide and centred on a tablet, above the system's navigation bar.
 */
export type AndroidSheetSize = "phone" | "tablet";

interface SheetColours {
  bg: string;
  text: string;
  muted: string;
  track: string;
  progress: string;
}

interface SheetLook {
  /** The sheet's height above the bottom safe area. */
  height: number;
  /**
   * Every part's place is measured from the sheet's top-left corner. The
   * icon, picture and words are moved into place with a transform: Chrome
   * snaps an image's `left`/`top` to whole CSS pixels, and the native
   * sheet's parts sit between them. Words are placed by the top of their
   * line, which is 1.4 times the type size tall.
   */
  icon: { left: number; top: number; size: number };
  title: { left: number; top: number; size: number; weight: number };
  progressTop: number;
  avatar: { left: number; top: number };
  name: { left: number; top: number; size: number };
  email: { left: number; top: number; size: number };
  dark: SheetColours;
  light: SheetColours;
}

/**
 * Measured from screen recordings of the sheet in its "Verifying…" state
 * handing over to this one (a phone at 3x, recorded at 2/3 size, and a
 * tablet at 2.5x), by rendering this sheet at each device's size, putting
 * it through the same scaling and video compression, and matching it part
 * by part to the recorded frames. The tablet's sheet sets its title in the
 * medium weight and spaces the account's two lines further apart.
 *
 * The sheet's colours are the device's own (Material You, from its
 * wallpaper), which a page cannot read; these are the two recorded
 * devices' dark ones. The light ones are the same palettes' light roles
 * (background, on-surface, on-surface-variant, secondary container,
 * primary), not recorded.
 */
const looks: Record<AndroidSheetSize, SheetLook> = {
  phone: {
    height: 138,
    icon: { left: 24.81, top: 18.78, size: 18.4 },
    title: { left: 60.45, top: 19.4, size: 14, weight: 400 },
    progressTop: 56,
    avatar: { left: 24, top: 79.88 },
    name: { left: 80.2, top: 82.1, size: 13.8 },
    email: { left: 79.1, top: 101.2, size: 14.1 },
    dark: {
      bg: "#0F131B",
      text: "#E0E3ED",
      muted: "#C4C7D2",
      track: "#3C4762",
      progress: "#B0C3FD",
    },
    light: {
      bg: "#FAF8FF",
      text: "#1A1B21",
      muted: "#44464F",
      track: "#DCE2F9",
      progress: "#485D92",
    },
  },
  tablet: {
    height: 147.2,
    icon: { left: 24.85, top: 18.65, size: 18.4 },
    title: { left: 59.9, top: 19, size: 14.24, weight: 500 },
    progressTop: 56.4,
    avatar: { left: 24, top: 84.57 },
    name: { left: 79.7, top: 83.5, size: 14.2 },
    email: { left: 80.35, top: 107.7, size: 14.1 },
    dark: {
      bg: "#131217",
      text: "#E3E2E7",
      muted: "#C8C6D0",
      track: "#49455D",
      progress: "#C0C1FE",
    },
    light: {
      bg: "#FBF8FF",
      text: "#1B1B21",
      muted: "#46464F",
      track: "#E2E0F9",
      progress: "#565992",
    },
  },
};

/** The native sheet's close: it slides down, measured at 112 ms. */
const LEAVE_MS = 112;
const LEAVE_EASING = "cubic-bezier(0.4, 0, 0.2, 1)";

/**
 * The native sheet's words are in Google Sans. Its Latin letters ship with
 * the app (OFL); they are fetched when Google's prompt goes up, seconds
 * before this sheet can be needed, and only where the sheet is used.
 */
const SHEET_FONT_FAMILY = "OneTapGoogleSans";
let sheetFontRequested = false;

export function prepareAndroidSheetFont(): void {
  if (sheetFontRequested || typeof FontFace === "undefined") return;
  sheetFontRequested = true;
  const face = new FontFace(
    SHEET_FONT_FAMILY,
    `url(${googleSansFontUrl}) format("woff2")`,
    { weight: "400 700", display: "swap" },
  );
  document.fonts.add(face);
  void face.load().catch(() => {
    // The fallback fonts below still show the words.
  });
}

/**
 * Whether this is Chrome on Android, which shows Google's prompt (FedCM)
 * as its own sheet. A phone says "Android". A large tablet opens pages in
 * Chrome's desktop mode by default (10" or more, 8 GB or more), and then
 * says "Linux", with a desktop user agent; so does any phone or tablet
 * whose "Desktop site" box is ticked. What the mode does not change is the
 * browser's own features: the contact picker (`ContactsManager`) is
 * Chrome's on Android only. Failing that, a "Linux" Chrome whose main
 * pointer is a finger is taken for one too; a Linux computer has a mouse
 * or touchpad, even with a touch screen. Windows, macOS and ChromeOS say
 * so in either mode, and keep the corner card.
 */
function isChromeOnAndroid(): boolean {
  const data = (
    navigator as Navigator & {
      userAgentData?: { platform?: string; brands?: { brand: string }[] };
    }
  ).userAgentData;
  if (!data?.brands?.some(({ brand }) => brand === "Google Chrome")) {
    return false;
  }
  if (data.platform === "Android") return true;
  if (data.platform !== "Linux") return false;
  if ("ContactsManager" in window) return true;
  return (
    navigator.maxTouchPoints > 0 &&
    window.matchMedia("(pointer: coarse)").matches
  );
}

/**
 * Which sheet this browser shows, or null where it shows no sheet. The
 * screen's size decides, not the window's or the user agent's: a tablet
 * keeps its tablet sheet in desktop mode, or in split screen.
 */
export function detectAndroidSheetSize(): AndroidSheetSize | null {
  if (!isChromeOnAndroid()) return null;
  return Math.min(window.screen.width, window.screen.height) >= 600
    ? "tablet"
    : "phone";
}

/**
 * Takes over from Chrome's sign-in sheet on Android the moment it closes:
 * the same sheet, in the same place, under it as it slides away, with
 * "Signing in…" where it said "Verifying…", its progress line carrying on
 * and no close button. When the check is done it slides away as the
 * native one does.
 */
export function OneTapSigningInSheet({
  account,
  size,
  leaving,
  onLeft,
}: {
  account: CredentialAccount;
  size: AndroidSheetSize;
  /** The check is done: slide away, then call `onLeft`. */
  leaving: boolean;
  onLeft: () => void;
}) {
  const look = looks[size];
  // Chrome's sheet follows the browser's light or dark setting.
  const [colours] = useState(() =>
    window.matchMedia("(prefers-color-scheme: dark)").matches
      ? look.dark
      : look.light,
  );
  const [pictureFailed, setPictureFailed] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);
  const onLeftRef = useRef(onLeft);
  onLeftRef.current = onLeft;

  useLayoutEffect(() => {
    if (!leaving) return undefined;
    const sheet = sheetRef.current;
    if (!sheet) {
      onLeftRef.current();
      return undefined;
    }
    // Its shadow leaves with it.
    const animation = sheet.animate(
      [
        { transform: "translateY(0)" },
        { transform: "translateY(calc(100% + 16px))" },
      ],
      { duration: LEAVE_MS, easing: LEAVE_EASING, fill: "forwards" },
    );
    animation.onfinish = () => onLeftRef.current();
    return () => animation.cancel();
  }, [leaving]);

  const name = account.name || account.email || "Your Google account";
  const px = (value: number) => `${value}px`;
  const style = {
    "--one-tap-bg": colours.bg,
    "--one-tap-text": colours.text,
    "--one-tap-muted": colours.muted,
    "--one-tap-track": colours.track,
    "--one-tap-progress": colours.progress,
    "--one-tap-height": px(look.height),
    "--one-tap-icon-left": px(look.icon.left),
    "--one-tap-icon-top": px(look.icon.top),
    "--one-tap-title-left": px(look.title.left),
    "--one-tap-title-top": px(look.title.top),
    "--one-tap-title-size": px(look.title.size),
    "--one-tap-title-weight": look.title.weight,
    "--one-tap-progress-top": px(look.progressTop),
    "--one-tap-avatar-left": px(look.avatar.left),
    "--one-tap-avatar-top": px(look.avatar.top),
    "--one-tap-name-left": px(look.name.left),
    "--one-tap-name-top": px(look.name.top),
    "--one-tap-name-size": px(look.name.size),
    "--one-tap-email-left": px(look.email.left),
    "--one-tap-email-top": px(look.email.top),
    "--one-tap-email-size": px(look.email.size),
  } as CSSProperties;

  return (
    // Like the native sheet, it takes the taps that land on it, so none
    // reach the page's own bar under it.
    <div
      ref={sheetRef}
      aria-label={`Signing in as ${name}`}
      aria-live="polite"
      role="status"
      style={style}
      className="fixed inset-x-0 bottom-0 z-150 mx-auto w-full max-w-150 overflow-hidden rounded-t-2xl bg-(--one-tap-bg) pb-[env(safe-area-inset-bottom)] [font-family:OneTapGoogleSans,'Google_Sans',Roboto,system-ui,sans-serif] text-(--one-tap-text) shadow-[0_0_13px_rgb(0_0_0/0.25)] select-none"
    >
      <div className="relative h-(--one-tap-height)">
        <span className="absolute top-0 left-0 flex translate-x-(--one-tap-icon-left) translate-y-(--one-tap-icon-top)">
          <GoogleBrandIcon size={look.icon.size} />
        </span>
        <span className="absolute top-0 left-(--one-tap-title-left) translate-y-(--one-tap-title-top) text-(length:--one-tap-title-size) leading-[1.4] font-(--one-tap-title-weight) whitespace-nowrap">
          Signing in…
        </span>
        <OneTapAndroidProgressLine />
        {account.picture && !pictureFailed ? (
          <img
            alt=""
            className="absolute top-0 left-0 size-10 translate-x-(--one-tap-avatar-left) translate-y-(--one-tap-avatar-top) rounded-full object-cover"
            onError={() => setPictureFailed(true)}
            referrerPolicy="no-referrer"
            src={account.picture}
          />
        ) : (
          <span className="absolute top-0 left-0 grid size-10 translate-x-(--one-tap-avatar-left) translate-y-(--one-tap-avatar-top) place-items-center rounded-full bg-(--one-tap-track) text-base font-medium text-(--one-tap-text)">
            {name.charAt(0).toUpperCase()}
          </span>
        )}
        <span className="absolute top-0 right-6 left-(--one-tap-name-left) translate-y-(--one-tap-name-top) truncate text-(length:--one-tap-name-size) leading-[1.4]">
          {name}
        </span>
        {account.email ? (
          <span className="absolute top-0 right-6 left-(--one-tap-email-left) translate-y-(--one-tap-email-top) truncate text-(length:--one-tap-email-size) leading-[1.4] text-(--one-tap-muted)">
            {account.email}
          </span>
        ) : null}
      </div>
    </div>
  );
}
