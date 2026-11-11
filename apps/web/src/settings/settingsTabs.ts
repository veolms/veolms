import { BellIcon as Bell } from "@phosphor-icons/react/Bell";
import { GearSixIcon as GearSix } from "@phosphor-icons/react/GearSix";
import { GraduationCapIcon as GraduationCap } from "@phosphor-icons/react/GraduationCap";
import { LinkSimpleIcon as LinkSimple } from "@phosphor-icons/react/LinkSimple";
import { PaletteIcon as Palette } from "@phosphor-icons/react/Palette";
import { ShieldCheckIcon as ShieldCheck } from "@phosphor-icons/react/ShieldCheck";
import { SidebarSimpleIcon as SidebarSimple } from "@phosphor-icons/react/SidebarSimple";
import { UserCircleIcon as UserCircle } from "@phosphor-icons/react/UserCircle";
import type { ComponentType, CSSProperties } from "react";
import { isSignedInSettingsTab } from "../routing/tabSessionState";
import type { SettingsTab } from "../routing/tabSessionState";

type SettingsTabIcon = ComponentType<{
  size?: number;
  weight?: "duotone" | "fill" | "regular";
  style?: CSSProperties;
}>;

/** A tab of a settings-style page (Settings, Platform). */
export interface PageTabDefinition<Id extends string = string> {
  id: Id;
  label: string;
  Icon: SettingsTabIcon;
  tone: "blue" | "cyan" | "gold" | "green" | "orange" | "rose" | "violet";
  /**
   * How the icon is drawn while its tab is open (default "fill"). An icon
   * whose filled form is a solid tile with the symbol cut out (the link
   * icons) reads as a background behind it, unlike the others: such a tab
   * keeps its outline, in the active colour.
   */
  activeWeight?: "fill" | "regular";
}

export type SettingsTabDefinition = PageTabDefinition<SettingsTab>;

// What everyone can change comes first; the account's own sections follow.
export const SETTINGS_TABS: readonly SettingsTabDefinition[] = [
  {
    id: "appearance",
    label: "Appearance",
    Icon: Palette,
    tone: "orange",
  },
  { id: "sidebar", label: "Sidebar", Icon: SidebarSimple, tone: "violet" },
  {
    id: "learning",
    label: "Learning",
    Icon: GraduationCap,
    tone: "green",
  },
  {
    id: "notifications",
    label: "Notifications",
    Icon: Bell,
    tone: "gold",
  },
  {
    id: "security",
    label: "Privacy & Security",
    Icon: ShieldCheck,
    tone: "cyan",
  },
  { id: "profile", label: "Profile", Icon: UserCircle, tone: "blue" },
  { id: "account", label: "Account", Icon: GearSix, tone: "rose" },
  // Short links on the site's domain, for staff with link.manage.
  {
    id: "links",
    label: "Links",
    Icon: LinkSimple,
    tone: "cyan",
    activeWeight: "regular",
  },
];

const GUEST_SETTINGS_TABS = SETTINGS_TABS.filter(
  ({ id }) => !isSignedInSettingsTab(id),
);
const ACCOUNT_SETTINGS_TABS = SETTINGS_TABS.filter(({ id }) => id !== "links");

export const getSettingsTabs = (
  showSignedInTabs: boolean,
  showLinksTab = false,
) =>
  !showSignedInTabs
    ? GUEST_SETTINGS_TABS
    : showLinksTab
      ? SETTINGS_TABS
      : ACCOUNT_SETTINGS_TABS;
