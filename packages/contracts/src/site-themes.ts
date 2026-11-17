/**
 * Website themes (creator-features/40 §3; builder-research/PLAN.md §3.2).
 * A theme is data: colours for light and dark, font stacks, shapes (corner
 * roundness, button and card style, shadow), content width, and how much
 * the page moves. Pages never name colours, so switching theme changes the
 * look and keeps every word.
 *
 * Fonts are system stacks on purpose: a published page downloads no font
 * file, which keeps it fast on a cheap phone. Every colour pair a page uses
 * is checked against WCAG 2 (4.5:1) by the API unit tests.
 */

import type { SiteSectionLayout, SiteSectionType } from "./site-pages.ts";

export const SITE_THEME_IDS = [
  "coach",
  "tech",
  "minimal",
  "bold",
  "elegant",
  "playful",
  "academy",
  "wellness",
  "finance",
  "kids",
  "neon",
  "editorial",
] as const;
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
  /** Text on an accent button, and on "brand" sections. */
  onAccent: string;
  /** The background of "accent" sections. */
  soft: string;
  /** The background of "inverse" sections, and their text. */
  inverseBg: string;
  inverseText: string;
  inverseMuted: string;
}

/** How buttons are drawn: their shape and fill. */
export const SITE_BUTTON_STYLES = [
  "pill",
  "square",
  "outline",
  "soft",
  "gradient",
] as const;
export type SiteButtonStyle = (typeof SITE_BUTTON_STYLES)[number];

/** How cards (courses, features, quotes, prices) are drawn. */
export const SITE_CARD_STYLES = [
  "flat",
  "bordered",
  "elevated",
  "glass",
  "gradient",
  "minimal",
] as const;
export type SiteCardStyle = (typeof SITE_CARD_STYLES)[number];

/** How much the page moves: entrance animations and hover effects. */
export const SITE_MOTION_LEVELS = ["off", "subtle", "lively"] as const;
export type SiteMotionLevel = (typeof SITE_MOTION_LEVELS)[number];

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
  /** How much bigger than the default the headings are (1 = default). */
  headingScale: number;
  /** Corner roundness of cards and images, in px. */
  radius: number;
  buttonStyle: SiteButtonStyle;
  cardStyle: SiteCardStyle;
  shadow: "none" | "soft" | "strong";
  /** Content width in px. */
  width: number;
  motion: SiteMotionLevel;
  /** The layout a newly added section starts with. */
  defaultLayouts: { [Type in SiteSectionType]: SiteSectionLayout<Type> };
}

const SYSTEM_SANS =
  'system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans", "Noto Sans Devanagari", sans-serif';
const SYSTEM_SERIF =
  'Georgia, "Times New Roman", "Noto Serif", "Noto Serif Devanagari", serif';
const BOOK_SERIF =
  '"Iowan Old Style", "Palatino Linotype", "Book Antiqua", Palatino, Georgia, "Noto Serif Devanagari", serif';
const ROUNDED =
  'ui-rounded, "SF Pro Rounded", "Arial Rounded MT Bold", "Varela Round", system-ui, "Noto Sans Devanagari", sans-serif';
const GROTESK =
  '"Helvetica Neue", Helvetica, Arial, "Noto Sans", "Noto Sans Devanagari", sans-serif';
const SYSTEM_MONO =
  'ui-monospace, "SFMono-Regular", "Cascadia Mono", Menlo, Consolas, monospace';

