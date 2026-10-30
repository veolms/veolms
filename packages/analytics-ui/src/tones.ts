/**
 * Icon-chip and series colour for a tile, a funnel row or a chart series.
 * Kept to the status-colour vocabulary already used elsewhere in the app
 * (emerald/amber/rose chips) so multi-metric rows read at a glance without
 * inventing a new palette. `accent` follows the academy's own colour.
 */
export type KpiTone =
  | "accent"
  | "violet"
  | "blue"
  | "emerald"
  | "amber"
  | "teal"
  | "rose"
  | "pink"
  | "slate";

export const KPI_TONE_CLASSES: Record<KpiTone, string> = {
  accent: "bg-(--accent)/12 text-(--accent)",
  violet: "bg-violet-500/12 text-violet-500",
  blue: "bg-blue-500/12 text-blue-500",
  emerald: "bg-emerald-500/12 text-emerald-500",
  amber: "bg-amber-500/12 text-amber-500",
  teal: "bg-teal-500/12 text-teal-500",
  rose: "bg-rose-500/12 text-rose-500",
  pink: "bg-pink-500/12 text-pink-500",
  slate: "bg-slate-500/12 text-slate-500",
};

/** The fill alone (for a bar or a dot), without the text colour. */
export const KPI_TONE_FILL_CLASSES: Record<KpiTone, string> = {
  accent: "bg-(--accent)",
  violet: "bg-violet-500",
  blue: "bg-blue-500",
  emerald: "bg-emerald-500",
  amber: "bg-amber-500",
  teal: "bg-teal-500",
  rose: "bg-rose-500",
  pink: "bg-pink-500",
  slate: "bg-slate-500",
};

/**
 * The same colours as CSS values, for SVG charts (recharts takes colour
 * strings, not classes). The Tailwind 500 shades, so a legend dot painted
 * by class and a line painted by value match.
 */
export const KPI_TONE_COLORS: Record<KpiTone, string> = {
  accent: "var(--accent)",
  violet: "#8b5cf6",
  blue: "#3b82f6",
  emerald: "#10b981",
  amber: "#f59e0b",
  teal: "#14b8a6",
  rose: "#f43f5e",
  pink: "#ec4899",
  slate: "#64748b",
};

const TONE_CYCLE: readonly KpiTone[] = [
  "accent",
  "violet",
  "emerald",
  "amber",
  "blue",
  "teal",
  "rose",
  "pink",
  "slate",
];

export function toneForIndex(index: number): KpiTone {
  return TONE_CYCLE[index % TONE_CYCLE.length] ?? "accent";
}
