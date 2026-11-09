import { useCallback, useRef, useState, type CSSProperties } from "react";
import { playFireworkSound, type BurstSound } from "./fireworkSound";

/**
 * Fireworks the fountain fires when pressed: a rocket climbs from its mouth,
 * higher than the fountain's own sparks reach, and bursts in the sky in one
 * of several kinds, chosen at random for each press, each with its own
 * sound. Some climb higher than others; presses in quick succession put
 * more power behind each shot, so it climbs higher, faster, and bursts wider.
 *
 * Every motion is a transform or an opacity (keyframes in `diwali.css`), and
 * a shot's elements are gone once its sparks have faded.
 */

/** The fountain's own sparks climb to ~165px; a shot climbs about that or higher. */
const RISE_MIN = 150;
const RISE_MAX = 250;
/** How much higher a shot climbs at full power (rapid presses). */
const POWER_LIFT = 0.6;
/** Presses closer together than this build power; further apart, it fades. */
const RAPID_PRESS_MS = 520;
/** Shots in the air at once; a press beyond this replaces the oldest. */
const MAX_SHOTS = 6;

const COLORS = [
  "#FFD27A",
  "#FF9FB0",
  "#B9C2FF",
  "#9FF0C8",
  "#FFB36B",
  "#E5B3FF",
  "#7FE3FF",
] as const;

type SparkShape = "dot" | "streak" | "long" | "glitter";

interface Spark {
  angle: number;
  reach: number;
  shape: SparkShape;
  color: string;
}

interface BurstKind {
  /** How long the sparks fly and fade, in ms. */
  duration: number;
  /** How far the whole burst sinks while it fades. */
  droop: number;
  /** How it sounds when it bursts. */
  sound: BurstSound;
  sparks: (color: string, accent: string) => Spark[];
}

const random = (min: number, max: number) => min + Math.random() * (max - min);
const pick = <T,>(items: readonly T[]) =>
  items[Math.floor(Math.random() * items.length)]!;

const ring = (
  count: number,
  reach: number,
  shape: SparkShape,
  color: string,
  offset = 0,
): Spark[] =>
  Array.from({ length: count }, (_, index) => ({
    angle: offset + (index / count) * 360,
    reach: reach + random(-3, 3),
    shape,
    color,
  }));

const burstKinds: readonly BurstKind[] = [
  // Peony: a round ball of coloured stars.
  {
    duration: 1300,
    droop: 10,
    sound: { loudness: 1, depth: 1300 },
    sparks: (color) => ring(14, 46, "dot", color),
  },
  // Chrysanthemum: bright streaks with a coloured heart.
  {
    duration: 1500,
    droop: 14,
    sound: { loudness: 1.15, depth: 1600, sizzle: 0.6 },
    sparks: (color) => [
      ...ring(20, 54, "streak", "#FFE6A8"),
      ...ring(8, 22, "dot", color, 22),
    ],
  },
  // Willow: long gold trails that sag as they fade.
  {
    duration: 2200,
    droop: 38,
    sound: { loudness: 0.7, depth: 900, sizzle: 1 },
    sparks: () => ring(16, 42, "long", "#FFC56B", 11),
  },
  // Double ring: two colours, one inside the other.
  {
    duration: 1400,
    droop: 10,
    sound: { loudness: 0.9, depth: 1400, bangs: 2 },
    sparks: (color, accent) => [
      ...ring(12, 50, "dot", color),
      ...ring(8, 26, "dot", accent, 22.5),
    ],
  },
  // Crackle: white glitter scattered unevenly, flickering.
  {
    duration: 1500,
    droop: 16,
    sound: { loudness: 0.6, depth: 1800, crackle: true },
    sparks: () =>
      Array.from({ length: 22 }, () => ({
        angle: random(0, 360),
        reach: random(16, 50),
        shape: "glitter" as const,
        color: "#FFF6DD",
      })),
  },
  // Palm: a few thick fronds.
  {
    duration: 1800,
    droop: 26,
    sound: { loudness: 1.3, depth: 700 },
    sparks: (color) => ring(7, 56, "long", color, -90),
  },
];

const sparkShapes: Record<SparkShape, string> = {
  dot: "size-[3.5px] -translate-1/2 rounded-full",
  streak: "h-0.5 w-3 -translate-x-full -translate-y-1/2 rounded-full",
  long: "h-[2.5px] w-5 -translate-x-full -translate-y-1/2 rounded-full",
  glitter: "size-0.5 -translate-1/2 rounded-full",
};

interface Shot {
  id: number;
  dx: number;
  rise: number;
  /** How long the climb takes. */
  riseMs: number;
  kind: BurstKind;
  color: string;
  sparks: Spark[];
}

let nextShotId = 0;

/**
 * A new shot. `power` (0 to 1) lifts it higher, climbs it faster and opens
 * it wider; `maxRise` keeps its burst on screen.
 */
function makeShot(power: number, maxRise: number): Shot {
  const kind = pick(burstKinds);
  const color = pick(COLORS);
  const accent = pick(COLORS.filter((other) => other !== color));
  const rise = Math.max(
    110,
    Math.min(maxRise, random(RISE_MIN, RISE_MAX) * (1 + POWER_LIFT * power)),
  );
  const spread = 1 + 0.3 * power;
  return {
    id: nextShotId++,
    dx: random(-38, 38),
    rise,
    riseMs: Math.round((520 + rise) * (1 - 0.15 * power)),
    kind,
    color,
    sparks: kind
      .sparks(color, accent)
      .map((spark) => ({ ...spark, reach: spark.reach * spread })),
  };
}

