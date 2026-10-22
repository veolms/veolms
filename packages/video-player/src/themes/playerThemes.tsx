import { ArrowLeftIcon as ArrowLeft } from "@phosphor-icons/react/ArrowLeft";
import { ArrowCounterClockwiseIcon as ArrowCounterClockwise } from "@phosphor-icons/react/ArrowCounterClockwise";
import { ArrowClockwiseIcon as ArrowClockwise } from "@phosphor-icons/react/ArrowClockwise";
import { ArrowRightIcon as ArrowRight } from "@phosphor-icons/react/ArrowRight";
import { ArrowsInIcon as ArrowsIn } from "@phosphor-icons/react/ArrowsIn";
import { ArrowsInSimpleIcon as ArrowsInSimple } from "@phosphor-icons/react/ArrowsInSimple";
import { ArrowsOutIcon as ArrowsOut } from "@phosphor-icons/react/ArrowsOut";
import { ArrowsOutSimpleIcon as ArrowsOutSimple } from "@phosphor-icons/react/ArrowsOutSimple";
import { CaretDownIcon as CaretDown } from "@phosphor-icons/react/CaretDown";
import { CaretDoubleLeftIcon as CaretDoubleLeft } from "@phosphor-icons/react/CaretDoubleLeft";
import { CaretDoubleRightIcon as CaretDoubleRight } from "@phosphor-icons/react/CaretDoubleRight";
import { CaretRightIcon as CaretRight } from "@phosphor-icons/react/CaretRight";
import { CircleNotchIcon as CircleNotch } from "@phosphor-icons/react/CircleNotch";
import { ClosedCaptioningIcon as ClosedCaptioning } from "@phosphor-icons/react/ClosedCaptioning";
import { CornersInIcon as CornersIn } from "@phosphor-icons/react/CornersIn";
import { CornersOutIcon as CornersOut } from "@phosphor-icons/react/CornersOut";
import { FastForwardIcon as FastForward } from "@phosphor-icons/react/FastForward";
import { GearSixIcon as GearSix } from "@phosphor-icons/react/GearSix";
import { ListBulletsIcon as ListBullets } from "@phosphor-icons/react/ListBullets";
import { MonitorPlayIcon as MonitorPlay } from "@phosphor-icons/react/MonitorPlay";
import { PauseIcon as Pause } from "@phosphor-icons/react/Pause";
import { PictureInPictureIcon as PictureInPicture } from "@phosphor-icons/react/PictureInPicture";
import { PlayIcon as Play } from "@phosphor-icons/react/Play";
import { RectangleIcon as Rectangle } from "@phosphor-icons/react/Rectangle";
import { RectangleDashedIcon as RectangleDashed } from "@phosphor-icons/react/RectangleDashed";
import { RewindIcon as Rewind } from "@phosphor-icons/react/Rewind";
import { SkipBackIcon as SkipBack } from "@phosphor-icons/react/SkipBack";
import { SkipForwardIcon as SkipForward } from "@phosphor-icons/react/SkipForward";
import { SlidersHorizontalIcon as SlidersHorizontal } from "@phosphor-icons/react/SlidersHorizontal";
import { SpinnerIcon as Spinner } from "@phosphor-icons/react/Spinner";
import { SpinnerGapIcon as SpinnerGap } from "@phosphor-icons/react/SpinnerGap";
import { SpeakerHighIcon as SpeakerHigh } from "@phosphor-icons/react/SpeakerHigh";
import { SpeakerLowIcon as SpeakerLow } from "@phosphor-icons/react/SpeakerLow";
import { SpeakerNoneIcon as SpeakerNone } from "@phosphor-icons/react/SpeakerNone";
import { SpeakerSimpleHighIcon as SpeakerSimpleHigh } from "@phosphor-icons/react/SpeakerSimpleHigh";
import { SpeakerSimpleLowIcon as SpeakerSimpleLow } from "@phosphor-icons/react/SpeakerSimpleLow";
import { SpeakerSimpleNoneIcon as SpeakerSimpleNone } from "@phosphor-icons/react/SpeakerSimpleNone";
import { SpeakerSimpleXIcon as SpeakerSimpleX } from "@phosphor-icons/react/SpeakerSimpleX";
import { SpeakerXIcon as SpeakerX } from "@phosphor-icons/react/SpeakerX";
import { SpeedometerIcon as Speedometer } from "@phosphor-icons/react/Speedometer";
import { SubtitlesIcon as Subtitles } from "@phosphor-icons/react/Subtitles";
import { WarningIcon as Warning } from "@phosphor-icons/react/Warning";
import { WarningCircleIcon as WarningCircle } from "@phosphor-icons/react/WarningCircle";
import { XIcon as X } from "@phosphor-icons/react/X";
import type { Icon, IconProps, IconWeight } from "@phosphor-icons/react";
import type { CSSProperties, ComponentType } from "react";
import {
  BUILT_IN_PLAYER_THEME_IDS,
  DEFAULT_PLAYER_THEME_ID,
} from "./playerThemeIds";
import type { BuiltInPlayerThemeId } from "./playerThemeIds";

