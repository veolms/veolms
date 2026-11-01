import { useId } from "react";

/**
 * A small filled line of a tile's own series. Plain SVG, no chart library:
 * six of these sit on every tab and a recharts instance each would cost
 * more than the whole page.
 */
export function Sparkline({
  values,
  color = "var(--accent)",
  height = 34,
}: {
  values: ReadonlyArray<number>;
  color?: string;
  height?: number;
}) {
  const gradientId = useId();
  const width = 100;
  const count = values.length;
  if (count < 2) return null;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const stepX = width / (count - 1);
  // Two pixels of head room so a flat line at the top is not clipped.
  const plotHeight = height - 4;
  const points = values.map((value, index) => {
    const x = index * stepX;
    const y = 2 + plotHeight - ((value - min) / span) * plotHeight;
    return [x, y] as const;
  });
  const line = points
    .map(
      ([x, y], index) =>
        `${index === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`,
    )
    .join(" ");
  const area = `${line} L${width} ${height} L0 ${height} Z`;
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className="block h-8 w-full sm:h-9"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.28} />
          <stop offset="100%" stopColor={color} stopOpacity={0.02} />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradientId})`} />
      <path
        d={line}
        fill="none"
        stroke={color}
        strokeWidth={1.75}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
