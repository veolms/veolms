import { memo } from "react";
import type { OrderStatsResponse } from "@veolms/contracts";
import { CurrencyInrIcon as CurrencyInr } from "@phosphor-icons/react/CurrencyInr";
import { WalletIcon as Wallet } from "@phosphor-icons/react/Wallet";
import { ShoppingCartIcon as ShoppingCart } from "@phosphor-icons/react/ShoppingCart";
import { UsersIcon as Users } from "@phosphor-icons/react/Users";
import { ArrowCounterClockwiseIcon as ArrowCounterClockwise } from "@phosphor-icons/react/ArrowCounterClockwise";
import { formatCurrency, formatNumber } from "./orderHelpers";

export interface OrderSummaryCardsProps {
  stats: OrderStatsResponse | undefined;
  isLoading?: boolean;
}

export const OrderSummaryCards = memo(function OrderSummaryCards({
  stats,
  isLoading = false,
}: OrderSummaryCardsProps) {
  const cards = [
    {
      id: "net-revenue",
      title: "Net Revenue",
      value: stats ? formatCurrency(stats.netRevenue, stats.currency) : "₹0",
      icon: <CurrencyInr size={16} weight="bold" />,
      iconBg: "bg-emerald-500/15 text-emerald-400",
    },
    {
      id: "total-earnings",
      title: "Total Earnings",
      value: stats ? formatCurrency(stats.totalEarnings ?? 0, stats.currency) : "₹0",
      icon: <Wallet size={16} weight="bold" />,
      iconBg: "bg-amber-500/15 text-amber-400",
    },
    {
      id: "total-orders",
      title: "Successful Orders",
      value: stats ? formatNumber(stats.totalOrders) : "0",
      icon: <ShoppingCart size={16} weight="bold" />,
      iconBg: "bg-sky-500/15 text-sky-400",
    },
    {
      id: "unique-buyers",
      title: "Unique Buyers",
      value: stats ? formatNumber(stats.uniqueBuyers) : "0",
      icon: <Users size={16} weight="bold" />,
      iconBg: "bg-purple-500/15 text-purple-400",
    },
    {
      id: "refunded-amount",
      title: "Refunded Amount",
      value: stats ? formatCurrency(stats.refundedAmount, stats.currency) : "₹0",
      icon: <ArrowCounterClockwise size={16} weight="bold" />,
      iconBg: "bg-rose-500/15 text-rose-400",
    },
  ];

  return (
    <section
      aria-label="Order Performance Summary"
      className="grid grid-cols-2 gap-2 sm:gap-3.5 md:grid-cols-3 xl:grid-cols-5"
    >
      {cards.map((card) => (
        <article
          key={card.id}
          className="rounded-[12px] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-(--card-surface-raised,var(--surface)) p-2.5 transition-all duration-200 hover:shadow-(--card-hover-shadow) sm:rounded-[16px] sm:p-5"
          style={{ boxShadow: "var(--card-shadow)" }}
        >
          <div className="flex items-center justify-between gap-1 sm:gap-2">
            <p className="truncate text-[0.68rem] font-semibold tracking-wide text-(--muted) sm:text-xs">
              {card.title}
            </p>
            <span
              className={`flex size-6 shrink-0 items-center justify-center rounded-lg sm:size-7 ${card.iconBg}`}
              aria-hidden="true"
            >
              {card.icon}
            </span>
          </div>
          {isLoading ? (
            <div className="mt-2 h-6 w-16 animate-pulse rounded-md bg-(--border)" />
          ) : (
            <p className="mt-1 text-lg font-bold tracking-tight text-(--text) sm:mt-2.5 sm:text-[1.75rem]">
              {card.value}
            </p>
          )}
        </article>
      ))}
    </section>
  );
});
