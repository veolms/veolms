/**
 * Where fading and sliding layers will be when the bars show a colour.
 *
 * A fade or slide (a sheet's backdrop, the sheet itself) runs on the
 * browser's compositor, which draws each frame at the time it is shown. A
 * read from script sees the animation at the main thread's frame time, which
 * is a few frames earlier than that frame reaches the screen, and the phone
 * applies a colour about when the main thread's frame does. Without a lead,
 * the bars follow such a fade a few frames late (about 3 frames, 50 ms, on an
 * Android emulator: a bright bar over a page already dimmed). The compositor
 * also starts drawing an animation a few frames after script sees it begin,
 * so a full 50 ms lead runs ahead at the start. A lead of about half of that
 * keeps the bars centred on the page through a short sheet fade.
 *
 * So opacity and background colour are taken `DISPLAY_LEAD_MS` ahead, from
 * the animation's own keyframes and timing copied into effects that have no
 * element: nothing on the page is touched or added. They follow the easing,
 * so they only ever move one way. Positions (a sheet sliding) are not
 * predicted: a guess that overshoots would make a bar flicker, which is far
 * worse than a hand-back a few frames late.
 */
export const DISPLAY_LEAD_MS = 25;

/** A layer's values `DISPLAY_LEAD_MS` from now, for what it animates. */
export interface LayerAhead {
  opacity?: string;
  backgroundColor?: string;
  /** Whether the layer is sliding (it animates `transform`). */
  sliding?: boolean;
}

type Property = "opacity" | "backgroundColor";

/**
 * The values each animated layer will have `DISPLAY_LEAD_MS` from now.
 * Layers animated only on a pseudo-element (a `::backdrop`) are left out.
 */
export function lookAhead(animations: Animation[]): Map<Element, LayerAhead> {
  const ahead = new Map<Element, LayerAhead>();
  for (const animation of animations) {
    const effect = animation.effect;
    const time = Number(animation.currentTime);
    if (
      !(effect instanceof KeyframeEffect) ||
      effect.pseudoElement !== null ||
      !(effect.target instanceof Element) ||
      !Number.isFinite(time)
    ) {
      continue;
    }
    const target = effect.target;
    const entry = ahead.get(target) ?? {};
    const keyframes = effect.getKeyframes();
    for (const property of ["opacity", "backgroundColor"] as Property[]) {
      if (!keyframes.some((keyframe) => keyframe[property] !== undefined)) {
        continue;
      }
      const value = valueAt(
        effect,
        keyframes,
        property,
        time + DISPLAY_LEAD_MS,
      );
      if (value !== null) entry[property] = value;
    }
    if (keyframes.some((keyframe) => keyframe.transform !== undefined)) {
      entry.sliding = true;
    }
    ahead.set(target, entry);
  }
  return ahead;
}

/**
 * A property's value at `time` (clamped to the end), from the keyframes and
 * timing of `effect`: the effect's easing gives the progress, the keyframe
 * segment's own easing and a linear mix of its two values the result.
 */
function valueAt(
  effect: KeyframeEffect,
  keyframes: ComputedKeyframe[],
  property: Property,
  time: number,
): string | null {
  const frames = keyframes.filter(
    (keyframe) => keyframe[property] !== undefined,
  );
  if (frames.length === 0) return null;
  const timing = effect.getTiming();
  const end = Number(effect.getComputedTiming().endTime);
  // A copy of the timing alone, with no element: nothing is applied.
  // Filled both ways, so a time past the end gives the end value.
  const clock = new Animation(
    new KeyframeEffect(null, [], { ...timing, fill: "both" }),
    null,
  );
  clock.currentTime = Math.min(time, end);
  const progress = clock.effect?.getComputedTiming().progress;
  clock.cancel();
  if (progress === null || progress === undefined) return null;
  const after = frames.findIndex((frame) => frame.computedOffset >= progress);
  if (after <= 0) return String(frames[Math.max(after, 0)]![property]);
  const from = frames[after - 1]!;
  const to = frames[after]!;
  const span = to.computedOffset - from.computedOffset;
  const local = span > 0 ? (progress - from.computedOffset) / span : 1;
  const eased = ease(from.easing ?? "linear", local);
  return mix(String(from[property]), String(to[property]), eased, property);
}

/** Any CSS easing at `fraction`, by the browser's own timing maths. */
function ease(easing: string, fraction: number): number {
  if (easing === "linear") return fraction;
  try {
    const clock = new Animation(
      new KeyframeEffect(null, [], { duration: 1000, easing, fill: "both" }),
      null,
    );
    clock.currentTime = fraction * 1000;
    const progress = clock.effect?.getComputedTiming().progress;
    clock.cancel();
    return typeof progress === "number" ? progress : fraction;
  } catch {
    return fraction;
  }
}

function mix(
  from: string,
  to: string,
  amount: number,
  property: Property,
): string | null {
  if (property === "opacity") {
    const a = Number.parseFloat(from);
    const b = Number.parseFloat(to);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
    return String(a + (b - a) * amount);
  }
  // `color-mix` leaves the parsing of both colours to the browser.
  if (from.includes("var(") || to.includes("var(")) return null;
  const percent = Math.min(100, Math.max(0, amount * 100));
  return `color-mix(in srgb, ${from} ${100 - percent}%, ${to})`;
}
