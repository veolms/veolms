import { useId } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatCompactNumber, type ChartDatum } from "../format";
import { KPI_TONE_COLORS, type KpiTone } from "../tones";
import {
  AXIS_TICK_STYLE,
  ChartEmptyState,
  GRID_STROKE,
  ThemedTooltip,
} from "./chartTheme";

/**
 * One series over time as a filled area. Themed through CSS variables so it
 * follows every palette and light/dark mode with no colour logic.
 */
export function TrendChart({
  data,
  height = 260,
  emptyMessage,
  valueFormatter,
  tone = "accent",
  name,
}: {
  data: ChartDatum[];
  height?: number;
  emptyMessage?: string;
  valueFormatter?: (value: number) => string;
  tone?: KpiTone;
  /** Series name shown in the tooltip. */
  name?: string;
}) {
  const fillId = useId();
  if (data.length === 0) return <ChartEmptyState message={emptyMessage} />;
  const color = KPI_TONE_COLORS[tone];

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: -4, bottom: 0 }}>
        <defs>
          <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={color} stopOpacity={0.35} />
            <stop offset="95%" stopColor={color} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid
          strokeDasharray="3 3"
          stroke={GRID_STROKE}
          vertical={false}
        />
        <XAxis
          dataKey="label"
          tick={AXIS_TICK_STYLE}
          tickLine={false}
          axisLine={false}
          minTickGap={24}
        />
        <YAxis
          tick={AXIS_TICK_STYLE}
          tickLine={false}
          axisLine={false}
          width={44}
          tickFormatter={formatCompactNumber}
        />
        <Tooltip content={<ThemedTooltip valueFormatter={valueFormatter} />} />
        <Area
          type="monotone"
          dataKey="value"
          name={name}
          stroke={color}
          strokeWidth={2}
          fill={`url(#${fillId})`}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