export {
  BUILT_IN_PLAYER_THEME_IDS,
  DEFAULT_PLAYER_THEME_ID,
  isBuiltInPlayerThemeId,
  isPlayerThemeId,
} from "./playerThemeIds";
export type { BuiltInPlayerThemeId } from "./playerThemeIds";

export interface PlayerThemeIconProps extends Omit<IconProps, "weight"> {
  active?: boolean;
}

export type PlayerThemeIcon = ComponentType<PlayerThemeIconProps>;

export interface PlayerThemeIcons {
  play: PlayerThemeIcon;
  pause: PlayerThemeIcon;
  previous: PlayerThemeIcon;
  next: PlayerThemeIcon;
  volumeMuted: PlayerThemeIcon;
  volumeQuiet: PlayerThemeIcon;
  volumeMedium: PlayerThemeIcon;
  volumeHigh: PlayerThemeIcon;
  captions: PlayerThemeIcon;
  settings: PlayerThemeIcon;
  fullscreenEnter: PlayerThemeIcon;
  fullscreenExit: PlayerThemeIcon;
  pictureInPicture: PlayerThemeIcon;
  theaterEnter: PlayerThemeIcon;
  theaterExit: PlayerThemeIcon;
  minimize: PlayerThemeIcon;
  quality: PlayerThemeIcon;
  playbackRate: PlayerThemeIcon;
  speedDecrease: PlayerThemeIcon;
  speedIncrease: PlayerThemeIcon;
  audio: PlayerThemeIcon;
  chapters: PlayerThemeIcon;
  ambient: PlayerThemeIcon;
  back: PlayerThemeIcon;
  disclosure: PlayerThemeIcon;
  close: PlayerThemeIcon;
  buffering: PlayerThemeIcon;
  warning: PlayerThemeIcon;
  retry: PlayerThemeIcon;
  /** The play button once the video has ended: play it again. */
  replay: PlayerThemeIcon;
}

export interface PlayerThemeTokens {
  accent: string;
  accentContrast: string;
  controlSurface: string;
  controlSurfaceHover: string;
  controlSurfaceActive: string;
  controlText: string;
  controlTextMuted: string;
  controlBorder: string;
  controlShadow: string;
  controlRadius: string;
  menuSurface: string;
  menuSolidSurface: string;
  menuText: string;
  menuTextMuted: string;
  menuBorder: string;
  menuShadow: string;
  menuRadius: string;
  timelineTrack: string;
  timelineBuffered: string;
  vignetteColor: string;

  /*
   * Shape and type. Optional: a theme that leaves one out keeps the
   * YouTube look for that part. They apply to every theme but YouTube
   * (see the "theme kit" in playerThemes.css), which keeps its own markup
   * styles untouched.
   */

