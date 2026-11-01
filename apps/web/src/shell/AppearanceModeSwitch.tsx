import { createLucideIcon, Sun } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import type {
  CSSProperties,
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
} from "react";
import {
  onThemeRevealStart,
  themeRevealAvailable,
  themeRevealOriginFromClick,
} from "./themeViewTransition";
import type { ThemeRevealOrigin } from "./themeViewTransition";

export type AppearanceMode = "light" | "dark";

interface AppearanceModeSwitchProps {
  mode: AppearanceMode;
  onChange: (mode: AppearanceMode, origin?: ThemeRevealOrigin) => void;
}

// A thinner, deeper crescent than Lucide's moon: a 9px circle with an 8px one
// cut from its upper right, drawn as Lucide icons are so it matches the sun.
const CrescentMoon = createLucideIcon("crescent-moon", [
  [
    "path",
    {
      d: "M9.44 3.37A9 9 0 1 0 20.63 14.56A8 8 0 0 1 9.44 3.37Z",
      key: "crescent",
    },
  ],
]);

// Each side's label, and the hover colour its pit copy takes while the
// button above it is hovered (written out per side: Tailwind reads class
// names as text).
// How far a sideways swipe must travel to change the mode.
const SWIPE_DISTANCE = 24;
// The slab moves when the page's reveal starts (see `onThemeRevealStart`);
// should no reveal come, it moves after this long anyway.
const REVEAL_START_FALLBACK_MS = 1_500;

const MODE_OPTIONS = [
  [
    "light",
    "Light",
    Sun,
    "[:where([data-appearance-switch]):has([data-appearance-mode-option=light]:hover)_&]:text-(--text)",
  ],
  [
    "dark",
    "Dark",
    CrescentMoon,
    "[:where([data-appearance-switch]):has([data-appearance-mode-option=dark]:hover)_&]:text-(--text)",
  ],
] as const;

// The slab's shape: a straight body between two S-curved edges (rounded
// alike at top and bottom, leaning in the middle), 26px wide each. Only the
// edge facing the other side lies inside the track; the other sits past the
// track's outer edge. Masks rather than clip paths, so the text-on-accent
// copy of the labels inside each end is cut to the same shape.
const slabEdge = (path: string) =>
  `url("data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 26 44' preserveAspectRatio='none'><path d='${path}'/></svg>`,
  )}")`;
const edgeMask = (path: string): CSSProperties => ({
  maskImage: slabEdge(path),
  maskSize: "100% 100%",
  maskRepeat: "no-repeat",
});
// Fills the side right of the S (the slab's left end) and left of it (its
// right end).
const LEFT_END_MASK = edgeMask("M26 0C15 0 11 44 0 44L26 44Z");
const RIGHT_END_MASK = edgeMask("M0 0L26 0C15 0 11 44 0 44Z");

// The two timings of the liquid motion: the front flows to the far end, the
// tail lets go 100ms later and springs over (a damped spring, about 12%
// overshoot, written as a linear() easing). Important, so they outrank the
// rule that stops every other transition while the reveal runs
// (theme-view-transition.css).
const FRONT_TIMING =
  "[transition:translate_420ms_cubic-bezier(0.4,0,0.2,1)]! motion-reduce:[transition:none]!";
const TAIL_TIMING =
  "[transition:translate_600ms_linear(0,0.047,0.164,0.319,0.488,0.651,0.796,0.915,1.006,1.069,1.107,1.124,1.125,1.115,1.097,1.077,1.055,1.036,1.019,1.005,0.995,0.989,0.985,0.984,0.985,0.986,0.989,0.991,1)_100ms]! motion-reduce:[transition:none]!";

// Where the two sides meet: the S the slab draws (its masks above), 26px
// wide around the middle, from 13px right of it at the top to 13px left at
// the bottom, whichever side is chosen. The buttons are clipped to it, so a
// press or hover goes to the side the S shows it on; a straight split down
// the middle gave each side the other one's corner. Sampled from the S's cubic,
// (26,0) to (0,44) with control points (15,0) and (11,44).
const DIVIDER_POINTS = Array.from({ length: 11 }, (_, index) => {
  const t = index / 10;
  const u = 1 - t;
  const x = u * u * u * 26 + 3 * u * u * t * 15 + 3 * u * t * t * 11;
  const y = 3 * u * t * t * 44 + t * t * t * 44;
  return `calc(50% + ${(x - 13).toFixed(2)}px) ${((y / 44) * 100).toFixed(2)}%`;
}).join(", ");
const OPTION_HIT_AREAS: Record<AppearanceMode, CSSProperties> = {
  light: { clipPath: `polygon(0 0, ${DIVIDER_POINTS}, 0 100%)` },
  dark: { clipPath: `polygon(${DIVIDER_POINTS}, 100% 100%, 100% 0)` },
};

