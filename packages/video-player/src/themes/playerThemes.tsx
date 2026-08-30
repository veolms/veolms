import {
  ArrowLeft,
  ArrowCounterClockwise,
  ArrowClockwise,
  ArrowsIn,
  ArrowsInSimple,
  ArrowsOut,
  ArrowsOutSimple,
  CaretDown,
  CaretRight,
  CircleNotch,
  ClosedCaptioning,
  CornersIn,
  CornersOut,
  FastForward,
  GearFine,
  GearSix,
  ListBullets,
  MonitorPlay,
  Pause,
  PauseCircle,
  PictureInPicture,
  Play,
  PlayCircle,
  Rectangle,
  RectangleDashed,
  Rewind,
  SkipBack,
  SkipForward,
  SlidersHorizontal,
  Spinner,
  SpinnerGap,
  SpeakerHigh,
  SpeakerLow,
  SpeakerNone,
  SpeakerSimpleHigh,
  SpeakerSimpleLow,
  SpeakerSimpleNone,
  SpeakerSimpleX,
  SpeakerX,
  Speedometer,
  Subtitles,
  Warning,
  WarningCircle,
  WarningDiamond,
  X,
  type Icon,
  type IconProps,
  type IconWeight,
} from "@phosphor-icons/react";
import type { CSSProperties, ComponentType } from "react";

export const BUILT_IN_PLAYER_THEME_IDS = [
  "youtube",
  "aurora",
  "minimal",
] as const;

export type BuiltInPlayerThemeId = (typeof BUILT_IN_PLAYER_THEME_IDS)[number];

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
  audio: PlayerThemeIcon;
  chapters: PlayerThemeIcon;
  ambient: PlayerThemeIcon;
  back: PlayerThemeIcon;
  disclosure: PlayerThemeIcon;
  close: PlayerThemeIcon;
  buffering: PlayerThemeIcon;
  warning: PlayerThemeIcon;
  retry: PlayerThemeIcon;
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
  menuText: string;
  menuTextMuted: string;
  menuBorder: string;
  menuShadow: string;
  menuRadius: string;
  timelineTrack: string;
  timelineBuffered: string;
  vignetteColor: string;
}

export interface PlayerThemeMotion {
  settingsClosedRotation: number;
  settingsOpenRotation: number;
}

export interface PlayerThemeDefinition {
  id: string;
  label: string;
  description: string;
  className?: string;
  tokens: PlayerThemeTokens;
  icons: PlayerThemeIcons;
  motion: PlayerThemeMotion;
}

export type PlayerTheme = BuiltInPlayerThemeId | PlayerThemeDefinition;

export interface CreatePlayerThemeOptions {
  id: string;
  label: string;
  description?: string;
  base?: PlayerTheme;
  className?: string;
  tokens?: Partial<PlayerThemeTokens>;
  icons?: Partial<PlayerThemeIcons>;
  motion?: Partial<PlayerThemeMotion>;
}

export type PlayerThemeStyle = CSSProperties &
  Partial<Record<`--video-player-${string}`, string | number>>;

function themedIcon(
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
  audio: themedIcon(SpeakerHigh, "regular"),
  chapters: themedIcon(ListBullets, "regular"),
  ambient: themedIcon(MonitorPlay, "regular", "duotone"),
  back: themedIcon(ArrowLeft, "regular"),
  disclosure: themedIcon(CaretRight, "regular"),
  close: themedIcon(X, "bold"),
  buffering: themedIcon(SpinnerGap, "bold"),
  warning: themedIcon(WarningCircle, "regular", "fill"),
  retry: themedIcon(ArrowClockwise, "bold"),
};