  /** Font of the controls, menus and times. */
  fontFamily?: string;
  /** Font of the time and other numbers (a monospaced one, say). */
  numericFontFamily?: string;
  /** `uppercase` for small-caps style labels (Lessons, Chapters, menus). */
  labelTransform?: string;
  labelLetterSpacing?: string;
  /** `backdrop-filter` of the control surfaces, e.g. `blur(16px)`. */
  controlBackdrop?: string;
  /** The play button (bottom row and the big one in the middle). */
  playSurface?: string;
  playText?: string;
  playRadius?: string;
  playBorder?: string;
  /**
   * What sits behind the desktop bottom controls: a scrim across the whole
   * width by default, or a floating "deck" panel with the deck tokens.
   */
  bottomScrim?: string;
  topScrim?: string;
  /** Gap between the deck and the player's edges (default 0: full width). */
  deckInset?: string;
  deckHeight?: string;
  deckRadius?: string;
  /** Full `box-shadow` of the deck (an inset one draws its border). */
  deckShadow?: string;
  deckBackdrop?: string;
  /** Pill surfaces sitting on the deck (desktop only). */
  deckControlSurface?: string;
  /** Played part of the timeline (default: the accent). */
  timelineProgress?: string;
  timelineHeight?: string;
  timelineRadius?: string;
  thumbColor?: string;
  thumbWidth?: string;
  thumbHeight?: string;
  thumbRadius?: string;
  thumbBorder?: string;
  thumbShadow?: string;
  /** `backdrop-filter` of the menus. */
  menuBackdrop?: string;
  /** Background of the selected and hovered menu rows. */
  menuRowActive?: string;
}

export interface PlayerThemeMotion {
  settingsClosedRotation: number;
  /**
   * How far the settings icon turns while its menu is open (default 60
   * degrees, for a gear). 0 for icons that should not spin, like sliders.
   */
  settingsOpenTurn?: number;
  /** @deprecated Settings menus use the shared 60-degree interaction turn. */
  settingsOpenRotation?: number;
}

export interface PlayerThemeDefinition {
  id: string;
  label: string;
  description: string;
  className?: string;
  /**
   * The app may recolour the theme with its own palette (accent, menus).
   * Only the YouTube theme does; the others bring their own colours.
   */
  usesAppPalette?: boolean;
  /** Where the theme sits in pickers: lower first (built-ins are 0-30). */
  order?: number;
  tokens: PlayerThemeTokens;
  icons: PlayerThemeIcons;
  motion: PlayerThemeMotion;
}

export type PlayerTheme =
  BuiltInPlayerThemeId | (string & {}) | PlayerThemeDefinition;

export interface CreatePlayerThemeOptions {
  id: string;
  label: string;
  description?: string;
  base?: PlayerTheme;
  className?: string;
  usesAppPalette?: boolean;
  order?: number;
  tokens?: Partial<PlayerThemeTokens>;
  icons?: Partial<PlayerThemeIcons>;
  motion?: Partial<PlayerThemeMotion>;
}

export type PlayerThemeStyle = CSSProperties &
  Partial<Record<`--video-player-${string}`, string | number>>;

/**
 * A theme icon from a Phosphor icon: `weight` at rest, `activeWeight` while
 * the control is on (captions shown, picture in picture, …).
 */
export function createThemedIcon(
  IconComponent: Icon,
  weight: IconWeight,
  activeWeight: IconWeight = weight,
): PlayerThemeIcon {
  function ThemedIcon({ active = false, ...props }: PlayerThemeIconProps) {
    return <IconComponent {...props} weight={active ? activeWeight : weight} />;
  }
  ThemedIcon.displayName = `PlayerThemeIcon(${IconComponent.displayName ?? "Icon"})`;
  return ThemedIcon;
}

const themedIcon = createThemedIcon;

const youtubeIcons: PlayerThemeIcons = {
  play: themedIcon(Play, "fill"),
  pause: themedIcon(Pause, "fill"),
  previous: themedIcon(SkipBack, "fill"),
  next: themedIcon(SkipForward, "fill"),
  volumeMuted: themedIcon(SpeakerX, "fill"),
  volumeQuiet: themedIcon(SpeakerNone, "fill"),
  volumeMedium: themedIcon(SpeakerLow, "fill"),
  volumeHigh: themedIcon(SpeakerHigh, "fill"),
  captions: themedIcon(ClosedCaptioning, "bold", "fill"),
  settings: themedIcon(GearSix, "regular"),
  fullscreenEnter: themedIcon(ArrowsOutSimple, "bold"),
  fullscreenExit: themedIcon(ArrowsInSimple, "bold"),
  pictureInPicture: themedIcon(PictureInPicture, "regular", "fill"),
  theaterEnter: themedIcon(Rectangle, "regular"),
  theaterExit: themedIcon(RectangleDashed, "regular"),
  minimize: themedIcon(CaretDown, "bold"),
  quality: themedIcon(SlidersHorizontal, "regular"),
  playbackRate: themedIcon(Speedometer, "regular"),
  speedDecrease: themedIcon(Rewind, "fill"),
  speedIncrease: themedIcon(FastForward, "fill"),
  audio: themedIcon(SpeakerHigh, "regular"),
  chapters: themedIcon(ListBullets, "regular"),
  ambient: themedIcon(MonitorPlay, "regular", "duotone"),
  back: themedIcon(ArrowLeft, "regular"),
  disclosure: themedIcon(CaretRight, "regular"),
  close: themedIcon(X, "bold"),
  buffering: themedIcon(SpinnerGap, "bold"),
  warning: themedIcon(WarningCircle, "regular", "fill"),
  retry: themedIcon(ArrowClockwise, "bold"),
  replay: themedIcon(ArrowCounterClockwise, "bold"),
};

