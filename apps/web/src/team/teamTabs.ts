import { EnvelopeSimpleIcon as EnvelopeSimple } from "@phosphor-icons/react/EnvelopeSimple";
import { ShieldCheckIcon as ShieldCheck } from "@phosphor-icons/react/ShieldCheck";
import { UsersThreeIcon as UsersThree } from "@phosphor-icons/react/UsersThree";
import type { PageTabDefinition } from "../settings/settingsTabs";

export const TEAM_TABS = ["members", "roles", "invitations"] as const;
export type TeamTab = (typeof TEAM_TABS)[number];
export const TEAM_DEFAULT_TAB: TeamTab = "members";

export function isTeamTab(value: string | undefined): value is TeamTab {
  return TEAM_TABS.includes(value as TeamTab);
}

/** Reads the tab from a `/team/<tab>` address. */
export function teamTabFromPath(pathname: string): TeamTab {
  const tab = /^\/team\/([^/?#]+)/.exec(pathname)?.[1];
  return isTeamTab(tab) ? tab : TEAM_DEFAULT_TAB;
}

/** The Team page's sections, in the order its tab row shows them. */
export const TEAM_TAB_DEFINITIONS: readonly PageTabDefinition<TeamTab>[] = [
  { id: "members", label: "Members", Icon: UsersThree, tone: "blue" },
  { id: "roles", label: "Roles", Icon: ShieldCheck, tone: "violet" },
  {
    id: "invitations",
    label: "Invitations",
    Icon: EnvelopeSimple,
    tone: "green",
  },
];
