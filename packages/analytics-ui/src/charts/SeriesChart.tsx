import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatCompactNumber } from "../format";
import {
  KPI_TONE_COLORS,
  KPI_TONE_FILL_CLASSES,
  toneForIndex,
  type KpiTone,
} from "../tones";
import {
  AXIS_TICK_STYLE,
  ChartEmptyState,
  GRID_STROKE,
  ThemedTooltip,
} from "./chartTheme";

export interface ChartSeries {
  key: string;
  name: string;
  tone?: KpiTone;
  /** A line (default) or bars. */
  kind?: "line" | "bar";
  /** Plot against the right-hand axis (for a series in other units). */
  axis?: "left" | "right";
  format?: (value: number) => string;
}

export type SeriesPoint = { label: string } & Record<string, number | string>;

/**
 * Several series over the same days: lines, bars, or both, with an
 * optional right-hand axis and a legend. Covers "enrollments and
 * completions", "completion rate and completions", "refund amount".
 */
export function SeriesChart({
  data,
  series,
  height = 260,
  emptyMessage,
  showLegend = true,
}: {
  data: SeriesPoint[];
  series: ChartSeries[];
  height?: number;
  emptyMessage?: string;
  showLegend?: boolean;
}) {
  if (data.length === 0 || series.length === 0) {
    return <ChartEmptyState message={emptyMessage} />;
  }
  const hasRightAxis = series.some((entry) => entry.axis === "right");
  const formatByKey = new Map(series.map((entry) => [entry.key, entry.format]));
  const formatValue = (value: number, dataKey?: string) =>
    (dataKey && formatByKey.get(dataKey)?.(value)) ??
    formatCompactNumber(value);

  return (
    <div>
      {showLegend ? (
        <ul className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-[0.7rem] sm:text-xs text-(--muted)">
          {series.map((entry, index) => (
            <li key={entry.key} className="flex items-center gap-1.5">
              <span
                className={`size-2 rounded-full ${KPI_TONE_FILL_CLASSES[entry.tone ?? toneForIndex(index)]}`}
                aria-hidden="true"
              />
              {entry.name}
            </li>
          ))}
        </ul>
      ) : null}
      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart
          data={data}
          margin={{ top: 8, right: hasRightAxis ? 0 : 8, left: -4, bottom: 0 }}
        >
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
            yAxisId="left"
            tick={AXIS_TICK_STYLE}
            tickLine={false}
            axisLine={false}
            width={44}
            tickFormatter={formatCompactNumber}
          />
          {hasRightAxis ? (
            <YAxis
              yAxisId="right"
              orientation="right"
              tick={AXIS_TICK_STYLE}
              tickLine={false}
              axisLine={false}
              width={44}
              tickFormatter={formatCompactNumber}
            />
          ) : null}
          <Tooltip content={<ThemedTooltip valueFormatter={formatValue} />} />
          {series.map((entry, index) => {
            const color = KPI_TONE_COLORS[entry.tone ?? toneForIndex(index)];
            const axisId = entry.axis === "right" ? "right" : "left";
            return entry.kind === "bar" ? (
              <Bar
                key={entry.key}
                yAxisId={axisId}
                dataKey={entry.key}
                name={entry.name}
                fill={color}
                fillOpacity={0.75}
                radius={[3, 3, 0, 0]}
                maxBarSize={18}
              />
            ) : (
              <Line
                key={entry.key}
                yAxisId={axisId}
                type="monotone"
                dataKey={entry.key}
                name={entry.name}
                stroke={color}
                strokeWidth={2}
                dot={
                  data.length <= 45
                    ? { r: 2.5, strokeWidth: 0, fill: color }
                    : false
                }
                activeDot={{ r: 4 }}
              />
            );
          })}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
