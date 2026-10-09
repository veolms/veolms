import { PowerIcon as Power } from "@phosphor-icons/react/Power";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { playLaptopBootSound } from "./laptopBootSound";
import { readLampSoundMuted } from "./lampSwitchSound";

/**
 * The start-up, in order: the power button fades away, the logo and its
 * progress bar fade in and run, they fade out, and the content fades in.
 * From the logo appearing to it being gone is four seconds, and the start-up
 * chime sounds as it appears.
 */
const BUTTON_FADE_MS = 300;
const BOOT_MS = 4000;
const BOOT_FADE_MS = 500;
/** Switching off is a quick fade to black, with no animation of its own. */
const POWER_OFF_FADE_MS = 300;

export type HeroLaptopPowerState =
  "off" | "starting" | "booting" | "finishing" | "on" | "stopping";

/** Apple's logo, as the company draws it (the icon set's version is not). */
function AppleLogo({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 814 1000"
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      <path d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76.5 0-103.7 40.8-165.9 40.8s-105.6-57-155.5-127C46.7 790.7 0 663 0 541.8c0-194.4 126.4-297.5 250.8-297.5 66.1 0 121.2 43.4 162.7 43.4 39.5 0 101.1-46 176.3-46 28.5 0 130.9 2.6 198.3 99.2zm-234-181.5c31.1-36.9 53.1-88.1 53.1-139.3 0-7.1-.6-14.3-1.9-20.1-50.6 1.9-110.8 33.7-147.1 75.8-28.5 32.4-55.1 83.6-55.1 135.5 0 7.8 1.3 15.6 1.9 18.1 3.2.6 8.4 1.3 13.6 1.3 45.4 0 102.5-30.4 135.5-71.3z" />
    </svg>
  );
}

/**
 * The hero laptop's power. The laptop is on when the page loads. Switched
 * off, it is a black screen with a power button in the middle; switching it
 * on starts it up the way a Mac does (the logo over a progress bar) before
 * its content comes back.
 */
export function useHeroLaptopPower() {
  const [power, setPower] = useState<HeroLaptopPowerState>("on");
  const timersRef = useRef<number[]>([]);
  const clearTimers = () => {
    timersRef.current.forEach((timer) => clearTimeout(timer));
    timersRef.current = [];
  };
  useEffect(() => clearTimers, []);

  const switchOn = () => {
    if (power !== "off") return;
    // With motion reduced the start-up is skipped rather than slowed.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setPower("on");
      return;
    }
    // The hero's sounds share one mute (the button by the lamp).
    if (!readLampSoundMuted()) playLaptopBootSound(BUTTON_FADE_MS / 1000);
    setPower("starting");
    const after = (delay: number, next: HeroLaptopPowerState) =>
      timersRef.current.push(window.setTimeout(() => setPower(next), delay));
    after(BUTTON_FADE_MS, "booting");
    after(BUTTON_FADE_MS + BOOT_MS - BOOT_FADE_MS, "finishing");
    after(BUTTON_FADE_MS + BOOT_MS, "on");
  };

  /** Off from on (through a quick fade) or from the middle of starting up. */
  const switchOff = () => {
    clearTimers();
    if (
      power !== "on" ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      setPower("off");
      return;
    }
    setPower("stopping");
    timersRef.current.push(
      window.setTimeout(() => setPower("off"), POWER_OFF_FADE_MS),
    );
  };

  return {
    power,
    switchOn,
    toggle: power === "off" ? switchOn : switchOff,
  };
}

/**
 * The laptop's screen for its power state: the content while it is on, and
 * otherwise the power button or the start-up. The content is not mounted
 * while the laptop is off, so nothing it would fetch, play or listen for
 * carries on then.
 */
export function HeroLaptopPower({
  power,
  onSwitchOn,
  children,
}: {
  power: HeroLaptopPowerState;
  onSwitchOn: () => void;
  children: ReactNode;
}) {
  if (power === "on" || power === "stopping") {
    return (
      // The screen behind it is black, so fading the content out is the
      // fade to black.
      <div
        className={`size-full transition-opacity motion-reduce:transition-none starting:opacity-0 ${
          power === "stopping"
            ? "pointer-events-none opacity-0 duration-300"
            : "duration-500"
        }`}
      >
        {children}
      </div>
    );
  }

  return (
    <div className="grid size-full place-items-center bg-black text-white">
      {power === "off" || power === "starting" ? (
        <button
          type="button"
          onClick={onSwitchOn}
          aria-label="Switch on the laptop"
          title="Switch on the laptop"
          // The screen is drawn far smaller than it is laid out, most of all
          // on a phone, so the button is large here to be a fair target there.
          className={`grid size-56 cursor-pointer place-items-center rounded-full bg-white/18 text-white transition-[background-color,opacity] duration-300 hover:bg-white/28 focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-white sm:size-36 starting:opacity-0 ${
            power === "starting" ? "pointer-events-none opacity-0" : ""
          }`}
        >
          <Power weight="bold" className="size-28 sm:size-16" />
        </button>
      ) : (
        <div
          role="status"
          aria-label="Starting up"
          className={`grid justify-items-center gap-14 transition-opacity duration-500 starting:opacity-0 ${
            power === "finishing" ? "opacity-0" : ""
          }`}
        >
          <AppleLogo className="h-36" />
          <span className="block h-1.5 w-64 overflow-hidden rounded-full bg-white/25">
            <span className="block h-full w-full rounded-full bg-white transition-[width] delay-500 duration-2500 ease-out starting:w-0" />
          </span>
        </div>
      )}
    </div>
  );
}