/** Cone: solid, chunky, bold strokes; sliders for settings. */
const coneIcons: PlayerThemeIcons = {
  ...youtubeIcons,
  captions: themedIcon(ClosedCaptioning, "bold", "fill"),
  settings: themedIcon(SlidersHorizontal, "bold"),
  fullscreenEnter: themedIcon(CornersOut, "bold"),
  fullscreenExit: themedIcon(CornersIn, "bold"),
  pictureInPicture: themedIcon(PictureInPicture, "bold", "fill"),
  theaterEnter: themedIcon(Rectangle, "bold"),
  theaterExit: themedIcon(RectangleDashed, "bold"),
  quality: themedIcon(SlidersHorizontal, "bold"),
  playbackRate: themedIcon(Speedometer, "bold"),
  audio: themedIcon(SpeakerHigh, "bold"),
  chapters: themedIcon(ListBullets, "bold"),
  ambient: themedIcon(MonitorPlay, "bold", "fill"),
  back: themedIcon(ArrowLeft, "bold"),
  disclosure: themedIcon(CaretRight, "bold"),
  warning: themedIcon(WarningCircle, "bold", "fill"),
};

/** Frost: light strokes that sit quietly on glass. */
const frostIcons: PlayerThemeIcons = {
  play: themedIcon(Play, "fill"),
  pause: themedIcon(Pause, "fill"),
  previous: themedIcon(SkipBack, "fill"),
  next: themedIcon(SkipForward, "fill"),
  volumeMuted: themedIcon(SpeakerSimpleX, "regular"),
  volumeQuiet: themedIcon(SpeakerSimpleNone, "regular"),
  volumeMedium: themedIcon(SpeakerSimpleLow, "regular"),
  volumeHigh: themedIcon(SpeakerSimpleHigh, "regular"),
  captions: themedIcon(Subtitles, "regular", "fill"),
  settings: themedIcon(GearSix, "regular"),
  fullscreenEnter: themedIcon(CornersOut, "regular"),
  fullscreenExit: themedIcon(CornersIn, "regular"),
  pictureInPicture: themedIcon(PictureInPicture, "regular", "fill"),
  theaterEnter: themedIcon(Rectangle, "regular"),
  theaterExit: themedIcon(RectangleDashed, "regular"),
  minimize: themedIcon(CaretDown, "regular"),
  quality: themedIcon(SlidersHorizontal, "regular"),
  playbackRate: themedIcon(Speedometer, "regular"),
  speedDecrease: themedIcon(Rewind, "regular", "fill"),
  speedIncrease: themedIcon(FastForward, "regular", "fill"),
  audio: themedIcon(SpeakerSimpleHigh, "regular"),
  chapters: themedIcon(ListBullets, "regular"),
  ambient: themedIcon(MonitorPlay, "regular", "fill"),
  back: themedIcon(ArrowLeft, "regular"),
  disclosure: themedIcon(CaretRight, "regular"),
  close: themedIcon(X, "regular"),
  buffering: themedIcon(CircleNotch, "regular"),
  warning: themedIcon(WarningCircle, "regular", "fill"),
  retry: themedIcon(ArrowClockwise, "regular"),
  replay: themedIcon(ArrowCounterClockwise, "regular"),
};

