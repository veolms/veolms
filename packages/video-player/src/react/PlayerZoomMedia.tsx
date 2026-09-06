import { useLayoutEffect, useRef, type CSSProperties } from "react";
import { PlayerMedia, type PlayerMediaProps } from "./PlayerMedia";
import { usePlayerState } from "./usePlayerState";

export type PlayerZoomOverflowBoundary = "player" | "shell";

export interface PlayerZoomMediaProps extends PlayerMediaProps {
  overflowBoundary?: PlayerZoomOverflowBoundary;
  posterOverlaySrc?: string;
}

export function PlayerZoomMedia({
  className,
  overflowBoundary = "player",
  posterOverlaySrc,
  style,
  ...props
}: PlayerZoomMediaProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const zoom = usePlayerState(({ ui }) => ui.zoom);
  const expandedIntoShell = overflowBoundary === "shell" && zoom.scale > 1.001;
  const zoomStyle: CSSProperties = {
    transform: `translate3d(${zoom.panX}px, ${zoom.panY}px, 0) scale(${zoom.scale})`,
    transformOrigin: "center center",
    transition: zoom.transitioning
      ? "transform 220ms cubic-bezier(0.16, 1, 0.3, 1)"
      : undefined,
    willChange: zoom.gestureActive || zoom.scale > 1 ? "transform" : undefined,
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
      className={`pointer-events-none absolute inset-0 z-0 isolate rounded-[inherit] bg-black ${expandedIntoShell ? "overflow-visible" : "overflow-hidden"}`}
      data-player-zoom-viewport=""
      data-player-zoom-expanded={expandedIntoShell ? "true" : "false"}
    >
      <div
        className="absolute inset-0 bg-black"
        data-player-zoom-media-plane=""
        style={zoomStyle}
      >
        {posterOverlaySrc ? (
          <img
            src={posterOverlaySrc}
            alt=""
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 z-0 size-full object-contain"
            data-video-player-poster-overlay=""
            data-video-player-poster-src={posterOverlaySrc}
          />
        ) : null}
        <PlayerMedia
          {...props}
          className={`${className ?? ""} ${posterOverlaySrc ? "invisible" : ""} motion-reduce:!transition-none`}
          data-player-zoom-active={zoom.gestureActive ? "true" : "false"}
          data-player-zoom-scale={zoom.scale.toFixed(3)}
          style={style}
        />
      </div>
    </div>
  );
}
