import { useLayoutEffect, useRef, useState } from "react";

const SIDEBAR_TOOLTIP_SOURCE_WIDTH = 352;
const SIDEBAR_TOOLTIP_SOURCE_HEIGHT = 177;
const SIDEBAR_TOOLTIP_RENDER_HEIGHT = 38;

export function SidebarTooltipSurface() {
  const surfaceRef = useRef<SVGSVGElement>(null);
  const [surfaceWidth, setSurfaceWidth] = useState<number | null>(null);

  useLayoutEffect(() => {
    const surface = surfaceRef.current;
    if (!surface) return undefined;

    const updateSurfaceWidth = () => {
      const nextWidth = surface.getBoundingClientRect().width;
      if (nextWidth <= 0) return;
      setSurfaceWidth((currentWidth) =>
        currentWidth !== null && Math.abs(currentWidth - nextWidth) < 0.05
          ? currentWidth
          : nextWidth,
      );
    };

    updateSurfaceWidth();
    const resizeObserver = new ResizeObserver(updateSurfaceWidth);
    resizeObserver.observe(surface);
    return () => resizeObserver.disconnect();
  }, []);

  const viewBoxWidth = surfaceWidth
    ? (surfaceWidth * SIDEBAR_TOOLTIP_SOURCE_HEIGHT) /
      SIDEBAR_TOOLTIP_RENDER_HEIGHT
    : SIDEBAR_TOOLTIP_SOURCE_WIDTH;
  const rightEdge = viewBoxWidth - 1;
  const topRightCurveStart = viewBoxWidth - 21;
  const rightCurveControl = viewBoxWidth - 10;
  const bottomRightCurveEnd = viewBoxWidth - 22;

  return (
    <svg
      ref={surfaceRef}
      className="sidebar-nav-tooltip__surface"
      viewBox={`0 0 ${viewBoxWidth} ${SIDEBAR_TOOLTIP_SOURCE_HEIGHT}`}
      preserveAspectRatio="xMinYMid meet"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient
          id="sidebar-tooltip-material"
          x1="0"
          y1="0"
          x2="0"
          y2="1"
        >
          <stop className="sidebar-nav-tooltip__surface-start" offset="0%" />
          <stop className="sidebar-nav-tooltip__surface-end" offset="100%" />
        </linearGradient>
        <linearGradient id="sidebar-tooltip-edge" x1="0" y1="0" x2="0" y2="1">
          <stop className="sidebar-nav-tooltip__edge-highlight" offset="0%" />
          <stop className="sidebar-nav-tooltip__edge-accent" offset="100%" />
        </linearGradient>
      </defs>
      <path
        d={`M 51 1 H ${topRightCurveStart} C ${rightCurveControl} 1 ${rightEdge} 10 ${rightEdge} 21 V 156 C ${rightEdge} 167 ${rightCurveControl} 176 ${bottomRightCurveEnd} 176 H 51 C 40 176 34 167 34 156 V 132 C 34 126 32 123 29 120 L 4 96 C 1.6 93.7 0 91.2 0 88.5 C 0 85.8 1.6 83.3 4 81 L 29 56 C 32 53 34 50 34 45 V 21 C 34 10 40 1 51 1 Z`}
      />
    </svg>
  );
}
