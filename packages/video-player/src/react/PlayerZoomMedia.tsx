import { useLayoutEffect, useRef, type CSSProperties } from "react";
import { PlayerMedia, type PlayerMediaProps } from "./PlayerMedia";
import { usePlayerState } from "./usePlayerState";

export type PlayerZoomOverflowBoundary = "player" | "shell";

export interface PlayerZoomMediaProps extends PlayerMediaProps {
  overflowBoundary?: PlayerZoomOverflowBoundary;
}

export function PlayerZoomMedia({
  className,
  overflowBoundary = "player",
  style,
  ...props
}: PlayerZoomMediaProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const zoom = usePlayerState(({ ui }) => ui.zoom);
  const expandedIntoShell = overflowBoundary === "shell" && zoom.scale > 1.001;
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

  useLayoutEffect(() => {
    if (overflowBoundary !== "shell") return undefined;
    const playerRoot = viewportRef.current?.closest<HTMLElement>(
      "[data-video-player-root]",
    );
    if (!playerRoot) return undefined;
    const previousOverflow = playerRoot.style.overflow;

    if (expandedIntoShell) {
      playerRoot.style.overflow = "visible";
      playerRoot.dataset.playerZoomExpanded = "true";
    }

    return () => {
      playerRoot.style.overflow = previousOverflow;
      delete playerRoot.dataset.playerZoomExpanded;
    };
  }, [expandedIntoShell, overflowBoundary]);

  return (
    <div
      ref={viewportRef}
      className={`pointer-events-none absolute inset-0 rounded-[inherit] bg-black ${expandedIntoShell ? "overflow-visible" : "overflow-hidden"}`}
      data-player-zoom-viewport=""
      data-player-zoom-expanded={expandedIntoShell ? "true" : "false"}
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
