import type { CSSProperties } from "react";
import { DiyaIcon } from "./DiyaIcon";
import { ShotsLayer, useFountainShots } from "./FountainShots";
import "./diwali.css";

/** Left out of the collapsed rail, which keeps only the fountain. */
const notInRail = "[.courses-app--collapsed_&]:hidden";

/** Sparks rising from the fountain (anar): angle, rise, duration, delay. */
const fountainSparks: readonly [number, number, number, number][] = [
  [-26, 100, 3.3, 0.2],
  [-17, 150, 4.2, 1.2],
  [-9, 110, 3.1, 1.9],
  [-3, 160, 4.6, 0.45],
  [3, 130, 3.7, 1.55],
  [9, 165, 4.4, 0.8],
  [17, 105, 3.2, 2.2],
  [26, 140, 4.1, 1],
];

/**
 * Two diyas around a fountain (anar), on their own pool of light. The
 * fountain sparkles and, pressed, fires a rocket into the sky (see
 * `FountainShots`). In the sidebar's collapsed rail only the fountain stays,
 * on a narrower pool. Used by the sidebar offer and the phone menu's.
 */
export function DiwaliDiyaRow() {
  const { shots, launch, remove: removeShot } = useFountainShots();
  return (
    <div className="relative flex h-12 items-end justify-center gap-7">
      <span
        aria-hidden="true"
        // In the rail, the fountain alone stands on it: narrower,
        // just wider than the fountain.
        className="absolute inset-x-6 -bottom-2.5 h-7 rounded-[50%] bg-[radial-gradient(closest-side,rgb(255_150_60/0.34),transparent)] [.courses-app--collapsed_&]:-inset-x-1.5 [.courses-app--collapsed_&]:-bottom-1.5 [.courses-app--collapsed_&]:h-4 [.courses-app--collapsed_&]:bg-[radial-gradient(closest-side,rgb(255_160_70/0.6),rgb(255_150_60/0.22)_60%,transparent)]"
      />
      <DiyaIcon className={`h-8 w-11 ${notInRail}`} />
      <span className="relative h-10 w-9">
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -top-12 -left-8 size-25 animate-[diwali-glow_5.4s_ease-in-out_infinite] rounded-full bg-[radial-gradient(circle,rgb(255_200_110/0.5),rgb(255_150_50/0.12)_45%,transparent_70%)] motion-reduce:animate-none [:root[data-rendering=software]_&]:animate-none"
        />
        <ShotsLayer shots={shots} onDone={removeShot} />
        <span
          aria-hidden="true"
          className="absolute top-0.5 left-[18px] size-0"
        >
          {fountainSparks.map(([angle, rise, duration, delay]) => (
            <span
              key={angle}
              className="absolute"
              style={{ transform: `rotate(${angle}deg)` }}
            >
              <span
                style={
                  {
                    "--spark-rise": `-${rise}px`,
                    animationDuration: `${duration}s`,
                    animationDelay: `${delay}s`,
                  } as CSSProperties
                }
                className="absolute -top-[1.5px] -left-[1.5px] size-[3px] animate-[diwali-spark_4s_cubic-bezier(.2,.75,.4,1)_infinite] rounded-full bg-[#FFE7A3] opacity-0 shadow-[0_0_6px_1px_rgb(255_186_90/0.95)] motion-reduce:hidden [:root[data-rendering=software]_&]:hidden"
              />
            </span>
          ))}
        </span>
        {/* Pressed, it fires a firework into the sky. */}
        <button
          type="button"
          onClick={(event) =>
            // Room above the fountain for the climb, less the burst.
            launch(event.currentTarget.getBoundingClientRect().top - 70)
          }
          aria-label="Light a firework"
          title="Light a firework"
          className="relative block cursor-pointer rounded-md transition-transform duration-150 hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E9B872] active:scale-95"
        >
          <svg
            viewBox="0 0 30 30"
            aria-hidden="true"
            className="relative block size-9"
          >
            <ellipse
              cx="15"
              cy="28.5"
              rx="12"
              ry="1.8"
              fill="#000"
              opacity=".35"
            />
            {/* A cone narrowing to a small flat top, where the
                sparks leave it; the bands follow its slope. */}
            <path d="M6.5 28 L23.5 28 L16 3 L14 3Z" fill="#B0451A" />
            <path d="M9.2 19 L20.8 19 L19.9 16 L10.1 16Z" fill="#F4C25B" />
            <path d="M11.6 11 L18.4 11 L17.8 9 L12.2 9Z" fill="#F4C25B" />
          </svg>
        </button>
      </span>
      <DiyaIcon
        className={`h-8 w-11 -scale-x-100 ${notInRail}`}
        flameDelay="-1.2s"
      />
    </div>
  );
}
