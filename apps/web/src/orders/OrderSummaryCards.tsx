import { memo } from "react";
import type { OrderStatsResponse } from "@veolms/contracts";
import { CurrencyInrIcon as CurrencyInr } from "@phosphor-icons/react/CurrencyInr";
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
      id: "total-orders",
      title: "Total Orders",
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
      className="grid grid-cols-2 gap-2 sm:gap-3.5 md:grid-cols-4"
    >
      {cards.map((card) => (
        <article
          key={card.id}
          className="rounded-[12px] sm:rounded-[16px] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-(--card-surface-raised,var(--surface)) p-2.5 sm:p-5 transition-all duration-200 hover:shadow-(--card-hover-shadow)"
          style={{ boxShadow: "var(--card-shadow)" }}
        >
          <div className="flex items-center justify-between gap-1 sm:gap-2">
            <p className="text-[0.68rem] sm:text-xs font-semibold text-(--muted) tracking-wide truncate">
              {card.title}
            </p>
            <span
              className={`flex size-6 sm:size-7 shrink-0 items-center justify-center rounded-lg ${card.iconBg}`}
              aria-hidden="true"
            >
              {card.icon}
            </span>
          </div>
          {isLoading ? (
            <div className="mt-2 h-6 w-16 animate-pulse rounded-md bg-(--border)" />
          ) : (
            <p className="mt-1 sm:mt-2.5 text-lg sm:text-[1.75rem] font-bold tracking-tight text-(--text)">
              {card.value}
            </p>
          )}
        </article>
      ))}
    </section>
  );
});
