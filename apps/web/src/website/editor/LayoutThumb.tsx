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
  boxes: [
    [26, 6, 48, 4, TEXT],
    [14, 18, 16, 20, SOFT, 2],
    [33, 18, 16, 20, SOFT, 2],
    [52, 18, 16, 20, SOFT, 2],
    [71, 18, 16, 20, SOFT, 2],
    [40, 44, 20, 6, ACCENT, 3],
  ],
  badge: [
    [10, 10, 34, 34, ACCENT, 17],
    [52, 16, 38, 6, TEXT],
    [52, 26, 34, 3, SOFT],
    [52, 33, 30, 3, SOFT],
  ],
  wide: [
    [30, 6, 40, 4, TEXT],
    [14, 14, 72, 38, SOFT, 3],
    [44, 27, 12, 12, ACCENT, 6],
  ],
  masonry: [
    [8, 8, 26, 22, SOFT, 2],
    [8, 33, 26, 15, SOFT, 2],
    [37, 8, 26, 14, SOFT, 2],
    [37, 25, 26, 23, SOFT, 2],
    [66, 8, 26, 26, SOFT, 2],
    [66, 37, 26, 11, SOFT, 2],
  ],
  narrow: [
    [26, 10, 30, 5, TEXT],
    [26, 20, 48, 3, SOFT],
    [26, 26, 46, 3, SOFT],
    [26, 32, 48, 3, SOFT],
    [26, 38, 30, 3, SOFT],
  ],
  bar: [
    [0, 38, 100, 18, SOFT, 0],
    [8, 44, 30, 5, TEXT],
    [72, 42, 20, 9, ACCENT, 4],
  ],
  gradient: [
    [0, 0, 100, 56, "color-mix(in srgb, var(--accent) 14%, transparent)", 0],
    [22, 12, 56, 7, TEXT],
    [30, 23, 40, 3, SOFT],
    [40, 31, 20, 6, ACCENT, 3],
  ],
  bento: [
    [8, 8, 40, 40, SOFT, 3],
    [51, 8, 19, 18, SOFT, 3],
    [73, 8, 19, 18, SOFT, 3],
    [51, 30, 41, 18, SOFT, 3],
  ],
  steps: [
    [10, 9, 7, 7, ACCENT, 3.5],
    [22, 11, 40, 3, TEXT],
    [10, 24, 7, 7, ACCENT, 3.5],
    [22, 26, 34, 3, TEXT],
    [10, 39, 7, 7, ACCENT, 3.5],
    [22, 41, 46, 3, TEXT],
  ],
  checklist: [
    [8, 12, 5, 5, ACCENT, 2.5],
    [16, 13, 26, 3, TEXT],
    [52, 12, 5, 5, ACCENT, 2.5],
    [60, 13, 26, 3, TEXT],
    [8, 27, 5, 5, ACCENT, 2.5],
    [16, 28, 26, 3, TEXT],
    [52, 27, 5, 5, ACCENT, 2.5],
    [60, 28, 26, 3, TEXT],
  ],
  wall: [
    [8, 8, 26, 20, SOFT, 3],
    [8, 31, 26, 17, SOFT, 3],
    [37, 8, 26, 14, SOFT, 3],
    [37, 25, 26, 23, SOFT, 3],
    [66, 8, 26, 24, SOFT, 3],
    [66, 35, 26, 13, SOFT, 3],
  ],
  marquee: [
    [30, 6, 40, 4, TEXT],
    [-8, 20, 30, 24, SOFT, 3],
    [26, 20, 30, 24, SOFT, 3],
    [60, 20, 30, 24, SOFT, 3],
    [94, 20, 30, 24, SOFT, 3],
  ],
  classic: [
    [8, 22, 18, 6, TEXT],
    [46, 23, 10, 3, SOFT],
    [59, 23, 10, 3, SOFT],
    [74, 20, 18, 9, ACCENT, 4],
  ],
  minimal: [
    [8, 22, 22, 6, TEXT],
    [74, 20, 18, 9, ACCENT, 4],
  ],
  inline: [
    [8, 16, 18, 9, ACCENT, 1],
    [8, 29, 18, 3, SOFT],
    [30, 16, 18, 9, ACCENT, 1],
    [30, 29, 18, 3, SOFT],
    [52, 16, 18, 9, ACCENT, 1],
    [52, 29, 18, 3, SOFT],
    [74, 16, 18, 9, ACCENT, 1],
    [74, 29, 18, 3, SOFT],
  ],
  band: [
    [0, 14, 100, 28, SOFT, 0],
    [10, 20, 16, 8, ACCENT, 1],
    [42, 20, 16, 8, ACCENT, 1],
    [74, 20, 16, 8, ACCENT, 1],
  ],
  single: [
    [28, 6, 44, 44, SOFT, 4],
    [36, 12, 18, 4, TEXT],
    [36, 20, 24, 7, ACCENT, 1],
    [36, 38, 28, 6, ACCENT, 3],
  ],
  left: [
    [8, 8, 30, 40, SOFT, 3],
    [46, 16, 38, 6, TEXT],
    [46, 26, 42, 3, SOFT],
    [46, 33, 20, 5, ACCENT, 2.5],
  ],
  right: [
    [62, 8, 30, 40, SOFT, 3],
    [8, 16, 38, 6, TEXT],
    [8, 26, 42, 3, SOFT],
    [8, 33, 20, 5, ACCENT, 2.5],
  ],
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
