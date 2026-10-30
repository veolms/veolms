import type { ReactNode } from "react";

import { ElevatedCard } from "../ElevatedCard";

// The analytics page's shared pieces moved to `@veolms/analytics-ui` so a
// plugin's tab can use them too. The other pages that used them from here
// (Progress, quiz analytics, the route skeleton) keep this import path.
export {
  EmptyState,
  LoadingCards,
  LoadingRows,
  SectionHeading,
} from "@veolms/analytics-ui";

export function StatCard({
  icon,
  label,
  value,
  detail,
  tone = "default",
  compact = false,
}: {
  icon?: ReactNode;
  label: string;
  value: number | string;
  detail?: string;
  tone?: "default" | "success" | "danger";
  compact?: boolean;
}) {
  return (
    <ElevatedCard
      as="div"
      className={` transition-all duration-200 ${
        compact ? "p-2 sm:p-3.5" : "p-2.5 sm:p-5"
      }`}
    >
      <div className="flex items-center justify-between gap-1.5 sm:gap-2">
        <p className="text-[0.7rem] sm:text-xs font-semibold text-(--muted) tracking-wide truncate">
          {label}
        </p>
        {icon ? (
          <span className="flex size-6 sm:size-7 shrink-0 items-center justify-center rounded-lg bg-(--accent)/12 text-(--accent)">
            {icon}
          </span>
        ) : null}
      </div>
      <p
        className={`mt-1.5 sm:mt-2.5 text-xl sm:text-[1.75rem] font-bold tracking-tight ${
          tone === "success"
            ? "text-emerald-500"
            : tone === "danger"
              ? "text-rose-500"
              : "text-(--text)"
        }`}
      >
        {value}
      </p>
      {detail ? (
        <p className="mt-0.5 sm:mt-1 truncate text-[0.68rem] sm:text-xs text-(--muted)">
          {detail}
        </p>
      ) : null}
    </ElevatedCard>
  );
}

export function MetricTile({
  label,
  value,
}: {
  label: string;
  value: number | string;
}) {
  return (
    <div>
      <p className="text-xs text-(--muted)">{label}</p>
      <p className="mt-1 text-xl font-semibold">{value}</p>
    </div>
  );
}
