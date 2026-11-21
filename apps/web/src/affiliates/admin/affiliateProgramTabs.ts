import { ChartLineIcon as ChartLine } from "@phosphor-icons/react/ChartLine";
import { CoinsIcon as Coins } from "@phosphor-icons/react/Coins";
import { GearSixIcon as GearSix } from "@phosphor-icons/react/GearSix";
import { UsersIcon as Users } from "@phosphor-icons/react/Users";
import { WalletIcon as Wallet } from "@phosphor-icons/react/Wallet";

import type { PageTabDefinition } from "../../settings/settingsTabs";

export const AFFILIATE_PROGRAM_TABS = [
  "overview",
  "affiliates",
  "commissions",
  "payouts",
  "settings",
] as const;
export type AffiliateProgramTab = (typeof AFFILIATE_PROGRAM_TABS)[number];

export function isAffiliateProgramTab(
  value: string | undefined,
): value is AffiliateProgramTab {
  return AFFILIATE_PROGRAM_TABS.includes(value as AffiliateProgramTab);
}

/** The Affiliates page's sections, in the order its tab row shows them. */
export const AFFILIATE_PROGRAM_TAB_DEFINITIONS: readonly PageTabDefinition<AffiliateProgramTab>[] =
  [
    { id: "overview", label: "Overview", Icon: ChartLine, tone: "blue" },
    { id: "affiliates", label: "Affiliates", Icon: Users, tone: "green" },
    { id: "commissions", label: "Commissions", Icon: Coins, tone: "gold" },
    { id: "payouts", label: "Payouts", Icon: Wallet, tone: "violet" },
    { id: "settings", label: "Settings", Icon: GearSix, tone: "cyan" },
  ];
