/**
 * Website themes (creator-features/40 §3 Themes). A theme is data: colours
 * for light and dark, font stacks, corner roundness, button style and the
 * layout each section starts with. Pages never name colours, so switching
 * theme changes the look and keeps every word.
 *
 * Fonts are system stacks on purpose: a published page downloads no font
 * file, which keeps it fast on a cheap phone. Every colour pair a page uses
 * is checked against WCAG 2 (4.5:1) by the API unit tests.
 */

import type { SiteSectionLayout, SiteSectionType } from "./site-pages.ts";

export const SITE_THEME_IDS = ["coach", "tech", "minimal"] as const;
export type SiteThemeId = (typeof SITE_THEME_IDS)[number];

export interface SiteThemeColours {
  /** The page. */
  bg: string;
  /** Cards and "muted" sections. */
  surface: string;
  text: string;
  /** Secondary text. */
  muted: string;
  border: string;
  /** Buttons and highlights; also readable as text on `bg`. */
  accent: string;
  /** Text on an accent button. */
  onAccent: string;
  /** The background of "accent" sections. */
  soft: string;
  /** The background of "inverse" sections, and their text. */
  inverseBg: string;
  inverseText: string;
  inverseMuted: string;
}

export interface SiteTheme {
  id: SiteThemeId;
  name: string;
  description: string;
  version: number;
  light: SiteThemeColours;
  dark: SiteThemeColours;
  fonts: { heading: string; body: string; eyebrow: string };
  /** Heading weight and letter spacing. */
  headingWeight: number;
  headingTracking: string;
  /** Corner roundness of cards and images, in px. */
  radius: number;
  buttonStyle: "pill" | "square" | "outline";
  /** The layout a newly added section starts with. */
  defaultLayouts: { [Type in SiteSectionType]: SiteSectionLayout<Type> };
}

const SYSTEM_SANS =
  'system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans", "Noto Sans Devanagari", sans-serif';
const SYSTEM_SERIF =
  'Georgia, "Times New Roman", "Noto Serif", "Noto Serif Devanagari", serif';
const SYSTEM_MONO =
  'ui-monospace, "SFMono-Regular", "Cascadia Mono", Menlo, Consolas, monospace';

