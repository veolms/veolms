/**
 * The looks a creator can give a marketing email. Each theme is a full set
 * of colours (mail clients take inline styles only); the accent can be
 * changed per email, and the button's text colour follows it so it stays
 * readable.
 */
import {
  MARKETING_THEME_COLORS,
  type MarketingDesign,
  type MarketingFont,
  type MarketingThemeColors,
} from "@veolms/contracts";

import { fontStack } from "./email.layout.ts";

export type { MarketingThemeColors };

export const MARKETING_FONT_STACKS: Record<MarketingFont, string> = {
  modern: fontStack,
  classic: "Georgia,'Times New Roman',Times,serif",
  rounded:
    "Nunito,'Segoe UI Rounded','SF Pro Rounded',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif",
};

function luminance(hex: string): number {
  const channel = (start: number) => {
    const value = Number.parseInt(hex.slice(start, start + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

/** White or near-black, whichever reads better on `background`. */
export function readableOn(background: string): string {
  return luminance(background) > 0.45 ? "#111827" : "#FFFFFF";
}

/** The colours an email is drawn with: its theme, with its accent if set. */
export function marketingPalette(
  design: MarketingDesign,
): MarketingThemeColors {
  const theme = MARKETING_THEME_COLORS[design.theme];
  if (!design.accent) return theme;
  return { ...theme, accent: design.accent, mark: design.accent };
}
