import type { ReactNode } from "react";
import { ChartBarHorizontalIcon as ChartBarHorizontal } from "@phosphor-icons/react/ChartBarHorizontal";
import { formatWholeNumber } from "./format";
import { EmptyState } from "./surfaces";
import {
  KPI_TONE_CLASSES,
  KPI_TONE_FILL_CLASSES,
  toneForIndex,
  type KpiTone,
} from "./tones";

export interface BarListRow {
  key: string;
  label: string;
  value: number;
  tone?: KpiTone;
  /** A chip before the label: initials, an icon. */
  leading?: ReactNode;
  /** Text after the value, such as "(33.7%)" or an order count. */
  detail?: string;
}

/**
 * Ranked horizontal bars, each sized against the largest row: revenue by
 * product, payment methods, top coupons. Reads at any count from two rows
 * up, where a bar chart with few bars looks empty.
 */
export function BarList({
  rows,
  format = formatWholeNumber,
  emptyMessage,
  showShare = true,
  total,
}: {
  rows: BarListRow[];
  format?: (value: number) => string;
  emptyMessage?: string;
  /** Show each row's share of the total after its value. */
  showShare?: boolean;
  /** Printed as a last line; the rows' sum when omitted and `showTotal`. */
  total?: number | null;
}) {
  const max = rows.reduce((acc, row) => Math.max(acc, row.value), 0);
  const sum = rows.reduce((acc, row) => acc + row.value, 0);
  if (rows.length === 0 || max <= 0) {
    return (
      <EmptyState
        icon={<ChartBarHorizontal size={20} weight="bold" />}
        title="Not enough data yet"
        message={
          emptyMessage ??
          "This will fill in once there's activity in the selected range."
        }
        compact
      />
    );
  }
  return (
    <div className="grid gap-2.5 sm:gap-3">
      {rows.map((row, index) => {
        const tone = row.tone ?? toneForIndex(index);
        const share = sum > 0 ? (row.value / sum) * 100 : 0;
        return (
          <div key={row.key} className="grid gap-1">
            <div className="flex items-center gap-2.5 text-xs sm:text-sm">
              {row.leading ? (
                <span
                  className={`flex size-6 sm:size-7 shrink-0 items-center justify-center rounded-lg text-[0.6rem] sm:text-[0.65rem] font-bold ${KPI_TONE_CLASSES[tone]}`}
                >
                  {row.leading}
                </span>
              ) : null}
              <span className="min-w-0 flex-1 truncate font-medium text-(--text)">
                {row.label}
              </span>
              <span className="shrink-0 font-semibold text-(--text) tabular-nums">
                {format(row.value)}
              </span>
              {row.detail ? (
                <span className="shrink-0 text-(--muted) tabular-nums">
                  {row.detail}
                </span>
              ) : showShare ? (
                <span className="w-14 shrink-0 text-right text-(--muted) tabular-nums">
                  {share.toFixed(1)}%
                </span>
              ) : null}
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--text)_8%,transparent)]">
              <div
                className={`h-full rounded-full ${KPI_TONE_FILL_CLASSES[tone]}`}
                style={{ width: `${Math.max((row.value / max) * 100, 1.5)}%` }}
              />
            </div>
          </div>
        );
      })}
      {total !== undefined ? (
        <div className="mt-1 flex items-center justify-between border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)] pt-2.5 text-xs sm:text-sm">
          <span className="font-semibold text-(--text)">Total</span>
          <span className="font-bold text-(--text) tabular-nums">
            {format(total ?? sum)}
          </span>
        </div>
      ) : null}
    </div>
  );
}