/** Mono: hairline strokes, arrows instead of carets. */
const monoIcons: PlayerThemeIcons = {
  play: themedIcon(Play, "fill"),
  pause: themedIcon(Pause, "fill"),
  previous: themedIcon(SkipBack, "light"),
  next: themedIcon(SkipForward, "light"),
  volumeMuted: themedIcon(SpeakerSimpleX, "light"),
  volumeQuiet: themedIcon(SpeakerSimpleNone, "light"),
  volumeMedium: themedIcon(SpeakerSimpleLow, "light"),
  volumeHigh: themedIcon(SpeakerSimpleHigh, "light"),
  captions: themedIcon(Subtitles, "light", "fill"),
  settings: themedIcon(SlidersHorizontal, "light"),
  fullscreenEnter: themedIcon(ArrowsOut, "light"),
  fullscreenExit: themedIcon(ArrowsIn, "light"),
  pictureInPicture: themedIcon(PictureInPicture, "light", "fill"),
  theaterEnter: themedIcon(Rectangle, "light"),
  theaterExit: themedIcon(RectangleDashed, "light"),
  minimize: themedIcon(CaretDown, "light"),
  quality: themedIcon(SlidersHorizontal, "light"),
  playbackRate: themedIcon(Speedometer, "light"),
  speedDecrease: themedIcon(CaretDoubleLeft, "light", "bold"),
  speedIncrease: themedIcon(CaretDoubleRight, "light", "bold"),
  audio: themedIcon(SpeakerSimpleHigh, "light"),
  chapters: themedIcon(ListBullets, "light"),
  ambient: themedIcon(MonitorPlay, "light", "fill"),
  back: themedIcon(ArrowLeft, "light"),
  disclosure: themedIcon(ArrowRight, "light"),
  close: themedIcon(X, "light"),
  buffering: themedIcon(Spinner, "light"),
  warning: themedIcon(Warning, "light", "fill"),
  retry: themedIcon(ArrowClockwise, "light"),
  replay: themedIcon(ArrowCounterClockwise, "light"),
};

const MONOSPACE_STACK =
  '"IBM Plex Mono", "JetBrains Mono", ui-monospace, "SFMono-Regular", "Cascadia Mono", Menlo, Consolas, monospace';

export const BUILT_IN_PLAYER_THEMES: Record<
  BuiltInPlayerThemeId,
  PlayerThemeDefinition
