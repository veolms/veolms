/**
 * A small drawing of a section layout for the Design tab's layout picker:
 * grey bars for text, a tinted block for pictures and cards, a dot for the
 * button. Drawn in the editor's own colours, not the theme's.
 */

const TEXT = "color-mix(in srgb, currentColor 40%, transparent)";
const SOFT = "color-mix(in srgb, currentColor 16%, transparent)";
const ACCENT = "var(--accent)";

type Shape = [
  x: number,
  y: number,
  w: number,
  h: number,
  fill: string,
  r?: number,
];

const LAYOUTS: Record<string, Shape[]> = {
  centered: [
    [30, 10, 40, 5, TEXT],
    [22, 19, 56, 3, SOFT],
    [40, 27, 20, 6, ACCENT, 3],
    [20, 38, 60, 14, SOFT, 2],
  ],
  split: [
    [8, 14, 36, 5, TEXT],
    [8, 23, 30, 3, SOFT],
    [8, 31, 16, 6, ACCENT, 3],
    [54, 8, 38, 40, SOFT, 3],
  ],
  banner: [
    [8, 8, 70, 9, TEXT],
    [8, 21, 40, 3, SOFT],
    [8, 30, 84, 20, SOFT, 2],
  ],
  grid: [
    [8, 8, 30, 4, TEXT],
    [8, 20, 26, 26, SOFT, 3],
    [37, 20, 26, 26, SOFT, 3],
    [66, 20, 26, 26, SOFT, 3],
  ],
  cards: [
    [8, 8, 30, 4, TEXT],
    [8, 20, 26, 28, SOFT, 4],
    [37, 20, 26, 28, SOFT, 4],
    [66, 20, 26, 28, SOFT, 4],
    [12, 26, 8, 4, ACCENT, 2],
    [41, 26, 8, 4, ACCENT, 2],
    [70, 26, 8, 4, ACCENT, 2],
  ],
  list: [
    [8, 8, 30, 4, TEXT],
    [8, 18, 84, 8, SOFT, 2],
    [8, 29, 84, 8, SOFT, 2],
    [8, 40, 84, 8, SOFT, 2],
  ],
  row: [
    [8, 8, 30, 4, TEXT],
    [8, 20, 34, 28, SOFT, 3],
    [46, 20, 34, 28, SOFT, 3],
    [84, 20, 16, 28, SOFT, 3],
  ],
  spotlight: [
    [18, 8, 64, 6, TEXT],
    [30, 17, 40, 3, SOFT],
    [8, 28, 40, 20, SOFT, 3],
    [52, 28, 40, 20, SOFT, 3],
  ],
  accordion: [
    [8, 8, 30, 4, TEXT],
    [8, 18, 84, 7, SOFT, 2],
    [8, 28, 84, 7, SOFT, 2],
    [8, 38, 84, 7, SOFT, 2],
  ],
  columns: [
    [8, 8, 30, 4, TEXT],
    [8, 18, 40, 4, TEXT],
    [8, 25, 36, 3, SOFT],
    [52, 18, 40, 4, TEXT],
    [52, 25, 36, 3, SOFT],
    [8, 35, 40, 4, TEXT],
    [52, 35, 40, 4, TEXT],
  ],
  card: [
    [16, 8, 68, 40, SOFT, 4],
    [30, 16, 40, 5, TEXT],
    [26, 25, 48, 3, SOFT],
    [40, 33, 20, 6, ACCENT, 3],
  ],
  stack: [
    [38, 6, 24, 10, SOFT, 5],
    [22, 20, 56, 6, ACCENT, 3],
    [22, 29, 56, 6, ACCENT, 3],
    [22, 38, 56, 6, ACCENT, 3],
  ],
  pills: [
    [38, 6, 24, 10, SOFT, 5],
    [14, 22, 22, 7, ACCENT, 4],
    [39, 22, 22, 7, ACCENT, 4],
    [64, 22, 22, 7, ACCENT, 4],
    [26, 33, 22, 7, ACCENT, 4],
    [51, 33, 22, 7, ACCENT, 4],
  ],
  simple: [
    [8, 18, 30, 5, TEXT],
    [8, 27, 50, 3, SOFT],
    [70, 18, 22, 3, SOFT],
    [70, 25, 22, 3, SOFT],
  ],
};

export function LayoutThumb({ layout }: { layout: string }) {
  const shapes = LAYOUTS[layout] ?? LAYOUTS.list!;
  return (
    <svg
      viewBox="0 0 100 56"
      className="block h-auto w-full"
      aria-hidden="true"
    >
      {shapes.map(([x, y, w, h, fill, r = 1.5], index) => (
        <rect key={index} x={x} y={y} width={w} height={h} rx={r} fill={fill} />
      ))}
    </svg>
  );
}
