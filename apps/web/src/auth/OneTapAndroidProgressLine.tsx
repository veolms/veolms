import { useLayoutEffect, useRef } from "react";

/**
 * Android Chrome's indeterminate progress line, as its sign-in sheet draws
 * it: a two-second cycle in which one bar grows in from the left and runs
 * off the right, and a second, quicker one follows it. Each bar end's place
 * along the line was measured from a screen recording of the sheet (frame
 * by frame at 90 fps, over two cycles), and is replayed here from samples
 * every 50 ms. The same fractions held on a tablet's 600px line, so they
 * are kept as fractions of the line's width.
 */
const CYCLE_MS = 2000;
const SAMPLE_STEP_MS = 50;

interface BarEnd {
  /** When the end leaves the line's left edge, in ms into the cycle. */
  start: number;
  /** When it reaches the right edge. */
  end: number;
  /** Its place, as a fraction of the width, every 50 ms in between. */
  samples: number[];
}

const firstHead: BarEnd = {
  start: 3,
  end: 855,
  samples: [
    0.031, 0.074, 0.123, 0.175, 0.232, 0.291, 0.352, 0.414, 0.478, 0.542, 0.606,
    0.671, 0.735, 0.799, 0.864, 0.928, 0.992,
  ],
};
const firstTail: BarEnd = {
  start: 205,
  end: 1359,
  samples: [
    0.024, 0.051, 0.078, 0.105, 0.132, 0.159, 0.187, 0.216, 0.247, 0.279, 0.312,
    0.347, 0.385, 0.427, 0.474, 0.527, 0.584, 0.647, 0.72, 0.798, 0.869, 0.929,
    0.99,
  ],
};
const secondHead: BarEnd = {
  start: 1099,
  end: 1683,
  samples: [
    0.003, 0.125, 0.249, 0.371, 0.491, 0.603, 0.697, 0.768, 0.825, 0.876, 0.927,
    0.974,
  ],
};
const secondTail: BarEnd = {
  start: 1376,
  end: 1942,
  samples: [
    0.06, 0.192, 0.326, 0.451, 0.568, 0.669, 0.755, 0.828, 0.888, 0.937, 0.975,
  ],
};

/**
 * Where the native line is when it hands over: in both recordings (phone
 * and tablet) the browser's "Verifying…" sheet stood for about 3 s, and its
 * line was 1,014 ms and 993 ms into its cycle when this one first showed.
 */
const HANDOVER_PHASE_MS = 1000;

function keyframesFor({ start, end, samples }: BarEnd): Keyframe[] {
  const at = (ms: number, fraction: number): Keyframe => ({
    offset: ms / CYCLE_MS,
    transform: `scaleX(${fraction})`,
  });
  const firstSample =
    Math.floor(start / SAMPLE_STEP_MS) * SAMPLE_STEP_MS + SAMPLE_STEP_MS;
  return [
    at(0, 0),
    at(start, 0),
    ...samples.map((fraction, index) =>
      at(firstSample + index * SAMPLE_STEP_MS, fraction),
    ),
    at(end, 1),
    at(CYCLE_MS, 1),
  ];
}

/**
 * Each bar is drawn as a full-width strip scaled from the left to its head,
 * with a strip of the track's colour over it scaled to its tail, so only
 * transforms move and the line keeps running while the page is busy
 * signing in. The second bar and its cover lie over the first bar's cover.
 */
export function OneTapAndroidProgressLine() {
  const strips = useRef<(HTMLSpanElement | null)[]>([]);
  useLayoutEffect(() => {
    const ends = [firstHead, firstTail, secondHead, secondTail];
    const animations = ends.map((barEnd, index) => {
      const animation = strips.current[index]?.animate(keyframesFor(barEnd), {
        duration: CYCLE_MS,
        easing: "linear",
        iterations: Infinity,
      });
      if (animation) animation.currentTime = HANDOVER_PHASE_MS;
      return animation;
    });
    return () => animations.forEach((animation) => animation?.cancel());
  }, []);
  const strip = "absolute inset-0 origin-left [transform:scaleX(0)]";
  const bar = `${strip} bg-(--one-tap-progress)`;
  const cover = `${strip} bg-(--one-tap-track)`;
  return (
    <div className="absolute inset-x-0 top-(--one-tap-progress-top) h-0.5 overflow-hidden bg-(--one-tap-track)">
      {[bar, cover, bar, cover].map((className, index) => (
        <span
          key={index}
          ref={(element) => {
            strips.current[index] = element;
          }}
          className={className}
        />
      ))}
    </div>
  );
}
