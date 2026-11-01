import { ChartLineUpIcon as ChartLineUp } from "@phosphor-icons/react/ChartLineUp";
import { EmptyState } from "../surfaces";

export const AXIS_TICK_STYLE = { fill: "var(--muted)", fontSize: 11 };
export const GRID_STROKE = "color-mix(in srgb, var(--text) 8%, transparent)";

export function ChartEmptyState({ message }: { message?: string }) {
  return (
    <EmptyState
      icon={<ChartLineUp size={20} weight="bold" />}
      title="Not enough data yet"
      message={
        message ??
        "This will fill in once there's activity in the selected range."
      }
      compact
    />
  );
}

export interface TooltipEntry {
  name?: string;
  value?: number | string;
  color?: string;
  dataKey?: string | number;
}

export function ThemedTooltip({
  active,
  payload,
  label,
  valueFormatter,
}: {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string;
  valueFormatter?: (value: number, dataKey?: string) => string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rounded-lg border border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-(--card-surface,var(--surface)) px-3 py-2 text-xs shadow-lg">
      {label ? <p className="font-semibold text-(--text)">{label}</p> : null}
      {payload.map((entry, index) => (
        <p
          key={index}
          className="tabular-nums"
          style={{ color: entry.color ?? "var(--text)" }}
        >
          {entry.name ? `${entry.name}: ` : ""}
          {typeof entry.value === "number" && valueFormatter
            ? valueFormatter(
                entry.value,
                entry.dataKey === undefined ? undefined : String(entry.dataKey),
              )
            : entry.value}
        </p>
      ))}
    </div>
  );
}
