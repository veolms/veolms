import { useLayoutEffect, useState, useSyncExternalStore } from "react";
import { playerRectOf } from "../react/pageFullscreen";
import { usePlayerMobileInteraction } from "../react/PlayerInteractionMode";
import { usePlayerState } from "../react/usePlayerState";
import {
  getPreviewAvailability,
  subscribePreviewAvailability,
  type PreviewAvailability,
} from "../storyboard/spriteSheetStore";
import { timeToPositionPercent } from "./timelineMath";

const NO_AVAILABILITY = () => null;

function isLoadedAt(availability: PreviewAvailability, time: number): boolean {
  return availability.loaded.some(
    ([start, end]) => time >= start && time < end,
  );
}

/** Whether the whole lesson is here (its parts merge into one). */
function isComplete(availability: PreviewAvailability): boolean {
  const [only, ...others] = availability.loaded;
  return (
    only !== undefined &&
    others.length === 0 &&
    only[0] <= 0 &&
    only[1] >= availability.duration
  );
}

/**
 * Where the lesson's pictures are, for the bar: not known yet, some still
 * missing, all here a moment ago (the wave plays), or all here (no bar).
 */
type Stage = "unknown" | "missing" | "wave" | "complete";

/**
 * The stage after `stage`, given what is here now and whether the bar is on
 * screen. Only a lesson seen missing parts gets the wave, and only when it
 * completes in view; one already all here (kept on the device) never shows
 * the bar, until parts of it are gone again. A wave plays to its end: after
 * the device's cache is cleared, the parts it no longer has are found one by
 * one as they are read, and each fetched again at once, which would restart
 * it.
 */
function nextStage(
  stage: Stage,
  availability: PreviewAvailability | null,
  inView: boolean,
): Stage {
  if (!availability || stage === "wave") return stage;
  if (!isComplete(availability)) return "missing";
  if (stage === "missing") return inView ? "wave" : "complete";
  return stage === "unknown" ? "complete" : stage;
}

/**
 * The timeline of the player the bar is in: the closest one found going up
 * from the bar. Not looked for inside the player's root only: the lesson
 * page puts its controls in a layer beside the player, not inside it.
 */
function closestTimeline(bar: HTMLElement): HTMLElement | null {
  for (let scope = bar.parentElement; scope; scope = scope.parentElement) {
    const timeline = scope.querySelector<HTMLElement>(
      "[data-video-player-timeline]",
    );
    if (timeline) return timeline;
  }
  return null;
}

/**
 * Lines the bar up with the timeline: the same left and right edges, in
 * the player's own axes (a page full screen can turn the player a quarter).
 * The timeline sits some 12px in from the player's sides on larger screens
 * and runs edge to edge on phones.
 */
