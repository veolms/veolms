import { memo } from "react";
import type { OrderStatsResponse } from "@veolms/contracts";
import { CurrencyInrIcon as CurrencyInr } from "@phosphor-icons/react/CurrencyInr";
import { WalletIcon as Wallet } from "@phosphor-icons/react/Wallet";
import { ShoppingCartIcon as ShoppingCart } from "@phosphor-icons/react/ShoppingCart";
import { UsersIcon as Users } from "@phosphor-icons/react/Users";
import { ArrowCounterClockwiseIcon as ArrowCounterClockwise } from "@phosphor-icons/react/ArrowCounterClockwise";
import { formatCurrency, formatNumber } from "./orderHelpers";
import { ElevatedCard } from "../components/ElevatedCard";

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
      value: stats
        ? formatCurrency(stats.totalEarnings ?? 0, stats.currency)
        : "₹0",
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
      value: stats
        ? formatCurrency(stats.refundedAmount, stats.currency)
        : "₹0",
      icon: <ArrowCounterClockwise size={16} weight="bold" />,
      iconBg: "bg-rose-500/15 text-rose-400",
      // Left out until five fit in a row, so the rest stay 2 x 2 or 4
      // across.
      wideOnly: true,
    },
  ];

  return (
    // Sized by the room the list has (the order panel narrows it), not by
    // the window.
    <div className="@container">
      <section
        aria-label="Order Performance Summary"
        className="grid grid-cols-2 gap-2 @lg:gap-3 @3xl:grid-cols-4 @6xl:grid-cols-5 @6xl:gap-3.5"
      >
        {cards.map((card) => (
          <ElevatedCard
            as="article"
            key={card.id}
            className={`min-w-0 p-3 transition-all duration-200 @lg:p-4 @6xl:p-5 ${
              card.wideOnly ? "hidden @6xl:block" : ""
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <p className="truncate text-[0.6875rem] font-semibold tracking-wide text-(--muted) @lg:text-xs">
                {card.title}
              </p>
              <span
                className={`flex size-6 shrink-0 items-center justify-center rounded-lg @lg:size-7 ${card.iconBg}`}
                aria-hidden="true"
              >
                {card.icon}
              </span>
            </div>
            {isLoading ? (
              <div className="mt-2 h-6 w-16 animate-pulse rounded-md bg-(--border)" />
            ) : (
              <p className="mt-1.5 truncate text-lg font-bold tracking-tight text-(--text) tabular-nums @lg:mt-2 @lg:text-xl @5xl:text-2xl @6xl:text-[1.75rem]">
                {card.value}
              </p>
            )}
          </ElevatedCard>
        ))}
      </section>
    </div>
  );
});
