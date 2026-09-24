import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChartLineUpIcon as ChartLineUp } from "@phosphor-icons/react/ChartLineUp";
import { EmptyState } from "./StatTiles";

export interface ChartDatum {
  label: string;
  value: number;
}

const AXIS_TICK_STYLE = { fill: "var(--muted)", fontSize: 11 };
const GRID_STROKE = "color-mix(in srgb, var(--text) 8%, transparent)";

/** Compact axis tick labels (1.2K, 3.4M, …) so a numeric axis stays narrow
 * regardless of magnitude — avoids the tick column clipping large values
 * (e.g. revenue in the thousands) and matches the reference design's
 * abbreviated axis style. */
function formatCompactTick(value: number): string {
  return new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(
    value,
  );
}

function ChartEmptyState({ message }: { message?: string }) {
  return (
    <EmptyState
      icon={<ChartLineUp size={20} weight="bold" />}
      title="Not enough data yet"
      message={
        message ?? "This will fill in once there's activity in the selected range."
      }
      compact
    />
  );
}

function ThemedTooltip({
  active,
  payload,
  label,
  valueFormatter,
}: {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number | string; color?: string }>;
  label?: string;
  valueFormatter?: (value: number) => string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rounded-lg border border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-(--card-surface,var(--surface)) px-3 py-2 text-xs shadow-lg">
      {label ? <p className="font-semibold text-(--text)">{label}</p> : null}
      {payload.map((entry, index) => (
        <p key={index} style={{ color: entry.color ?? "var(--text)" }}>
          {entry.name ? `${entry.name}: ` : ""}
          {typeof entry.value === "number" && valueFormatter
            ? valueFormatter(entry.value)
            : entry.value}
        </p>
      ))}
    </div>
  );
}

/** The one trend chart used everywhere — a filled area over `var(--accent)`,
 * themed entirely via CSS variables so it auto-adapts across all palettes and
 * light/dark mode with no JS color logic. */
export function TrendChart({
  data,
  height = 260,
  emptyMessage,
  valueFormatter,
}: {
  data: ChartDatum[];
  height?: number;
  emptyMessage?: string;
  valueFormatter?: (value: number) => string;
}) {
  if (data.length === 0) return <ChartEmptyState message={emptyMessage} />;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: -4, bottom: 0 }}>
        <defs>
          <linearGradient id="analyticsTrendFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--accent)" stopOpacity={0.35} />
            <stop offset="95%" stopColor="var(--accent)" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
        <XAxis dataKey="label" tick={AXIS_TICK_STYLE} tickLine={false} axisLine={false} />
        <YAxis
          tick={AXIS_TICK_STYLE}
          tickLine={false}
          axisLine={false}
          width={44}
          tickFormatter={formatCompactTick}
        />
        <Tooltip content={<ThemedTooltip valueFormatter={valueFormatter} />} />
        <Area
          type="monotone"
          dataKey="value"
          stroke="var(--accent)"
          strokeWidth={2}
          fill="url(#analyticsTrendFill)"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