function useTimelineSpan(
  bar: HTMLDivElement | null,
  active: boolean,
): { left: number; right: number } | null {
  const [span, setSpan] = useState<{ left: number; right: number } | null>(
    null,
  );
  useLayoutEffect(() => {
    const frame = bar?.parentElement;
    const timeline = bar && active ? closestTimeline(bar) : null;
    if (!active || !frame || !timeline) return undefined;
    const measure = () => {
      const outer = playerRectOf(frame);
      const inner = playerRectOf(timeline);
      const next = {
        left: Math.round(inner.left - outer.left),
        right: Math.round(outer.left + outer.width - inner.left - inner.width),
      };
      setSpan((previous) =>
        previous?.left === next.left && previous.right === next.right
          ? previous
          : next,
      );
    };
    measure();
    if (typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(frame);
    observer.observe(timeline);
    return () => observer.disconnect();
  }, [active, bar]);
  return span;
}

/**
 * Which parts of the lesson have their seek-preview pictures downloaded,
 * as a 2px bar along the top edge of the video, over the same span as the
 * timeline (with rounded ends on desktop; edge to edge on a phone), on a
 * faint dark backing: green where they are here, a fainter green where
 * they are on their way. Shown while the timeline is hovered or dragged,
 * fading out a moment after. A small triangle under the bar points up at
 * where the pointer is: green once that moment's picture is here, a
 * pulsing white while it is still coming, so the green can be seen
 * catching up with it.
 *
 * Once the whole lesson is here the bar has nothing left to show: if that
 * happens in view, a glint runs along it once and it fades for good. It
 * comes back only when parts are gone again (the device's cache cleared).
 *
 * Only for a preview video (fetched part by part where the timeline is
 * used); sheet storyboards have nothing to show here. Not in the mini
 * player.
 */
export function PreviewLoadBar() {
  const [bar, setBar] = useState<HTMLDivElement | null>(null);
  const mobile = usePlayerMobileInteraction();
  const [progress, setProgress] = useState<{
    key: string | null;
    stage: Stage;
  }>({ key: null, stage: "unknown" });
  const { active, duration, frameKey, fullscreen, previewTime } =
    usePlayerState(
      ({ media, storyboard, ui }) => ({
        active: ui.previewTime !== null || ui.scrubbing,
        duration: media.duration,
        frameKey: storyboard[0]?.imageUrl ?? null,
        fullscreen: ui.fullscreen,
        previewTime: ui.previewTime,
      }),
      (left, right) =>
        left.active === right.active &&
        left.duration === right.duration &&
        left.frameKey === right.frameKey &&
        left.fullscreen === right.fullscreen &&
        left.previewTime === right.previewTime,
    );
  const availability = useSyncExternalStore(
    subscribePreviewAvailability,
    frameKey ? () => getPreviewAvailability(frameKey) : NO_AVAILABILITY,
    NO_AVAILABILITY,
  );
  const inMiniPlayer = bar?.closest("[data-mini-player-mode]") != null;
  const inView =
    active && !inMiniPlayer && Number.isFinite(duration) && duration > 0;
  // Kept per lesson; moved on during render, as React allows for state
  // that follows what is rendered.
  const stage = progress.key === frameKey ? progress.stage : "unknown";
  const next = nextStage(stage, availability, inView);
  if (next !== stage || progress.key !== frameKey) {
    setProgress({ key: frameKey, stage: next });
  }
  const waving = stage === "wave";
  const shown = (inView && stage === "missing") || waving;
  const span = useTimelineSpan(bar, shown);

  if (
    !availability ||
    stage === "complete" ||
    !Number.isFinite(duration) ||
    duration <= 0
  ) {
    return null;
  }
  const percent = (time: number) => timeToPositionPercent(time, duration);
  const pointerLoaded =
    previewTime !== null && isLoadedAt(availability, previewTime);

  return (
    <div
      ref={setBar}
      aria-hidden="true"
      data-video-player-preview-bar=""
      data-shown={shown && span ? "true" : "false"}
      data-wave={waving ? "true" : "false"}
      data-fullscreen={fullscreen ? "true" : "false"}
      data-mobile={mobile ? "true" : "false"}
      className="pointer-events-none absolute top-0 z-2 h-0.5 bg-black/40 opacity-0 transition-opacity delay-500 duration-300 data-[fullscreen=true]:top-[env(safe-area-inset-top,0px)] data-[mobile=false]:rounded-full data-[shown=true]:opacity-100 data-[shown=true]:delay-0 data-[shown=true]:duration-150 data-[wave=true]:animate-[video-player-preview-bar-done_1.1s_linear_both]"
      style={{ left: span?.left ?? 0, right: span?.right ?? 0 }}
      onAnimationEnd={(event) => {
        if (event.animationName === "video-player-preview-bar-done") {
          setProgress({ key: frameKey, stage: "complete" });
        }
      }}
    >
      <div className="absolute inset-0 overflow-hidden rounded-[inherit] bg-white/25">
        {availability.loading.map(([start, end]) => (
          <span
            key={`loading-${start}`}
            className="absolute inset-y-0 bg-green-400/35"
            style={{
              left: `${percent(start)}%`,
              width: `${percent(end - start)}%`,
            }}
          />
        ))}
        {availability.loaded.map(([start, end]) => (
          <span
            key={`loaded-${start}`}
            className="absolute inset-y-0 bg-green-400"
            style={{
              left: `${percent(start)}%`,
              width: `${percent(end - start)}%`,
            }}
          />
        ))}
      </div>
      {waving ? (
        // A glint with a glow beneath it, run along the bar once (kept
        // within its ends); the bar fades out after it.
        <span className="absolute inset-x-0 top-0 h-2 overflow-hidden">
          <span className="absolute top-0 left-0 h-0.5 w-1/4 animate-[video-player-preview-bar-wave_0.8s_ease-in-out_both] bg-[linear-gradient(90deg,transparent,white,transparent)] drop-shadow-[0_0_3px_rgb(255_255_255/0.9)] motion-reduce:hidden" />
        </span>
      ) : null}
      {previewTime !== null ? (
        // Its tip touches the bar's underside; the stroke rounds the corners.
        <svg
          data-loaded={pointerLoaded ? "true" : "false"}
          viewBox="0 0 12 8"
          className="absolute top-0.5 h-2 w-3 -translate-x-1/2 animate-[video-player-preview-marker-wait_0.9s_ease-in-out_infinite] overflow-visible fill-current stroke-current text-white drop-shadow-[0_1px_2px_rgb(0_0_0/0.6)] motion-reduce:animate-none data-[loaded=true]:animate-none data-[loaded=true]:text-green-300 data-[loaded=true]:drop-shadow-[0_0_4px_rgb(74_222_128/0.9)]"
          style={{ left: `${percent(previewTime)}%` }}
        >
          <path d="M6 1 11 7H1Z" strokeWidth={1.5} strokeLinejoin="round" />
        </svg>
      ) : null}
    </div>
  );
}
