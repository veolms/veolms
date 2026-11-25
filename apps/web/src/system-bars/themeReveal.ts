/**
 * Which screen edges a running theme reveal has already uncovered.
 *
 * A light/dark or palette change is shown by a growing circle that uncovers
 * the new page (`::view-transition-new(root)`'s mask). The circle covers the
 * whole screen well before the animation ends (the rest of it grows past the
 * corners), so waiting for the end would change the phone's bars visibly
 * late. This reads the mask the browser computed at this moment, so it needs
 * no copy of the reveal's timing, origin or size.
 *
 * Returns `null` when no reveal mask can be read (no reveal running, reduced
 * motion, or a mask of another shape): callers then wait for the end.
 */
export function readRevealedEdges(): { top: boolean; bottom: boolean } | null {
  const mask = getComputedStyle(
    document.documentElement,
    "::view-transition-new(root)",
  ).maskImage;
  const circle = parseRevealCircle(mask);
  if (!circle) return null;
  const width = window.innerWidth;
  const height = window.innerHeight;
  const uncovered = (x: number, y: number) =>
    Math.hypot(x - circle.x, y - circle.y) <= circle.solidRadius;
  return {
    top: uncovered(0, 0) && uncovered(width, 0),
    bottom: uncovered(0, height) && uncovered(width, height),
  };
}

interface RevealCircle {
  x: number;
  y: number;
  /** Radius of the fully opaque part of the mask, in pixels. */
  solidRadius: number;
}

// `radial-gradient([circle] <r>px at <x> <y>, <colour> <stop>%, ...)`, as
// Chromium serialises the computed mask.
const RADIAL_MASK =
  /^radial-gradient\(\s*(?:circle\s+)?([\d.]+)px\s+at\s+(\S+)\s+(\S+?)\s*,\s*(?:[a-z-]+\([^)]*\)|#[\da-f]+|[a-z]+)\s+([\d.]+)%/i;

function parseRevealCircle(mask: string): RevealCircle | null {
  const match = RADIAL_MASK.exec(mask.trim());
  if (!match) return null;
  const [, radius, x, y, stop] = match;
  const centerX = toPixels(x, window.innerWidth, { left: 0, right: 1 });
  const centerY = toPixels(y, window.innerHeight, { top: 0, bottom: 1 });
  if (centerX === null || centerY === null) return null;
  return {
    x: centerX,
    y: centerY,
    solidRadius: (Number(radius) * Number(stop)) / 100,
  };
}

function toPixels(
  value: string | undefined,
  size: number,
  keywords: Record<string, number>,
): number | null {
  if (!value) return null;
  if (value.endsWith("%")) return (Number.parseFloat(value) / 100) * size;
  if (value.endsWith("px")) return Number.parseFloat(value);
  if (value === "center") return size / 2;
  const fraction = keywords[value];
  return fraction === undefined ? null : fraction * size;
}