const auroraIcons: PlayerThemeIcons = {
  play: themedIcon(PlayCircle, "duotone", "fill"),
  pause: themedIcon(PauseCircle, "duotone", "fill"),
  previous: themedIcon(Rewind, "duotone", "fill"),
  next: themedIcon(FastForward, "duotone", "fill"),
  volumeMuted: themedIcon(SpeakerSimpleX, "duotone"),
  volumeQuiet: themedIcon(SpeakerSimpleNone, "duotone"),
  volumeMedium: themedIcon(SpeakerSimpleLow, "duotone"),
  volumeHigh: themedIcon(SpeakerSimpleHigh, "duotone"),
  captions: themedIcon(Subtitles, "duotone", "fill"),
  settings: themedIcon(GearFine, "duotone"),
  fullscreenEnter: themedIcon(CornersOut, "bold"),
  fullscreenExit: themedIcon(CornersIn, "bold"),
  pictureInPicture: themedIcon(PictureInPicture, "duotone", "fill"),
  theaterEnter: themedIcon(Rectangle, "duotone"),
  theaterExit: themedIcon(RectangleDashed, "duotone"),
  minimize: themedIcon(CaretDown, "bold"),
  quality: themedIcon(SlidersHorizontal, "duotone"),
  playbackRate: themedIcon(Speedometer, "duotone"),
  audio: themedIcon(SpeakerSimpleHigh, "duotone"),
  chapters: themedIcon(ListBullets, "duotone"),
  ambient: themedIcon(MonitorPlay, "duotone", "fill"),
  back: themedIcon(ArrowLeft, "bold"),
  disclosure: themedIcon(CaretRight, "bold"),
  close: themedIcon(X, "bold"),
  buffering: themedIcon(CircleNotch, "duotone"),
  warning: themedIcon(WarningDiamond, "duotone", "fill"),
  retry: themedIcon(ArrowCounterClockwise, "bold"),
};

const minimalIcons: PlayerThemeIcons = {
  play: themedIcon(Play, "regular", "fill"),
  pause: themedIcon(Pause, "regular", "fill"),
  previous: themedIcon(SkipBack, "regular"),
  next: themedIcon(SkipForward, "regular"),
  volumeMuted: themedIcon(SpeakerSimpleX, "regular"),
  volumeQuiet: themedIcon(SpeakerSimpleNone, "regular"),
  volumeMedium: themedIcon(SpeakerSimpleLow, "regular"),
  volumeHigh: themedIcon(SpeakerSimpleHigh, "regular"),
  captions: themedIcon(Subtitles, "regular", "fill"),
  settings: themedIcon(SlidersHorizontal, "regular"),
  fullscreenEnter: themedIcon(ArrowsOut, "regular"),
  fullscreenExit: themedIcon(ArrowsIn, "regular"),
  pictureInPicture: themedIcon(PictureInPicture, "regular", "fill"),
  theaterEnter: themedIcon(Rectangle, "regular"),
  theaterExit: themedIcon(RectangleDashed, "regular"),
  minimize: themedIcon(CaretDown, "regular"),
  quality: themedIcon(SlidersHorizontal, "regular"),
  playbackRate: themedIcon(Speedometer, "regular"),
  audio: themedIcon(SpeakerSimpleHigh, "regular"),
  chapters: themedIcon(ListBullets, "regular"),
  ambient: themedIcon(MonitorPlay, "regular", "fill"),
  back: themedIcon(ArrowLeft, "regular"),
  disclosure: themedIcon(CaretRight, "regular"),
  close: themedIcon(X, "regular"),
  buffering: themedIcon(Spinner, "regular"),
  warning: themedIcon(Warning, "regular", "fill"),
  retry: themedIcon(ArrowClockwise, "regular"),
};

export const BUILT_IN_PLAYER_THEMES: Record<
  BuiltInPlayerThemeId,
  PlayerThemeDefinition