> = {
  youtube: {
    id: "youtube",
    label: "YouTube",
    description: "Familiar pill controls with a clean, cinematic overlay.",
    usesAppPalette: true,
    order: 0,
    tokens: {
      accent: "#ff7a1a",
      accentContrast: "#0b0b0b",
      controlSurface: "rgb(5 7 11 / 0.5)",
      controlSurfaceHover: "rgb(255 255 255 / 0.11)",
      controlSurfaceActive: "rgb(255 255 255 / 0.14)",
      controlText: "#ffffff",
      controlTextMuted: "rgb(255 255 255 / 0.7)",
      controlBorder: "transparent",
      controlShadow: "0 5px 16px rgb(0 0 0 / 0.28)",
      controlRadius: "999px",
      menuSurface: "rgb(11 11 13 / 0.88)",
      menuSolidSurface: "rgb(11 11 13)",
      menuText: "#ffffff",
      menuTextMuted: "rgb(255 255 255 / 0.68)",
      menuBorder: "rgb(255 255 255 / 0.14)",
      menuShadow: "0 16px 40px rgb(0 0 0 / 0.38)",
      menuRadius: "14px",
      timelineTrack: "rgb(255 255 255 / 0.3)",
      timelineBuffered: "rgb(255 255 255 / 0.46)",
      vignetteColor: "5 7 11",
    },
    icons: youtubeIcons,
    motion: { settingsClosedRotation: 30 },
  },
  cone: {
    id: "cone",
    label: "Cone",
    description: "A solid deck with orange accents and square-cornered keys.",
    order: 10,
    tokens: {
      accent: "#ff7a1a",
      accentContrast: "#121212",
      controlSurface: "rgb(16 17 20 / 0.86)",
      controlSurfaceHover: "rgb(255 255 255 / 0.1)",
      controlSurfaceActive: "rgb(255 122 26 / 0.18)",
      controlText: "#ffffff",
      controlTextMuted: "rgb(255 255 255 / 0.62)",
      controlBorder: "rgb(255 255 255 / 0.12)",
      controlShadow: "0 6px 18px rgb(0 0 0 / 0.3)",
      controlRadius: "10px",
      menuSurface: "rgb(26 27 31 / 0.98)",
      menuSolidSurface: "rgb(26 27 31)",
      menuText: "#ffffff",
      menuTextMuted: "rgb(255 255 255 / 0.58)",
      menuBorder: "rgb(255 255 255 / 0.1)",
      menuShadow: "0 20px 50px rgb(0 0 0 / 0.55)",
      menuRadius: "12px",
      timelineTrack: "rgb(255 255 255 / 0.2)",
      timelineBuffered: "rgb(255 255 255 / 0.38)",
      vignetteColor: "14 15 18",
      playSurface: "#ff7a1a",
      playText: "#121212",
      playRadius: "12px",
      timelineHeight: "6px",
      timelineRadius: "3px",
      thumbWidth: "14px",
      thumbHeight: "14px",
      thumbRadius: "4px",
      thumbBorder: "2px solid #111",
      thumbShadow: "0 2px 6px rgb(0 0 0 / 0.45)",
      menuRowActive: "rgb(255 122 26 / 0.12)",
    },
    icons: coneIcons,
    motion: { settingsClosedRotation: 0, settingsOpenTurn: 0 },
  },
  frost: {
    id: "frost",
    label: "Frost",
    description: "Frosted-glass pills that float over the picture.",
    order: 20,
    tokens: {
      accent: "#9be7ff",
      accentContrast: "#06202a",
      controlSurface: "rgb(255 255 255 / 0.12)",
      controlSurfaceHover: "rgb(255 255 255 / 0.22)",
      controlSurfaceActive: "rgb(255 255 255 / 0.3)",
      controlText: "#ffffff",
      controlTextMuted: "rgb(255 255 255 / 0.7)",
      controlBorder: "rgb(255 255 255 / 0.24)",
      controlShadow:
        "0 8px 28px rgb(4 12 24 / 0.32), inset 0 1px 0 rgb(255 255 255 / 0.18)",
      controlRadius: "999px",
      menuSurface: "rgb(28 40 56 / 0.62)",
      menuSolidSurface: "rgb(24 34 48)",
      menuText: "#ffffff",
      menuTextMuted: "rgb(255 255 255 / 0.66)",
      menuBorder: "rgb(255 255 255 / 0.22)",
      menuShadow:
        "0 24px 60px rgb(2 8 20 / 0.45), inset 0 1px 0 rgb(255 255 255 / 0.16)",
      menuRadius: "22px",
      timelineTrack: "rgb(255 255 255 / 0.26)",
      timelineBuffered: "rgb(255 255 255 / 0.42)",
      vignetteColor: "8 18 32",
      controlBackdrop: "blur(18px) saturate(1.6)",
      menuBackdrop: "blur(26px) saturate(1.6)",
      playSurface: "#ffffff",
      playText: "#0b1622",
      timelineProgress: "#ffffff",
      timelineHeight: "4px",
      thumbColor: "#ffffff",
      thumbWidth: "4px",
      thumbHeight: "18px",
      thumbRadius: "2px",
      thumbShadow:
        "0 0 0 1px rgb(0 0 0 / 0.12), 0 0 12px rgb(155 231 255 / 0.85)",
      menuRowActive: "rgb(255 255 255 / 0.12)",
    },
    icons: frostIcons,
    motion: { settingsClosedRotation: 0 },
  },
  mono: {
    id: "mono",
    label: "Mono",
    description: "Editorial black and white: hairlines, type and no boxes.",
    order: 30,
    tokens: {
      accent: "#ffffff",
      accentContrast: "#000000",
      controlSurface: "transparent",
      controlSurfaceHover: "rgb(255 255 255 / 0.1)",
      controlSurfaceActive: "rgb(255 255 255 / 0.16)",
      controlText: "#ffffff",
      controlTextMuted: "rgb(255 255 255 / 0.5)",
      controlBorder: "transparent",
      controlShadow: "none",
      controlRadius: "0px",
      menuSurface: "rgb(10 10 10 / 0.97)",
      menuSolidSurface: "rgb(10 10 10)",
      menuText: "#ffffff",
      menuTextMuted: "rgb(255 255 255 / 0.5)",
      menuBorder: "rgb(255 255 255 / 0.16)",
      menuShadow: "none",
      menuRadius: "0px",
      timelineTrack: "rgb(255 255 255 / 0.28)",
      timelineBuffered: "rgb(255 255 255 / 0.5)",
      vignetteColor: "0 0 0",
      fontFamily: '"Space Grotesk", var(--font-sans, system-ui), sans-serif',
      numericFontFamily: MONOSPACE_STACK,
      labelTransform: "uppercase",
      labelLetterSpacing: "0.12em",
      playSurface: "transparent",
      playText: "#ffffff",
      playRadius: "999px",
      timelineHeight: "2px",
      timelineRadius: "0px",
      thumbWidth: "9px",
      thumbHeight: "9px",
      thumbRadius: "0px",
      thumbShadow: "0 0 0 2px rgb(0 0 0 / 0.6)",
      menuRowActive: "rgb(255 255 255 / 0.08)",
    },
    icons: monoIcons,
    motion: { settingsClosedRotation: 0, settingsOpenTurn: 0 },
  },
};