function SparkView({
  spark,
  duration,
  delay,
}: {
  spark: Spark;
  duration: number;
  delay: number;
}) {
  const head = spark.shape === "streak" || spark.shape === "long";
  return (
    <span
      className="absolute"
      style={{ transform: `rotate(${spark.angle}deg)` }}
    >
      <span
        className="absolute block animate-[diwali-shot-fly_1s_cubic-bezier(.1,.75,.3,1)_both]"
        style={
          {
            "--shot-reach": `${spark.reach}px`,
            animationDuration: `${duration}ms`,
            animationDelay: `${delay}ms`,
          } as CSSProperties
        }
      >
        <span
          className={`absolute block ${sparkShapes[spark.shape]} ${spark.shape === "glitter" ? "animate-[diwali-shot-crackle_.14s_steps(2)_infinite]" : ""}`}
          style={{
            background: head
              ? `linear-gradient(to right, transparent, ${spark.color})`
              : spark.color,
            boxShadow: head ? undefined : `0 0 5px 1px ${spark.color}`,
          }}
        />
      </span>
    </span>
  );
}

function ShotView({ shot, onDone }: { shot: Shot; onDone: () => void }) {
  const length = Math.hypot(shot.dx, shot.rise);
  const tilt = (Math.atan2(shot.dx, shot.rise) * 180) / Math.PI;
  return (
    <>
      {/* The rocket: a bright head with a fading tail, on a slant. */}
      <span className="absolute" style={{ transform: `rotate(${tilt}deg)` }}>
        <span
          className="absolute block animate-[diwali-shot-rise_1s_cubic-bezier(.25,.6,.35,1)_both]"
          style={
            {
              "--shot-len": `${-length}px`,
              animationDuration: `${shot.riseMs}ms`,
            } as CSSProperties
          }
        >
          <span className="absolute -left-px block h-6 w-0.5 rounded-full bg-[linear-gradient(to_bottom,#FFF6DD,rgb(255_190_100/0.5)_30%,transparent)]" />
          <span className="absolute -top-0.5 -left-0.5 block size-1 rounded-full bg-[#FFF6DD] shadow-[0_0_6px_2px_rgb(255_210_130/0.9)]" />
        </span>
      </span>

      {/* The burst, where the rocket ends. */}
      <span
        className="absolute"
        style={{ transform: `translate(${shot.dx}px, ${-shot.rise}px)` }}
      >
        <span
          className="absolute block animate-[diwali-shot-fall_1s_cubic-bezier(.45,0,.8,.6)_both]"
          style={
            {
              "--shot-droop": `${shot.kind.droop}px`,
              animationDuration: `${shot.kind.duration}ms`,
              animationDelay: `${shot.riseMs}ms`,
            } as CSSProperties
          }
          onAnimationEnd={(event) => {
            if (event.target === event.currentTarget) onDone();
          }}
        >
          <span
            className="absolute -top-5 -left-5 block size-10 animate-[diwali-shot-flash_.45s_ease-out_both] rounded-full"
            style={{
              background: `radial-gradient(circle, #FFF6DD, ${shot.color}66 40%, transparent 70%)`,
              animationDelay: `${shot.riseMs}ms`,
            }}
          />
          {shot.sparks.map((spark, index) => (
            <SparkView
              key={index}
              spark={spark}
              duration={shot.kind.duration}
              delay={shot.riseMs}
            />
          ))}
        </span>
      </span>
    </>
  );
}

/**
 * The shots in the air and a `launch` to fire another. `ShotsLayer` draws
 * them from the point where it is placed (the fountain's mouth).
 */
export function useFountainShots() {
  const [shots, setShots] = useState<Shot[]>([]);
  const pressRef = useRef({ at: 0, power: 0 });
  /** `maxRise`: how far above the fountain the sky reaches on screen. */
  const launch = useCallback((maxRise: number) => {
    const now = performance.now();
    const press = pressRef.current;
    const gap = now - press.at;
    press.power =
      gap < RAPID_PRESS_MS
        ? Math.min(1, press.power + 0.2)
        : gap < RAPID_PRESS_MS * 2
          ? press.power * 0.5
          : 0;
    press.at = now;
    const shot = makeShot(press.power, maxRise);
    // Played here, not in the state update, which must stay pure.
    playFireworkSound({
      riseSeconds: shot.riseMs / 1000,
      position: shot.dx / 60,
      power: press.power,
      burst: shot.kind.sound,
    });
    setShots((current) => [...current.slice(-(MAX_SHOTS - 1)), shot]);
  }, []);
  const remove = useCallback((id: number) => {
    setShots((current) => current.filter((shot) => shot.id !== id));
  }, []);
  return { shots, launch, remove };
}

export function ShotsLayer({
  shots,
  onDone,
}: {
  shots: Shot[];
  onDone: (id: number) => void;
}) {
  if (shots.length === 0) return null;
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute top-0.5 left-[18px] z-20 size-0 motion-reduce:hidden"
    >
      {shots.map((shot) => (
        <ShotView key={shot.id} shot={shot} onDone={() => onDone(shot.id)} />
      ))}
    </span>
  );
}
