import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { formatWholeNumber } from "../format";
import {
  KPI_TONE_COLORS,
  KPI_TONE_FILL_CLASSES,
  toneForIndex,
  type KpiTone,
} from "../tones";
import { ChartEmptyState, ThemedTooltip } from "./chartTheme";

export interface DonutSlice {
  label: string;
  value: number;
  tone?: KpiTone;
  /** Shown in the legend beside the share, when the value alone is not enough. */
  detail?: string;
}

/**
 * A share of a whole: a ring with the total in the middle and a legend
 * table beside it (label, value, share). The legend is the readable part;
 * the ring is for the shape of the split.
 */
export function DonutChart({
  slices,
  total,
  totalLabel,
  format = formatWholeNumber,
  emptyMessage,
  size = 168,
}: {
  slices: DonutSlice[];
  /** Shown in the centre; the slices' sum when omitted. */
  total?: number;
  totalLabel: string;
  format?: (value: number) => string;
  emptyMessage?: string;
  size?: number;
}) {
  const sum = slices.reduce((acc, slice) => acc + slice.value, 0);
  const shown = slices.filter((slice) => slice.value > 0);
  if (sum <= 0 || shown.length === 0) {
    return <ChartEmptyState message={emptyMessage} />;
  }
  const centre = total ?? sum;
  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center sm:gap-6">
      <div
        className="relative shrink-0"
        style={{ width: size, height: size }}
        aria-hidden="true"
      >
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={shown}
              dataKey="value"
              nameKey="label"
              innerRadius="68%"
              outerRadius="100%"
              paddingAngle={2}
              stroke="none"
              isAnimationActive={false}
            >
              {shown.map((slice, index) => (
                <Cell
                  key={slice.label}
                  fill={KPI_TONE_COLORS[slice.tone ?? toneForIndex(index)]}
                />
              ))}
            </Pie>
            <Tooltip
              content={
                <ThemedTooltip valueFormatter={(value) => format(value)} />
              }
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
          <div>
            <p className="text-lg sm:text-xl font-bold tracking-tight text-(--text) tabular-nums">
              {format(centre)}
            </p>
            <p className="text-[0.65rem] sm:text-xs text-(--muted)">
              {totalLabel}
            </p>
          </div>
        </div>
      </div>
      <ul className="w-full min-w-0 flex-1 text-xs sm:text-sm">
        {slices.map((slice, index) => (
          <li
            key={slice.label}
            className="flex items-center gap-2.5 border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)] py-1.5 last:border-0"
          >
            <span
              className={`size-2.5 shrink-0 rounded-full ${KPI_TONE_FILL_CLASSES[slice.tone ?? toneForIndex(index)]}`}
              aria-hidden="true"
            />
            <span className="min-w-0 flex-1 truncate text-(--text)">
              {slice.label}
            </span>
            {slice.detail ? (
              <span className="text-(--muted) tabular-nums">
                {slice.detail}
              </span>
            ) : null}
            <span className="font-semibold text-(--text) tabular-nums">
              {format(slice.value)}
            </span>
            <span className="w-11 text-right text-(--muted) tabular-nums">
              {sum > 0 ? `${((slice.value / sum) * 100).toFixed(1)}%` : "–"}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