/** The built-in themes, in picker order. */
export const PLAYER_THEME_OPTIONS = BUILT_IN_PLAYER_THEME_IDS.map(
  (id) => BUILT_IN_PLAYER_THEMES[id],
);

/*
 * Themes added by plugins. Kept on `globalThis` so a plugin that ends up
 * with its own copy of this module still registers into the same list.
 */
interface PlayerThemeRegistry {
  themes: Map<string, PlayerThemeDefinition>;
  snapshot: readonly PlayerThemeDefinition[];
  listeners: Set<() => void>;
}

const REGISTRY_KEY = Symbol.for("veolms.video-player.theme-registry");

function getRegistry(): PlayerThemeRegistry {
  const holder = globalThis as typeof globalThis & {
    [REGISTRY_KEY]?: PlayerThemeRegistry;
  };
  holder[REGISTRY_KEY] ??= {
    themes: new Map(),
    snapshot: PLAYER_THEME_OPTIONS,
    listeners: new Set(),
  };
  return holder[REGISTRY_KEY];
}

function byOrder(left: PlayerThemeDefinition, right: PlayerThemeDefinition) {
  return (left.order ?? 100) - (right.order ?? 100);
}

function publish(registry: PlayerThemeRegistry): void {
  registry.snapshot = [
    ...PLAYER_THEME_OPTIONS,
    ...[...registry.themes.values()].sort(byOrder),
  ];
  for (const listener of registry.listeners) listener();
}

/**
 * Adds (or replaces, by id) a theme that pickers offer and the player can
 * use by id. Built-in ids cannot be replaced. Returns a function that
 * removes it again.
 */
export function registerPlayerTheme(theme: PlayerThemeDefinition): () => void {
  if ((BUILT_IN_PLAYER_THEME_IDS as readonly string[]).includes(theme.id)) {
    throw new Error(`"${theme.id}" is a built-in player theme.`);
  }
  const registry = getRegistry();
  registry.themes.set(theme.id, theme);
  publish(registry);
  return () => {
    if (registry.themes.get(theme.id) !== theme) return;
    registry.themes.delete(theme.id);
    publish(registry);
  };
}

/** Every theme: the built-in ones first, then the registered ones. */
export function getPlayerThemes(): readonly PlayerThemeDefinition[] {
  return getRegistry().snapshot;
}