> = {
  youtube: {
    id: "youtube",
    label: "YouTube",
    description: "Familiar pill controls with a clean, cinematic overlay.",
    tokens: {
      accent: "#ff7a1a",
      accentContrast: "#0b0b0b",
      controlSurface: "rgb(5 7 11 / 0.72)",
      controlSurfaceHover: "rgb(255 255 255 / 0.16)",
      controlSurfaceActive: "rgb(255 255 255 / 0.2)",
      controlText: "#ffffff",
      controlTextMuted: "rgb(255 255 255 / 0.7)",
      controlBorder: "transparent",
      controlShadow: "0 5px 16px rgb(0 0 0 / 0.28)",
      controlRadius: "999px",
      menuSurface: "rgb(11 11 13 / 0.88)",
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
    motion: { settingsClosedRotation: 30, settingsOpenRotation: 90 },
  },
  aurora: {
    id: "aurora",
    label: "Aurora",
    description:
      "Expressive violet controls with cyan detail and softer icons.",
    tokens: {
      accent: "#a78bfa",
      accentContrast: "#160c2e",
      controlSurface: "rgb(29 20 52 / 0.86)",
      controlSurfaceHover: "rgb(139 92 246 / 0.3)",
      controlSurfaceActive: "rgb(34 211 238 / 0.26)",
      controlText: "#f5f3ff",
      controlTextMuted: "rgb(237 233 254 / 0.72)",
      controlBorder: "rgb(196 181 253 / 0.3)",
      controlShadow: "0 8px 24px rgb(15 8 35 / 0.4)",
      controlRadius: "14px",
      menuSurface: "rgb(24 16 43 / 0.94)",
      menuText: "#f5f3ff",
      menuTextMuted: "rgb(221 214 254 / 0.7)",
      menuBorder: "rgb(196 181 253 / 0.28)",
      menuShadow: "0 18px 46px rgb(15 8 35 / 0.48)",
      menuRadius: "18px",
      timelineTrack: "rgb(221 214 254 / 0.32)",
      timelineBuffered: "rgb(103 232 249 / 0.45)",
      vignetteColor: "22 12 46",
    },
    icons: auroraIcons,
    motion: { settingsClosedRotation: 0, settingsOpenRotation: 60 },
  },
  minimal: {
    id: "minimal",
    label: "Minimal",
    description: "Crisp monochrome controls with compact geometry and no glow.",
    tokens: {
      accent: "#f8fafc",
      accentContrast: "#0f172a",
      controlSurface: "rgb(248 250 252 / 0.92)",
      controlSurfaceHover: "rgb(226 232 240 / 0.96)",
      controlSurfaceActive: "rgb(203 213 225 / 0.96)",
      controlText: "#0f172a",
      controlTextMuted: "rgb(15 23 42 / 0.66)",
      controlBorder: "rgb(255 255 255 / 0.42)",
      controlShadow: "0 6px 18px rgb(0 0 0 / 0.24)",
      controlRadius: "9px",
      menuSurface: "rgb(248 250 252 / 0.97)",
      menuText: "#0f172a",
      menuTextMuted: "rgb(51 65 85 / 0.75)",
      menuBorder: "rgb(148 163 184 / 0.42)",
      menuShadow: "0 18px 40px rgb(0 0 0 / 0.3)",
      menuRadius: "10px",
      timelineTrack: "rgb(248 250 252 / 0.36)",
      timelineBuffered: "rgb(248 250 252 / 0.62)",
      vignetteColor: "2 6 23",
    },
    icons: minimalIcons,
    motion: { settingsClosedRotation: 0, settingsOpenRotation: 90 },
  },
};

export const PLAYER_THEME_OPTIONS = BUILT_IN_PLAYER_THEME_IDS.map(
  (id) => BUILT_IN_PLAYER_THEMES[id],
);

export function isBuiltInPlayerThemeId(
  value: unknown,
): value is BuiltInPlayerThemeId {
  return (
    typeof value === "string" &&
    BUILT_IN_PLAYER_THEME_IDS.includes(value as BuiltInPlayerThemeId)
  );
}

export function resolvePlayerTheme(
  theme: PlayerTheme = "youtube",
): PlayerThemeDefinition {
  return typeof theme === "string" ? BUILT_IN_PLAYER_THEMES[theme] : theme;
}

export function createPlayerTheme({
  base = "youtube",
  className,
  description = "Custom video-player theme.",
  icons,
  id,
  label,
  motion,
  tokens,
}: CreatePlayerThemeOptions): PlayerThemeDefinition {
  const resolvedBase = resolvePlayerTheme(base);
  return {
    id,
    label,
    description,
    className,
    tokens: { ...resolvedBase.tokens, ...tokens },
    icons: { ...resolvedBase.icons, ...icons },
    motion: { ...resolvedBase.motion, ...motion },
  };
}

export function getPlayerThemeStyle(
  theme: PlayerThemeDefinition,
): PlayerThemeStyle {
  const { tokens } = theme;
  return {
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
    "--video-player-menu-text": tokens.menuText,
    "--video-player-menu-text-muted": tokens.menuTextMuted,
    "--video-player-menu-border": tokens.menuBorder,
    "--video-player-menu-shadow": tokens.menuShadow,
    "--video-player-menu-radius": tokens.menuRadius,
    "--video-player-timeline-track": tokens.timelineTrack,
    "--video-player-timeline-buffered": tokens.timelineBuffered,
    "--video-player-vignette-rgb": tokens.vignetteColor,
  };
}