export const SITE_THEMES: Readonly<Record<SiteThemeId, SiteTheme>> = {
  coach: {
    id: "coach",
    name: "Coach",
    description: "Warm and personal, for a creator's own brand.",
    version: 2,
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
    headingScale: 1,
    radius: 18,
    buttonStyle: "pill",
    cardStyle: "elevated",
    shadow: "soft",
    width: 1160,
    motion: "subtle",
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
    version: 2,
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
    headingScale: 1,
    radius: 8,
    buttonStyle: "square",
    cardStyle: "bordered",
    shadow: "none",
    width: 1200,
    motion: "subtle",
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
    version: 2,
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
    headingScale: 1,
    radius: 12,
    buttonStyle: "outline",
    cardStyle: "minimal",
    shadow: "none",
    width: 1080,
    motion: "subtle",
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
  bold: {
    id: "bold",
    name: "Bold Creator",
    description: "Big type and vivid colour for a creator with a following.",
    version: 1,
    light: {
      bg: "#ffffff",
      surface: "#faf5ff",
      text: "#1a1023",
      muted: "#5b4a6b",
      border: "#ece4f3",
      accent: "#a21caf",
      onAccent: "#ffffff",
      soft: "#fbeafd",
      inverseBg: "#1a1023",
      inverseText: "#ffffff",
      inverseMuted: "#d9cbe6",
    },
    dark: {
      bg: "#120a18",
      surface: "#1c1224",
      text: "#f5eefa",
      muted: "#c4b2d3",
      border: "#34243f",
      accent: "#f0abfc",
      onAccent: "#120a18",
      soft: "#2a1733",
      inverseBg: "#f5eefa",
      inverseText: "#120a18",
      inverseMuted: "#5b4a6b",
    },
    fonts: { heading: GROTESK, body: SYSTEM_SANS, eyebrow: SYSTEM_SANS },
    headingWeight: 900,
    headingTracking: "-0.04em",
    headingScale: 1.18,
    radius: 16,
    buttonStyle: "gradient",
    cardStyle: "elevated",
    shadow: "strong",
    width: 1200,
    motion: "lively",
    defaultLayouts: {
      hero: "banner",
      features: "cards",
      courses: "grid",
      testimonials: "grid",
      faq: "accordion",
      cta: "banner",
      links: "stack",
      footer: "columns",
    },
  },
  elegant: {
    id: "elegant",
    name: "Elegant Serif",
    description: "Refined serif type and a gold accent, for premium courses.",
    version: 1,
    light: {
      bg: "#fbf9f4",
      surface: "#ffffff",
      text: "#1f1b16",
      muted: "#5f574b",
      border: "#e6dfd2",
      accent: "#8a5a12",
      onAccent: "#ffffff",
      soft: "#f3ecdf",
      inverseBg: "#1f1b16",
      inverseText: "#fbf9f4",
      inverseMuted: "#d8cfbf",
    },
    dark: {
      bg: "#15120e",
      surface: "#1e1a15",
      text: "#f2ece1",
      muted: "#bfb4a2",
      border: "#3a3328",
      accent: "#e0b56a",
      onAccent: "#15120e",
      soft: "#262019",
      inverseBg: "#f2ece1",
      inverseText: "#15120e",
      inverseMuted: "#5f574b",
    },
    fonts: { heading: BOOK_SERIF, body: SYSTEM_SANS, eyebrow: SYSTEM_SANS },
    headingWeight: 600,
    headingTracking: "-0.005em",
    headingScale: 1.08,
    radius: 4,
    buttonStyle: "outline",
    cardStyle: "bordered",
    shadow: "none",
    width: 1080,
    motion: "subtle",
    defaultLayouts: {
      hero: "split",
      features: "list",
      courses: "list",
      testimonials: "spotlight",
      faq: "accordion",
      cta: "split",
      links: "stack",
      footer: "simple",
    },
  },
  playful: {
    id: "playful",
    name: "Playful",
    description:
      "Round shapes and bright pink, for hobbies and creative skills.",
    version: 1,
    light: {
      bg: "#fff8fb",
      surface: "#ffffff",
      text: "#2a1320",
      muted: "#6b4a5b",
      border: "#f3dbe6",
      accent: "#be185d",
      onAccent: "#ffffff",
      soft: "#fde7f1",
      inverseBg: "#2a1320",
      inverseText: "#fff8fb",
      inverseMuted: "#e6c8d6",
    },
    dark: {
      bg: "#1a0f16",
      surface: "#24151f",
      text: "#fdf0f6",
      muted: "#d6b8c8",
      border: "#3d2533",
      accent: "#f9a8d4",
      onAccent: "#1a0f16",
      soft: "#2f1a27",
      inverseBg: "#fdf0f6",
      inverseText: "#1a0f16",
      inverseMuted: "#6b4a5b",
    },
    fonts: { heading: ROUNDED, body: ROUNDED, eyebrow: ROUNDED },
    headingWeight: 800,
    headingTracking: "-0.02em",
    headingScale: 1.05,
    radius: 26,
    buttonStyle: "pill",
    cardStyle: "elevated",
    shadow: "soft",
    width: 1140,
    motion: "lively",
    defaultLayouts: {
      hero: "centered",
      features: "cards",
      courses: "grid",
      testimonials: "grid",
      faq: "accordion",
      cta: "card",
      links: "pills",
      footer: "simple",
    },
  },
  academy: {
    id: "academy",
    name: "Academy",
    description: "Trustworthy blue and clear structure, like an institute.",
    version: 1,
    light: {
      bg: "#ffffff",
      surface: "#f5f8fc",
      text: "#0f1b2d",
      muted: "#4a5a70",
      border: "#dfe6ef",
      accent: "#1d4ed8",
      onAccent: "#ffffff",
      soft: "#e8effc",
      inverseBg: "#0f1b2d",
      inverseText: "#ffffff",
      inverseMuted: "#c3cfdf",
    },
    dark: {
      bg: "#0a1220",
      surface: "#111c2e",
      text: "#e6edf7",
      muted: "#a3b3c9",
      border: "#22324a",
      accent: "#93c5fd",
      onAccent: "#0a1220",
      soft: "#14233b",
      inverseBg: "#e6edf7",
      inverseText: "#0a1220",
      inverseMuted: "#3d4f66",
    },
    fonts: { heading: SYSTEM_SANS, body: SYSTEM_SANS, eyebrow: SYSTEM_SANS },
    headingWeight: 700,
    headingTracking: "-0.015em",
    headingScale: 1,
    radius: 10,
    buttonStyle: "square",
    cardStyle: "bordered",
    shadow: "soft",
    width: 1200,
    motion: "subtle",
    defaultLayouts: {
      hero: "split",
      features: "grid",
      courses: "grid",
      testimonials: "grid",
      faq: "columns",
      cta: "banner",
      links: "stack",
      footer: "columns",
    },
  },
  wellness: {
    id: "wellness",
    name: "Wellness",
    description: "Calm sage green and soft shapes, for yoga, health and mind.",
    version: 1,
    light: {
      bg: "#f7faf6",
      surface: "#ffffff",
      text: "#1b2a1f",
      muted: "#4f6354",
      border: "#dde7dc",
      accent: "#2f6b45",
      onAccent: "#ffffff",
      soft: "#e7f0e6",
      inverseBg: "#1b2a1f",
      inverseText: "#f7faf6",
      inverseMuted: "#c9d8cb",
    },
    dark: {
      bg: "#0f1611",
      surface: "#162019",
      text: "#e8f1e9",
      muted: "#a9bdac",
      border: "#2a3a2e",
      accent: "#8fd3a4",
      onAccent: "#0f1611",
      soft: "#1b281f",
      inverseBg: "#e8f1e9",
      inverseText: "#0f1611",
      inverseMuted: "#4f6354",
    },
    fonts: { heading: BOOK_SERIF, body: SYSTEM_SANS, eyebrow: SYSTEM_SANS },
    headingWeight: 600,
    headingTracking: "-0.01em",
    headingScale: 1.05,
    radius: 22,
    buttonStyle: "soft",
    cardStyle: "flat",
    shadow: "none",
    width: 1100,
    motion: "subtle",
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
  finance: {
    id: "finance",
    name: "Finance",
    description: "Deep navy and emerald, for trading, money and business.",
    version: 1,
    light: {
      bg: "#f7f9fb",
      surface: "#ffffff",
      text: "#0b1726",
      muted: "#48576a",
      border: "#dde3ea",
      accent: "#047857",
      onAccent: "#ffffff",
      soft: "#e3f3ec",
      inverseBg: "#0b1726",
      inverseText: "#f7f9fb",
      inverseMuted: "#bccadb",
    },
    dark: {
      bg: "#07111d",
      surface: "#0d1b2b",
      text: "#e4ecf5",
      muted: "#9fb1c6",
      border: "#1f3045",
      accent: "#6ee7b7",
      onAccent: "#07111d",
      soft: "#0f2430",
      inverseBg: "#e4ecf5",
      inverseText: "#07111d",
      inverseMuted: "#48576a",
    },
    fonts: { heading: GROTESK, body: SYSTEM_SANS, eyebrow: SYSTEM_MONO },
    headingWeight: 800,
    headingTracking: "-0.03em",
    headingScale: 1.05,
    radius: 10,
    buttonStyle: "square",
    cardStyle: "glass",
    shadow: "soft",
    width: 1200,
    motion: "subtle",
    defaultLayouts: {
      hero: "split",
      features: "grid",
      courses: "grid",
      testimonials: "grid",
      faq: "columns",
      cta: "banner",
      links: "stack",
      footer: "columns",
    },
  },
  kids: {
    id: "kids",
    name: "Kids & Learning",
    description: "Friendly purple and big round shapes, for young learners.",
    version: 1,
    light: {
      bg: "#fffdf5",
      surface: "#ffffff",
      text: "#24163a",
      muted: "#5a4a73",
      border: "#efe6d2",
      accent: "#6d28d9",
      onAccent: "#ffffff",
      soft: "#f1eafe",
      inverseBg: "#24163a",
      inverseText: "#fffdf5",
      inverseMuted: "#d6cceb",
    },
    dark: {
      bg: "#150f22",
      surface: "#1e162f",
      text: "#f6f1ff",
      muted: "#c3b6dc",
      border: "#352a4c",
      accent: "#c4b5fd",
      onAccent: "#150f22",
      soft: "#251b3a",
      inverseBg: "#f6f1ff",
      inverseText: "#150f22",
      inverseMuted: "#5a4a73",
    },
    fonts: { heading: ROUNDED, body: ROUNDED, eyebrow: ROUNDED },
    headingWeight: 800,
    headingTracking: "-0.01em",
    headingScale: 1.08,
    radius: 28,
    buttonStyle: "pill",
    cardStyle: "elevated",
    shadow: "strong",
    width: 1140,
    motion: "lively",
    defaultLayouts: {
      hero: "centered",
      features: "cards",
      courses: "grid",
      testimonials: "grid",
      faq: "accordion",
      cta: "card",
      links: "pills",
      footer: "simple",
    },
  },
  neon: {
    id: "neon",
    name: "Neon Dark",
    description: "Near-black with a neon accent, best in dark mode.",
    version: 1,
    light: {
      bg: "#f6f8f2",
      surface: "#ffffff",
      text: "#10140a",
      muted: "#4a5340",
      border: "#e1e7d6",
      accent: "#3f6212",
      onAccent: "#ffffff",
      soft: "#ecf3df",
      inverseBg: "#10140a",
      inverseText: "#f6f8f2",
      inverseMuted: "#c5cfb5",
    },
    dark: {
      bg: "#080809",
      surface: "#121214",
      text: "#f4f6ef",
      muted: "#a9ae9f",
      border: "#26272a",
      accent: "#d9ff00",
      onAccent: "#080809",
      soft: "#161a0b",
      inverseBg: "#f4f6ef",
      inverseText: "#080809",
      inverseMuted: "#4a5340",
    },
    fonts: { heading: GROTESK, body: SYSTEM_SANS, eyebrow: SYSTEM_MONO },
    headingWeight: 800,
    headingTracking: "-0.04em",
    headingScale: 1.12,
    radius: 14,
    buttonStyle: "square",
    cardStyle: "glass",
    shadow: "soft",
    width: 1200,
    motion: "lively",
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
  editorial: {
    id: "editorial",
    name: "Editorial",
    description: "Magazine-style serif headlines with a red accent.",
    version: 1,
    light: {
      bg: "#fffefb",
      surface: "#f7f5f0",
      text: "#141414",
      muted: "#575550",
      border: "#e7e3da",
      accent: "#b91c1c",
      onAccent: "#ffffff",
      soft: "#f6ece8",
      inverseBg: "#141414",
      inverseText: "#fffefb",
      inverseMuted: "#c9c6bf",
    },
    dark: {
      bg: "#111110",
      surface: "#1a1a18",
      text: "#f3f1ec",
      muted: "#b3b0a8",
      border: "#2f2e2b",
      accent: "#fca5a5",
      onAccent: "#111110",
      soft: "#221a19",
      inverseBg: "#f3f1ec",
      inverseText: "#111110",
      inverseMuted: "#575550",
    },
    fonts: { heading: BOOK_SERIF, body: SYSTEM_SANS, eyebrow: SYSTEM_SANS },
    headingWeight: 700,
    headingTracking: "-0.02em",
    headingScale: 1.15,
    radius: 0,
    buttonStyle: "square",
    cardStyle: "minimal",
    shadow: "none",
    width: 1160,
    motion: "subtle",
    defaultLayouts: {
      hero: "banner",
      features: "list",
      courses: "list",
      testimonials: "spotlight",
      faq: "columns",
      cta: "split",
      links: "stack",
      footer: "columns",
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
