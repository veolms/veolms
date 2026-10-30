import type { ReactNode } from "react";
import { FunnelSimpleIcon as FunnelSimple } from "@phosphor-icons/react/FunnelSimple";
import { formatWholeNumber } from "./format";
import { EmptyState } from "./surfaces";
import {
  KPI_TONE_CLASSES,
  KPI_TONE_FILL_CLASSES,
  toneForIndex,
  type KpiTone,
} from "./tones";

export interface FunnelListRow {
  label: string;
  value: number;
  tone?: KpiTone;
  icon?: ReactNode;
  /** Replaces the numbering chip's content when given. */
  format?: (value: number) => string;
}

/**
 * A ranked, list-style funnel: each row's fill bar is sized relative to the
 * first (top-of-funnel) row, with the share-of-top percentage called out.
 * Reads clearly even with as few as two or three steps, unlike a pyramid
 * chart at that scale.
 */
export function FunnelList({
  rows,
  format = formatWholeNumber,
  emptyMessage,
}: {
  rows: FunnelListRow[];
  format?: (value: number) => string;
  emptyMessage?: string;
}) {
  // Against the largest row, not the first: a funnel whose first step is
  // not recorded (no page views) still reads from its second.
  const top = rows.reduce((max, row) => Math.max(max, row.value), 0);
  if (rows.length === 0 || top <= 0) {
    return (
      <EmptyState
        icon={<FunnelSimple size={20} weight="bold" />}
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
    <div className="grid gap-2 sm:gap-2.5">
      {rows.map((row, index) => {
        const fillPercent = top > 0 ? (row.value / top) * 100 : 0;
        const tone = row.tone ?? toneForIndex(index);
        return (
          <div
            key={row.label}
            className="relative overflow-hidden rounded-[10px] sm:rounded-[12px] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-(--card-surface-raised,var(--surface))"
          >
            <div
              className={`absolute inset-y-0 left-0 opacity-[0.14] ${KPI_TONE_FILL_CLASSES[tone]}`}
              style={{ width: `${Math.max(fillPercent, 4)}%` }}
              aria-hidden="true"
            />
            <div className="relative flex items-center justify-between gap-3 px-3 py-2.5 sm:px-4 sm:py-3">
              <div className="flex min-w-0 items-center gap-2.5">
                <span
                  className={`flex size-6 sm:size-7 shrink-0 items-center justify-center rounded-lg text-[0.65rem] sm:text-xs font-bold ${KPI_TONE_CLASSES[tone]}`}
                >
                  {row.icon ?? index + 1}
                </span>
                <span className="truncate text-xs sm:text-sm font-semibold text-(--text)">
                  {row.label}
                </span>
              </div>
              <div className="flex shrink-0 items-baseline gap-2">
                <span className="text-sm sm:text-base font-bold tracking-tight text-(--text) tabular-nums">
                  {(row.format ?? format)(row.value)}
                </span>
                <span className="text-[0.68rem] sm:text-xs font-semibold text-(--muted) tabular-nums">
                  {Math.round(fillPercent)}%
                </span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