export const SITE_THEMES: Readonly<Record<SiteThemeId, SiteTheme>> = {
  coach: {
    id: "coach",
    name: "Coach",
    description: "Warm and personal, for a creator's own brand.",
    version: 1,
    light: {
      bg: "#fffaf5",
      surface: "#ffffff",
      text: "#2b1d14",
      muted: "#6b5345",
      border: "#eadccf",
      accent: "#b93c0b",
      onAccent: "#ffffff",
      soft: "#fdeee2",
      inverseBg: "#2b1d14",
      inverseText: "#fffaf5",
      inverseMuted: "#e3cfc0",
    },
    dark: {
      bg: "#1c1410",
      surface: "#261b15",
      text: "#f7ede4",
      muted: "#c9b4a5",
      border: "#3d2d23",
      accent: "#fb923c",
      onAccent: "#1c1410",
      soft: "#33231a",
      inverseBg: "#f7ede4",
      inverseText: "#1c1410",
      inverseMuted: "#5c4637",
    },
    fonts: { heading: SYSTEM_SERIF, body: SYSTEM_SANS, eyebrow: SYSTEM_SANS },
    headingWeight: 700,
    headingTracking: "-0.01em",
    radius: 18,
    buttonStyle: "pill",
    defaultLayouts: {
      hero: "split",
      features: "cards",
      courses: "grid",
      testimonials: "spotlight",
      faq: "accordion",
      cta: "card",
      links: "stack",
      footer: "simple",
    },
  },
  tech: {
    id: "tech",
    name: "Tech",
    description: "Crisp and modern, for coding and technical courses.",
    version: 1,
    light: {
      bg: "#f8fafc",
      surface: "#ffffff",
      text: "#0f172a",
      muted: "#475569",
      border: "#e2e8f0",
      accent: "#4338ca",
      onAccent: "#ffffff",
      soft: "#eef2ff",
      inverseBg: "#0f172a",
      inverseText: "#f8fafc",
      inverseMuted: "#cbd5e1",
    },
    dark: {
      bg: "#0b1020",
      surface: "#131a2e",
      text: "#e2e8f0",
      muted: "#a3b1c6",
      border: "#24304d",
      accent: "#a5b4fc",
      onAccent: "#0b1020",
      soft: "#1a2340",
      inverseBg: "#e2e8f0",
      inverseText: "#0b1020",
      inverseMuted: "#334155",
    },
    fonts: { heading: SYSTEM_SANS, body: SYSTEM_SANS, eyebrow: SYSTEM_MONO },
    headingWeight: 800,
    headingTracking: "-0.025em",
    radius: 8,
    buttonStyle: "square",
    defaultLayouts: {
      hero: "centered",
      features: "grid",
      courses: "grid",
      testimonials: "grid",
      faq: "columns",
      cta: "banner",
      links: "stack",
      footer: "columns",
    },
  },
  minimal: {
    id: "minimal",
    name: "Minimal",
    description: "Quiet black and white that lets your words lead.",
    version: 1,
    light: {
      bg: "#ffffff",
      surface: "#f7f7f7",
      text: "#111111",
      muted: "#555555",
      border: "#e5e5e5",
      accent: "#111111",
      onAccent: "#ffffff",
      soft: "#f0f0f0",
      inverseBg: "#111111",
      inverseText: "#ffffff",
      inverseMuted: "#c7c7c7",
    },
    dark: {
      bg: "#0a0a0a",
      surface: "#151515",
      text: "#f5f5f5",
      muted: "#a8a8a8",
      border: "#2a2a2a",
      accent: "#f5f5f5",
      onAccent: "#0a0a0a",
      soft: "#1c1c1c",
      inverseBg: "#f5f5f5",
      inverseText: "#0a0a0a",
      inverseMuted: "#4a4a4a",
    },
    fonts: { heading: SYSTEM_SANS, body: SYSTEM_SANS, eyebrow: SYSTEM_SANS },
    headingWeight: 600,
    headingTracking: "-0.02em",
    radius: 12,
    buttonStyle: "outline",
    defaultLayouts: {
      hero: "banner",
      features: "list",
      courses: "list",
      testimonials: "grid",
      faq: "accordion",
      cta: "split",
      links: "pills",
      footer: "simple",
    },
  },
};

/** WCAG 2 contrast ratio of two `#rrggbb` colours, from 1 to 21. */
export function contrastRatio(first: string, second: string): number {
  const luminance = (hex: string) => {
    const value = Number.parseInt(hex.replace("#", ""), 16);
    const channels = [(value >> 16) & 255, (value >> 8) & 255, value & 255].map(
      (channel) => {
        const unit = channel / 255;
        return unit <= 0.03928 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4;
      },
    );
    return (
      0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!
    );
  };
  const [lighter, darker] = [luminance(first), luminance(second)].sort(
    (left, right) => right - left,
  );
  return (lighter! + 0.05) / (darker! + 0.05);
}

/** The text-on-background pairs a page draws, each needing 4.5:1. */
export function themeTextPairs(
  colours: SiteThemeColours,
): Array<[label: string, foreground: string, background: string]> {
  return [
    ["text on page", colours.text, colours.bg],
    ["text on surface", colours.text, colours.surface],
    ["text on soft", colours.text, colours.soft],
    ["muted on page", colours.muted, colours.bg],
    ["muted on surface", colours.muted, colours.surface],
    ["muted on soft", colours.muted, colours.soft],
    ["accent on page", colours.accent, colours.bg],
    ["accent on surface", colours.accent, colours.surface],
    ["button text", colours.onAccent, colours.accent],
    ["inverse text", colours.inverseText, colours.inverseBg],
    ["inverse muted", colours.inverseMuted, colours.inverseBg],
  ];
}
