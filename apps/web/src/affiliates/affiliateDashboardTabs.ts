import { ChartLineIcon as ChartLine } from "@phosphor-icons/react/ChartLine";
import { CoinsIcon as Coins } from "@phosphor-icons/react/Coins";
import { GearSixIcon as GearSix } from "@phosphor-icons/react/GearSix";
import { WalletIcon as Wallet } from "@phosphor-icons/react/Wallet";

import type { PageTabDefinition } from "../settings/settingsTabs";

export const AFFILIATE_DASHBOARD_TABS = [
  "overview",
  "commissions",
  "payouts",
  "settings",
] as const;
export type AffiliateDashboardTab = (typeof AFFILIATE_DASHBOARD_TABS)[number];

export function isAffiliateDashboardTab(
  value: string | undefined,
): value is AffiliateDashboardTab {
  return AFFILIATE_DASHBOARD_TABS.includes(value as AffiliateDashboardTab);
}

/** The affiliate dashboard's sections, in the order its tab row shows them. */
export const AFFILIATE_DASHBOARD_TAB_DEFINITIONS: readonly PageTabDefinition<AffiliateDashboardTab>[] =
  [
    { id: "overview", label: "Overview", Icon: ChartLine, tone: "blue" },
    { id: "commissions", label: "Commissions", Icon: Coins, tone: "gold" },
    { id: "payouts", label: "Payouts", Icon: Wallet, tone: "violet" },
    { id: "settings", label: "Settings", Icon: GearSix, tone: "cyan" },
  ];
