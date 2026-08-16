import type { ThemedSelectOption } from "../ThemedSelect";
import type { ReadingModeColors } from "./readingModePreferences";

export const READING_MODE_COLOR_OPTIONS = [
  ["full", "Full colors"],
  ["light", "Light colors"],
  ["black-and-white", "Black and white"],
] as const satisfies readonly ThemedSelectOption<ReadingModeColors>[];

export const READING_MODE_COLOR_LABELS: Record<ReadingModeColors, string> = {
  full: "Full colors",
  light: "Light colors",
  "black-and-white": "Black and white",
};

export const getReadingModeTemperatureLabel = (value: number): string => {
  if (value === 50) return "Neutral";
  return value < 50 ? `${50 - value}% cooler` : `${value - 50}% warmer`;
};
