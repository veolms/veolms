import { DeviceMobileIcon as DeviceMobile } from "@phosphor-icons/react/DeviceMobile";
import { MoonIcon as Moon } from "@phosphor-icons/react/Moon";
import { SunIcon as Sun } from "@phosphor-icons/react/Sun";

export type DisplayMode = "light" | "dark" | "device";

export interface DisplayModeOption {
  id: DisplayMode;
  label: string;
  note: string;
  icon: typeof Sun;
}

/** The light/dark choices, as Settings and the Platform page offer them. */
export const DISPLAY_MODES: readonly DisplayModeOption[] = [
  { id: "light", label: "Light", note: "Use a light color scheme", icon: Sun },
  { id: "dark", label: "Dark", note: "Use a dark color scheme", icon: Moon },
  {
    id: "device",
    label: "Use device setting",
    note: "Match your system preference",
    icon: DeviceMobile,
  },
];

/** How a settings preview card draws a display mode. */
export const displayModePreview = (mode: DisplayMode) =>
  mode === "light" ? "light" : mode === "dark" ? "dark" : "device";