const SLAB_FILL_CLASS =
  "bg-[linear-gradient(180deg,rgb(255_255_255/45%)_0_1px,transparent_1px),linear-gradient(0deg,rgb(0_0_0/18%)_0_1px,transparent_1px),linear-gradient(180deg,color-mix(in_srgb,white_14%,var(--accent)),var(--accent)_55%,color-mix(in_srgb,black_6%,var(--accent)))]";
const ACCENT_LABELS_CLASS = "left-0 w-[100cqw] text-(--on-accent)";

function ModeLabels({
  mode,
  className,
  pit = false,
}: {
  mode: AppearanceMode;
  className: string;
  pit?: boolean;
}) {
  return (
    <span
      aria-hidden="true"
      className={`pointer-events-none absolute inset-y-0 grid grid-cols-2 font-semibold ${className}`}
    >
      {MODE_OPTIONS.map(([value, label, Icon, hoverClass]) => (
        <span
          key={value}
          className={`flex items-center justify-center gap-2 transition-colors duration-150 ${pit ? hoverClass : ""}`}
        >
          <Icon
            size={19}
            strokeWidth={1.9}
            // Lucide's crescent stays crisp at this size; the chosen side is
            // filled, the other outlined.
            fill={mode === value ? "currentColor" : "none"}
          />
          {label}
        </span>
      ))}
    </span>
  );
}

