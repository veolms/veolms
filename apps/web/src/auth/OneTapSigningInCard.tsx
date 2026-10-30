import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { GoogleBrandIcon } from "./SocialBrandIcons";
import {
  detectAndroidSheetSize,
  OneTapSigningInSheet,
  prepareAndroidSheetFont,
} from "./OneTapSigningInSheet";

/** Who Google's prompt signed in, as its credential says. */
export interface CredentialAccount {
  name: string;
  email: string;
  picture?: string;
}

type BrowserFamily = "chrome" | "edge" | "other";

/** A square part: its size, and where its top-left corner is. */
interface Spot {
  left: number;
  top: number;
  size: number;
}

interface CardLook {
  /** The card's outer box, edge included, and where it sits. */
  width: number;
  height: number;
  radius: number;
  top: number;
  right: number;
  /** The width of the edge line drawn inside the box (none on Edge). */
  border: number;
  /**
   * Every part's place is measured from the card's outer top-left corner.
   * Words are placed by the top of their line, which is 1.4 times the
   * type size tall. They are moved down with a transform rather than
   * `top`: Chrome rounds a line's own place to whole CSS pixels, which at
   * 125% is a step of one or two screen pixels, and the native card's
   * lines sit between those steps.
   */
  icon: Spot;
  title: Spot;
  progressTop: number;
  avatar: Spot;
  name: Spot;
  email: Spot;
  light: Record<string, string>;
  dark: Record<string, string>;
}

/**
 * The browser's own sign-in card in its "Verifying…" state, the one the
 * visitor is looking at when the browser hands the page Google's answer
 * and closes it. Measured, part by part, from screen recordings of each
 * browser's card handing over to this one (Windows, at 125%, Segoe UI):
 * the card's size, corners and place, the "G", the header's words, the
 * progress line where the header's divider is, the picture, and the
 * account's name and address. Chrome's dark colours and Edge's light and
 * dark ones were measured; the others follow the same makers' palettes.
 * Other browsers show Google's card from Google's own page, in Google's
 * colours.
 *
 * A browser's card follows the browser's light or dark setting, not the
 * page's theme, so this one does too (`prefers-color-scheme`).
 */
const looks: Record<BrowserFamily, CardLook> = {
  chrome: {
    width: 377.6,
    height: 136.8,
    radius: 12,
    top: 20,
    right: 45.6,
    border: 1,
    icon: { left: 14.06, top: 17.88, size: 18.7 },
    title: { left: 44.81, top: 17.9, size: 13 },
    progressTop: 52.8,
    avatar: { left: 13.2, top: 76.45, size: 30 },
    name: { left: 55, top: 71.4, size: 12 },
    email: { left: 55, top: 91.34, size: 13 },
    dark: {
      bg: "#1F1F1F",
      edge: "#353535",
      text: "#E3E3E3",
      muted: "#C7C7C7",
      track: "#CCCCCC",
      progress: "#ABC6F4",
      shadow: "0 4px 18px rgb(0 0 0 / 0.55)",
    },
    light: {
      bg: "#FFFFFF",
      edge: "#E3E3E3",
      text: "#1F1F1F",
      muted: "#474747",
      track: "#C4C7C5",
      progress: "#0B57D0",
      shadow: "0 4px 18px rgb(0 0 0 / 0.18)",
    },
  },
  edge: {
    width: 375.2,
    height: 130.2,
    radius: 15.6,
    top: 16,
    right: 52,
    border: 0,
    icon: { left: 13.58, top: 15.8, size: 18.55 },
    title: { left: 44.2, top: 16.3, size: 13 },
    progressTop: 48,
    avatar: { left: 11.8, top: 70.6, size: 30 },
    name: { left: 54.4, top: 67.64, size: 14 },
    email: { left: 54.4, top: 87.6, size: 14 },
    dark: {
      bg: "#242424",
      edge: "transparent",
      text: "#FFFFFF",
      muted: "#F0F0F0",
      track: "#5C5C5C",
      progress: "#EFEFEF",
      shadow: "0 8px 24px rgb(0 0 0 / 0.5)",
    },
    light: {
      bg: "#FFFFFF",
      edge: "transparent",
      text: "#1A1A1A",
      muted: "#242424",
      track: "#CECECE",
      progress: "#27221F",
      shadow: "0 8px 24px rgb(0 0 0 / 0.2)",
    },
  },
  other: {
    width: 378,
    height: 128,
    radius: 8,
    top: 16,
    right: 16,
    border: 1,
    icon: { left: 13, top: 17, size: 20 },
    title: { left: 45, top: 17.2, size: 14 },
    progressTop: 53,
    avatar: { left: 13, top: 73.9, size: 32 },
    name: { left: 57, top: 72.3, size: 14 },
    email: { left: 57, top: 90.6, size: 12 },
    dark: {
      bg: "#202124",
      edge: "#3C4043",
      text: "#E8EAED",
      muted: "#9AA0A6",
      track: "#3C4043",
      progress: "#8AB4F8",
      shadow: "0 4px 16px rgb(0 0 0 / 0.5)",
    },
    light: {
      bg: "#FFFFFF",
      edge: "#DADCE0",
      text: "#202124",
      muted: "#5F6368",
      track: "#E8EAED",
      progress: "#1A73E8",
      shadow: "0 4px 16px rgb(60 64 67 / 0.25)",
    },
  },
};

