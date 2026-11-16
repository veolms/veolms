import { CreditCardIcon as CreditCard } from "@phosphor-icons/react/CreditCard";
import { IdentificationCardIcon as IdentificationCard } from "@phosphor-icons/react/IdentificationCard";
import { LayoutIcon as Layout } from "@phosphor-icons/react/Layout";
import { PaletteIcon as Palette } from "@phosphor-icons/react/Palette";
import { ReceiptIcon as Receipt } from "@phosphor-icons/react/Receipt";
import { ScalesIcon as Scales } from "@phosphor-icons/react/Scales";
import { ShieldCheckIcon as ShieldCheck } from "@phosphor-icons/react/ShieldCheck";
import type { PlatformTab } from "../routing/tabSessionState";
import type { PageTabDefinition } from "../settings/settingsTabs";

/** The Platform page's sections, in the order its tab row shows them. */
export const PLATFORM_TAB_DEFINITIONS: readonly PageTabDefinition<PlatformTab>[] =
  [
    { id: "home", label: "Home page", Icon: Layout, tone: "blue" },
    { id: "appearance", label: "Appearance", Icon: Palette, tone: "orange" },
    { id: "security", label: "Security", Icon: ShieldCheck, tone: "cyan" },
    {
      id: "general",
      label: "General",
      Icon: IdentificationCard,
      tone: "violet",
    },
    { id: "payments", label: "Payments", Icon: CreditCard, tone: "rose" },
    { id: "invoice", label: "Invoice", Icon: Receipt, tone: "green" },
    { id: "legal", label: "Legal pages", Icon: Scales, tone: "gold" },
  ];

/** What changing each section takes; a section shows only to its holders. */
export const PLATFORM_TAB_PERMISSIONS: Readonly<Record<PlatformTab, string>> = {
  home: "platform.homepage.update",
  appearance: "platform.settings.update",
  security: "platform.settings.update",
  general: "platform.branding.update",
  payments: "payment.gateway.manage",
  invoice: "platform.settings.update",
  legal: "platform.settings.update",
};