// The light/dark switch at the foot of the colour theme menu: an accent slab
// raised out of a pit, sliding under the chosen side, so it moves inside the
// page's own reveal when the mode changes.
//
// On a change the slab's two ends move apart in time, like liquid: the front
// flows to the far end (420ms) while the tail lets go of the old side 100ms
// in and springs over like jelly, so the slab never covers more than about
// three quarters of the track.
//
// Everything that moves moves by `translate` only, so Chrome runs the whole
// motion on the compositor and it stays smooth while the page restyles for
// the new mode (moving the ends by `left`/`right` re-laid out the switch on
// every frame and dropped most frames on the lesson page). The slab is three
// pieces: its two S-shaped ends, each moving with its own timing, and the
// body between them, which is the overlap of a window clipped at the left
// end (moving with the left end) and a fill ending at the right end (moving
// with the right end). `cqw` is the track's width.
//
// The labels are painted twice, so their colour follows the slab at every
// moment of the motion: a plain copy in the pit, and a text-on-accent copy
// inside each slab piece, held still against the track (each copy's
// `translate` undoes its piece's with the same timing) and cut by the
// piece. The buttons on top only take the clicks, focus and the accessible
// names. `data-appearance-mode-option` lets the shell replay a press made
// over the reveal's snapshot (see CoursesPage) and keeps the dock's button
// styles off these buttons.
export function AppearanceModeSwitch({
  mode: committedMode,
  onChange: commitMode,
}: AppearanceModeSwitchProps) {
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  // The side just chosen, shown as soon as anything can be: the mode the
  // shell hands back arrives only after the page has restyled for it, and
  // the slab waited for it (about half a second on a lesson page). With a
  // reveal, the slab moves the moment the reveal starts drawing: nothing is
  // drawn before that, and a slide started at the press was half over (on an
  // iPhone almost all of it) by the first frame, so it jumped. A new mode
  // from the shell (this press landing, or a change made elsewhere) replaces
  // it.
  const [shownMode, setShownMode] = useState(committedMode);
  const [lastCommittedMode, setLastCommittedMode] = useState(committedMode);
  if (committedMode !== lastCommittedMode) {
    setLastCommittedMode(committedMode);
    setShownMode(committedMode);
  }
  const mode = shownMode;
  const pendingModeRef = useRef<AppearanceMode | null>(null);
  const pendingTimerRef = useRef<number | null>(null);
  const showPendingMode = () => {
    const pending = pendingModeRef.current;
    pendingModeRef.current = null;
    if (pendingTimerRef.current !== null) {
      window.clearTimeout(pendingTimerRef.current);
      pendingTimerRef.current = null;
    }
    // Drawn at once, ahead of the shell's own re-render for the new mode.
    if (pending) flushSync(() => setShownMode(pending));
  };
  const showPendingModeRef = useRef(showPendingMode);
  showPendingModeRef.current = showPendingMode;
  useEffect(() => {
    const stop = onThemeRevealStart((kind) => {
      if (kind === "mode") showPendingModeRef.current();
    });
    return () => {
      stop();
      if (pendingTimerRef.current !== null) {
        window.clearTimeout(pendingTimerRef.current);
      }
    };
  }, []);
  const onChange = (nextMode: AppearanceMode, origin?: ThemeRevealOrigin) => {
    if (themeRevealAvailable()) {
      pendingModeRef.current = nextMode;
      if (pendingTimerRef.current !== null) {
        window.clearTimeout(pendingTimerRef.current);
      }
      pendingTimerRef.current = window.setTimeout(
        () => showPendingModeRef.current(),
        REVEAL_START_FALLBACK_MS,
      );
    } else {
      setShownMode(nextMode);
    }
    commitMode(nextMode, origin);
  };

  // Arrows move between the two sides as in a radio group. The palette
  // menu around it reads arrows, Enter and Home/End for its swatches, so
  // only Escape and Tab are let through.
  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape" || event.key === "Tab") return;
    event.stopPropagation();
    if (!event.key.startsWith("Arrow")) return;
    event.preventDefault();
    const nextMode = mode === "dark" ? "light" : "dark";
    optionRefs.current[nextMode === "dark" ? 1 : 0]?.focus();
    onChange(nextMode);
  };

  // A sideways swipe across the track picks the side it points to (right
  // for dark), with the same motion as a click. Vertical moves stay with
  // the page (`touch-pan-y`), and the click a swipe leaves behind is
  // ignored, so a swipe that ends over the other button cannot undo it.
  const swipeRef = useRef<{ id: number; x: number; y: number } | null>(null);
  const swipedRef = useRef(false);
  const startSwipe = (event: ReactPointerEvent<HTMLDivElement>) => {
    swipedRef.current = false;
    if (!event.isPrimary || event.button !== 0) return;
    swipeRef.current = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
    };
  };
  const finishSwipe = (event: ReactPointerEvent<HTMLDivElement>) => {
    const start = swipeRef.current;
    swipeRef.current = null;
    if (start?.id !== event.pointerId) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Math.abs(dx) < SWIPE_DISTANCE || Math.abs(dx) < Math.abs(dy) * 1.2)
      return;
    // Only the click this release produces; a later keyboard press counts.
    swipedRef.current = true;
    window.setTimeout(() => {
      swipedRef.current = false;
    }, 0);
    const nextMode = dx > 0 ? "dark" : "light";
    if (nextMode !== mode)
      onChange(nextMode, { x: event.clientX, y: event.clientY });
  };

  const dark = mode === "dark";

  return (
    <div className="relative col-span-full mt-1.5">
      {/* The accent glow around the chosen side; outside the track so the
          track's clipping does not cut it off. */}
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute inset-y-0.5 left-0 w-1/2 rounded-[14px] shadow-[0_0_18px_color-mix(in_srgb,var(--accent)_34%,transparent)] [transition:translate_520ms_cubic-bezier(0.4,0,0.2,1)_60ms]! motion-reduce:[transition:none]! ${dark ? "[translate:100%]" : "[translate:0]"}`}
      />
      <div
        role="group"
        aria-label="Appearance"
        aria-keyshortcuts="Shift+D"
        data-appearance-switch
        // A pit sunk into the menu: darker than the menu, shaded inside
        // from the top with a faint light lip along the bottom.
        className="@container relative isolate grid h-11 touch-pan-y select-none grid-cols-2 overflow-hidden rounded-[14px] bg-[color-mix(in_srgb,var(--canvas)_72%,var(--surface-strong))] shadow-[inset_0_2px_6px_rgb(0_0_0/55%),inset_0_1px_1px_rgb(0_0_0/45%),inset_0_-1px_0_rgb(255_255_255/7%),0_1px_0_rgb(255_255_255/6%)] in-data-[theme=light]:bg-[color-mix(in_srgb,var(--text)_9%,var(--surface))] in-data-[theme=light]:shadow-[inset_0_2px_6px_color-mix(in_srgb,var(--text)_20%,transparent),inset_0_1px_1px_color-mix(in_srgb,var(--text)_14%,transparent),inset_0_-1px_0_rgb(255_255_255/75%),0_1px_0_rgb(255_255_255/85%)]"
        onKeyDown={handleKeyDown}
        onPointerDown={startSwipe}
        onPointerUp={finishSwipe}
        onPointerCancel={() => {
          swipeRef.current = null;
        }}
      >
        <ModeLabels
          mode={mode}
          pit
          className="inset-x-0 text-[color-mix(in_srgb,var(--text)_70%,transparent)]"
        />
        {/* Raised out of the pit: the shadows follow the S edges, so they
            are drop-shadow filters (on a wrapper, outside the masks).
            The wrapper is clipped to the track's rounded shape itself:
            Safari does not cut the moving pieces at the track's rounded
            `overflow`, and the chosen side's outer corners came out
            square. On iOS (`-webkit-touch-callout` is iOS Safari's own)
            the shadows are left off while the page's reveal runs: the
            filter is redrawn on every frame the slab moves, and with the
            page restyling for the new mode the slab jumped. */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-1 [clip-path:inset(0_round_14px)] [filter:drop-shadow(0_1px_2px_rgb(0_0_0/50%))_drop-shadow(0_4px_10px_rgb(0_0_0/45%))] in-data-[theme=light]:[filter:drop-shadow(0_1px_2px_color-mix(in_srgb,var(--text)_28%,transparent))_drop-shadow(0_4px_10px_color-mix(in_srgb,var(--text)_22%,transparent))] supports-[-webkit-touch-callout:none]:in-data-[theme-transition]:[filter:none]!"
        >
          {/* The left end. */}
          <span
            className={`absolute inset-y-0 left-0 w-6.5 overflow-hidden ${SLAB_FILL_CLASS} ${dark ? `[translate:calc(50cqw_-_13px)] ${TAIL_TIMING}` : `[translate:-26px] ${FRONT_TIMING}`}`}
            style={LEFT_END_MASK}
          >
            <ModeLabels
              mode={mode}
              className={`${ACCENT_LABELS_CLASS} ${dark ? `[translate:calc(13px_-_50cqw)] ${TAIL_TIMING}` : `[translate:26px] ${FRONT_TIMING}`}`}
            />
          </span>
          {/* The body: a window whose left side follows the left end... */}
          <span
            className={`absolute inset-y-0 left-6.25 w-[200cqw] overflow-hidden ${dark ? `[translate:calc(50cqw_-_13px)] ${TAIL_TIMING}` : `[translate:-26px] ${FRONT_TIMING}`}`}
          >
            <span
              className={`absolute inset-y-0 -left-6.25 w-[100cqw] ${dark ? `[translate:calc(13px_-_50cqw)] ${TAIL_TIMING}` : `[translate:26px] ${FRONT_TIMING}`}`}
            >
              {/* ...over a fill whose right side follows the right end. */}
              <span
                className={`absolute inset-y-0 left-0 w-[200cqw] overflow-hidden ${SLAB_FILL_CLASS} ${dark ? `[translate:calc(1px_-_100cqw)] ${FRONT_TIMING}` : `[translate:calc(-150cqw_-_12px)] ${TAIL_TIMING}`}`}
              >
                <ModeLabels
                  mode={mode}
                  className={`${ACCENT_LABELS_CLASS} ${dark ? `[translate:calc(100cqw_-_1px)] ${FRONT_TIMING}` : `[translate:calc(150cqw_+_12px)] ${TAIL_TIMING}`}`}
                />
              </span>
            </span>
          </span>
          {/* The right end. */}
          <span
            className={`absolute inset-y-0 left-0 w-6.5 overflow-hidden ${SLAB_FILL_CLASS} ${dark ? `[translate:100cqw] ${FRONT_TIMING}` : `[translate:calc(50cqw_-_13px)] ${TAIL_TIMING}`}`}
            style={RIGHT_END_MASK}
          >
            <ModeLabels
              mode={mode}
              className={`${ACCENT_LABELS_CLASS} ${dark ? `[translate:-100cqw] ${FRONT_TIMING}` : `[translate:calc(13px_-_50cqw)] ${TAIL_TIMING}`}`}
            />
          </span>
        </span>
        {MODE_OPTIONS.map(([value, label], index) => {
          const selected = mode === value;
          return (
            <button
              key={value}
              ref={(element) => {
                optionRefs.current[index] = element;
              }}
              type="button"
              role="menuitemradio"
              aria-checked={selected}
              tabIndex={selected ? 0 : -1}
              title={`${label} mode (Shift+D)`}
              data-appearance-mode-option={value}
              className="absolute inset-0 z-2 min-w-0 cursor-pointer rounded-[14px] border-0 bg-transparent text-transparent focus-visible:outline-2 focus-visible:-outline-offset-3 focus-visible:outline-(--text) aria-checked:focus-visible:outline-(--on-accent)"
              style={OPTION_HIT_AREAS[value]}
              onClick={(event) => {
                if (swipedRef.current) {
                  swipedRef.current = false;
                  return;
                }
                if (selected) return;
                onChange(value, themeRevealOriginFromClick(event) ?? undefined);
              }}
            >
              <span className="sr-only">{label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