function detectBrowserFamily(): BrowserFamily {
  const brands =
    (
      navigator as Navigator & {
        userAgentData?: { brands?: { brand: string }[] };
      }
    ).userAgentData?.brands?.map(({ brand }) => brand) ?? [];
  if (brands.includes("Microsoft Edge") || / Edg\//.test(navigator.userAgent))
    return "edge";
  // Chrome's own card comes with FedCM, which Chromium browsers share.
  if (brands.includes("Google Chrome") || brands.includes("Chromium"))
    return "chrome";
  return "other";
}

/**
 * Chromium's indeterminate progress line, as its native card draws it: a
 * two-second cycle in which one segment grows from the left edge and runs
 * off the right while a shorter second one follows it. Each segment is a
 * full-width bar scaled from its left edge and slid along, so only
 * transforms change.
 */
const PROGRESS_CYCLE_MS = 2000;
const firstSegment: Keyframe[] = [
  { offset: 0, transform: "translateX(0%) scaleX(0)" },
  { offset: 0.5, transform: "translateX(25%) scaleX(0.75)" },
  { offset: 0.75, transform: "translateX(100%) scaleX(0)" },
  { offset: 1, transform: "translateX(100%) scaleX(0)" },
];
const secondSegment: Keyframe[] = [
  { offset: 0, transform: "translateX(0%) scaleX(0)" },
  { offset: 0.5, transform: "translateX(0%) scaleX(0)" },
  { offset: 0.75, transform: "translateX(0%) scaleX(0.25)" },
  { offset: 1, transform: "translateX(100%) scaleX(0)" },
];

function ProgressLine() {
  const firstRef = useRef<HTMLSpanElement>(null);
  const secondRef = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const timing: KeyframeAnimationOptions = {
      duration: PROGRESS_CYCLE_MS,
      easing: "linear",
      iterations: Infinity,
    };
    const animations = [
      firstRef.current?.animate(firstSegment, timing),
      secondRef.current?.animate(secondSegment, timing),
    ];
    return () => animations.forEach((animation) => animation?.cancel());
  }, []);
  const segment =
    "absolute inset-0 origin-left bg-(--one-tap-progress) [transform:scaleX(0)]";
  return (
    <div className="absolute inset-x-0 top-(--one-tap-progress-top) h-0.5 overflow-hidden bg-(--one-tap-track)">
      <span ref={firstRef} className={segment} />
      <span ref={secondRef} className={segment} />
    </div>
  );
}

/**
 * Called when Google's prompt goes up, seconds before the account is
 * known: fetches what the card or sheet will need so it shows complete at
 * once. The sheet's font is fetched only where the sheet is used. The
 * picture is that of the Google account this browser last signed in with,
 * which is usually the one picked again.
 */
export function prepareOneTapSigningIn(lastPictureUrl?: string): void {
  if (detectAndroidSheetSize()) prepareAndroidSheetFont();
  if (lastPictureUrl) {
    const picture = new Image();
    // Fetched as the card's own picture is, so it comes from the cache.
    picture.referrerPolicy = "no-referrer";
    picture.src = lastPictureUrl;
  }
}

interface SigningInProps {
  account: CredentialAccount;
  /** The check is done: go away (the sheet slides), then call `onLeft`. */
  leaving: boolean;
  onLeft: () => void;
}

/**
 * Takes over from the browser's own sign-in prompt the moment it closes,
 * looking as it did: Chrome's sheet along the bottom on Android, the
 * browser's card in the corner elsewhere.
 */
export function OneTapSigningInCard(props: SigningInProps) {
  const [sheetSize] = useState(detectAndroidSheetSize);
  return sheetSize ? (
    <OneTapSigningInSheet {...props} size={sheetSize} />
  ) : (
    <BrowserSigningInCard {...props} />
  );
}