/** For `useSyncExternalStore`: calls `listener` when themes are added. */
export function subscribePlayerThemes(listener: () => void): () => void {
  const { listeners } = getRegistry();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** A theme by id, built in or registered; `undefined` when unknown. */
export function findPlayerTheme(id: string): PlayerThemeDefinition | undefined {
  return (
    (BUILT_IN_PLAYER_THEMES as Record<string, PlayerThemeDefinition>)[id] ??
    getRegistry().themes.get(id)
  );
}

/**
 * The theme for an id or definition. An id nobody has registered (yet)
 * gives the default theme.
 */
export function resolvePlayerTheme(
  theme: PlayerTheme = DEFAULT_PLAYER_THEME_ID,
): PlayerThemeDefinition {
  if (typeof theme !== "string") return theme;
  return (
    findPlayerTheme(theme) ?? BUILT_IN_PLAYER_THEMES[DEFAULT_PLAYER_THEME_ID]
  );
}

export function createPlayerTheme({
  base = DEFAULT_PLAYER_THEME_ID,
  className,
  description = "Custom video-player theme.",
  icons,
  id,
  label,
  motion,
  order,
  tokens,
  usesAppPalette,
}: CreatePlayerThemeOptions): PlayerThemeDefinition {
  const resolvedBase = resolvePlayerTheme(base);
  return {
    id,
    label,
    description,
    className,
    // Not inherited: a theme made from YouTube's brings its own colours
    // unless it says otherwise.
    usesAppPalette: usesAppPalette ?? false,
    order: order ?? resolvedBase.order,
    tokens: { ...resolvedBase.tokens, ...tokens },
    icons: { ...resolvedBase.icons, ...icons },
    motion: { ...resolvedBase.motion, ...motion },
  };
}

/** Optional tokens and the custom properties they set. */
const OPTIONAL_TOKEN_PROPERTIES: ReadonlyArray<
  [keyof PlayerThemeTokens, `--video-player-${string}`]
> = [
  ["fontFamily", "--video-player-font"],
  ["numericFontFamily", "--video-player-numeric-font"],
  ["labelTransform", "--video-player-label-transform"],
  ["labelLetterSpacing", "--video-player-label-letter-spacing"],
  ["controlBackdrop", "--video-player-control-backdrop"],
  ["playSurface", "--video-player-play-surface"],
  ["playText", "--video-player-play-text"],
  ["playRadius", "--video-player-play-radius"],
  ["playBorder", "--video-player-play-border"],
  ["bottomScrim", "--video-player-bottom-scrim"],
  ["topScrim", "--video-player-top-scrim"],
  ["deckInset", "--video-player-deck-inset"],
  ["deckHeight", "--video-player-deck-height"],
  ["deckRadius", "--video-player-deck-radius"],
  ["deckShadow", "--video-player-deck-shadow"],
  ["deckBackdrop", "--video-player-deck-backdrop"],
  ["deckControlSurface", "--video-player-deck-control-surface"],
  ["timelineProgress", "--video-player-timeline-progress"],
  ["timelineHeight", "--video-player-timeline-height"],
  ["timelineRadius", "--video-player-timeline-radius"],
  ["thumbColor", "--video-player-thumb-color"],
  ["thumbWidth", "--video-player-thumb-width"],
  ["thumbHeight", "--video-player-thumb-height"],
  ["thumbRadius", "--video-player-thumb-radius"],
  ["thumbBorder", "--video-player-thumb-border"],
  ["thumbShadow", "--video-player-thumb-shadow"],
  ["menuBackdrop", "--video-player-menu-backdrop"],
  ["menuRowActive", "--video-player-menu-row-active"],
];

/**
 * Shadows are combined with others in one `box-shadow` list (the kit adds an
 * inset outline), where `none` would make the whole list invalid.
 */
function shadow(value: string): string {
  return value.trim() === "none" ? "0 0 #0000" : value;
}

export function getPlayerThemeStyle(
  theme: PlayerThemeDefinition,
): PlayerThemeStyle {
  const tokens = {
    ...theme.tokens,
    controlShadow: shadow(theme.tokens.controlShadow),
    menuShadow: shadow(theme.tokens.menuShadow),
  };
  const style: PlayerThemeStyle = {
    "--video-player-accent": tokens.accent,
    "--video-player-accent-contrast": tokens.accentContrast,
    "--video-player-control-surface": tokens.controlSurface,
    "--video-player-control-surface-hover": tokens.controlSurfaceHover,
    "--video-player-control-surface-active": tokens.controlSurfaceActive,
    "--video-player-control-text": tokens.controlText,
    "--video-player-control-text-muted": tokens.controlTextMuted,
    "--video-player-control-border": tokens.controlBorder,
    "--video-player-control-shadow": tokens.controlShadow,
    "--video-player-control-radius": tokens.controlRadius,
    "--video-player-menu-surface": tokens.menuSurface,
    "--video-player-menu-solid-surface": tokens.menuSolidSurface,
    "--video-player-menu-text": tokens.menuText,
    "--video-player-menu-text-muted": tokens.menuTextMuted,
    "--video-player-menu-border": tokens.menuBorder,
    "--video-player-menu-shadow": tokens.menuShadow,
    "--video-player-menu-radius": tokens.menuRadius,
    "--video-player-timeline-track": tokens.timelineTrack,
    "--video-player-timeline-buffered": tokens.timelineBuffered,
    "--video-player-vignette-rgb": tokens.vignetteColor,
  };
  for (const [token, property] of OPTIONAL_TOKEN_PROPERTIES) {
    const value = tokens[token];
    if (value !== undefined) style[property] = value;
  }
  return style;
}
