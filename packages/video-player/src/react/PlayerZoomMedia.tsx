import type { CSSProperties } from "react";
import { PlayerMedia, type PlayerMediaProps } from "./PlayerMedia";
import { usePlayerState } from "./usePlayerState";

export function PlayerZoomMedia({
  className,
  style,
  ...props
}: PlayerMediaProps) {
  const zoom = usePlayerState(({ ui }) => ui.zoom);
  const transform = [
    style?.transform,
    `translate3d(${zoom.panX}px, ${zoom.panY}px, 0) scale(${zoom.scale})`,
  ]
    .filter(Boolean)
    .join(" ");
  const zoomStyle: CSSProperties = {
    ...style,
    transform,
    transformOrigin: "center center",
    transition: zoom.transitioning
      ? "transform 220ms cubic-bezier(0.16, 1, 0.3, 1)"
      : style?.transition,
    willChange:
      zoom.gestureActive || zoom.scale > 1 ? "transform" : style?.willChange,
  };

  return (
    <div
      className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit] bg-black"
      data-player-zoom-viewport=""
    >
      <PlayerMedia
        {...props}
        className={`${className ?? ""} motion-reduce:!transition-none`}
        data-player-zoom-active={zoom.gestureActive ? "true" : "false"}
        data-player-zoom-scale={zoom.scale.toFixed(3)}
        style={zoomStyle}
      />
    </div>
  );
}