/**
 * Takes over from the browser's sign-in card the moment it closes: the
 * same card, in the same place, still showing its progress line and the
 * account that was picked, with "Signing in…" where it said "Verifying…"
 * and no close button. It appears at once (no fade), under the browser's
 * card as that fades away, so the two read as one. The page under it
 * turns into the signed-in one in place when the check is done, and the
 * card goes at once.
 *
 * It copies the card's look only: no browser wording ("Sign in to … with
 * google.com"), nothing to press.
 */
function BrowserSigningInCard({ account, leaving, onLeft }: SigningInProps) {
  useLayoutEffect(() => {
    if (leaving) onLeft();
  }, [leaving, onLeft]);
  const [{ look, colours }] = useState(() => {
    const family = detectBrowserFamily();
    const dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    return {
      look: looks[family],
      colours: dark ? looks[family].dark : looks[family].light,
    };
  });
  const [pictureFailed, setPictureFailed] = useState(false);
  const name = account.name || account.email || "Your Google account";
  const px = (value: number) => `${value}px`;
  // The parts are placed inside the edge line; the look measures them from
  // outside it.
  const inside = (value: number) => px(value - look.border);
  const style = {
    "--one-tap-bg": colours.bg,
    "--one-tap-edge": colours.edge,
    "--one-tap-text": colours.text,
    "--one-tap-muted": colours.muted,
    "--one-tap-track": colours.track,
    "--one-tap-progress": colours.progress,
    "--one-tap-shadow": colours.shadow,
    "--one-tap-width": px(look.width),
    "--one-tap-height": px(look.height),
    "--one-tap-radius": px(look.radius),
    "--one-tap-top": px(look.top),
    "--one-tap-right": px(look.right),
    "--one-tap-border": px(look.border),
    "--one-tap-icon-left": inside(look.icon.left),
    "--one-tap-icon-top": inside(look.icon.top),
    "--one-tap-title-left": inside(look.title.left),
    "--one-tap-title-top": inside(look.title.top),
    "--one-tap-title-size": px(look.title.size),
    "--one-tap-progress-top": inside(look.progressTop),
    "--one-tap-avatar-left": inside(look.avatar.left),
    "--one-tap-avatar-top": inside(look.avatar.top),
    "--one-tap-avatar-size": px(look.avatar.size),
    "--one-tap-name-left": inside(look.name.left),
    "--one-tap-name-top": inside(look.name.top),
    "--one-tap-name-size": px(look.name.size),
    "--one-tap-email-left": inside(look.email.left),
    "--one-tap-email-top": inside(look.email.top),
    "--one-tap-email-size": px(look.email.size),
  } as CSSProperties;

  return (
    <div
      aria-label={`Signing in as ${name}`}
      aria-live="polite"
      role="status"
      style={style}
      className="pointer-events-none fixed top-(--one-tap-top) right-(--one-tap-right) z-150 h-(--one-tap-height) w-(--one-tap-width) overflow-hidden rounded-(--one-tap-radius) border-(length:--one-tap-border) border-(--one-tap-edge) bg-(--one-tap-bg) [font-family:system-ui,'Segoe_UI',sans-serif] text-(--one-tap-text) shadow-(--one-tap-shadow) max-[440px]:right-4 max-[440px]:left-4 max-[440px]:w-auto"
    >
      <span className="absolute top-(--one-tap-icon-top) left-(--one-tap-icon-left) flex">
        <GoogleBrandIcon size={look.icon.size} />
      </span>
      <span className="absolute top-0 left-(--one-tap-title-left) translate-y-(--one-tap-title-top) text-(length:--one-tap-title-size) leading-[1.4] whitespace-nowrap">
        Signing in…
      </span>
      <ProgressLine />
      {account.picture && !pictureFailed ? (
        <img
          alt=""
          className="absolute top-(--one-tap-avatar-top) left-(--one-tap-avatar-left) size-(--one-tap-avatar-size) rounded-full object-cover"
          onError={() => setPictureFailed(true)}
          referrerPolicy="no-referrer"
          src={account.picture}
        />
      ) : (
        <span className="absolute top-(--one-tap-avatar-top) left-(--one-tap-avatar-left) grid size-(--one-tap-avatar-size) place-items-center rounded-full bg-(--one-tap-track) text-sm font-semibold text-(--one-tap-bg)">
          {name.charAt(0).toUpperCase()}
        </span>
      )}
      <span className="absolute top-0 right-4 left-(--one-tap-name-left) translate-y-(--one-tap-name-top) truncate text-(length:--one-tap-name-size) leading-[1.4]">
        {name}
      </span>
      {account.email ? (
        <span className="absolute top-0 right-4 left-(--one-tap-email-left) translate-y-(--one-tap-email-top) truncate text-(length:--one-tap-email-size) leading-[1.4] text-(--one-tap-muted)">
          {account.email}
        </span>
      ) : null}
    </div>
  );
}
