import { useEffect, useRef, useState } from "react";
import type { HeroLaptopPowerSpot as PowerSpot } from "./useHeroLaptopScreen";

/** How long the spot has to be held before the laptop's power changes. */
const HOLD_MS = 650;

/**
 * The laptop's power, held on the strip of bezel under its screen the way a
 * real one's button is: a long press switches the laptop off, and another
 * switches it back on. A short press does nothing, so a stray click on the
 * picture cannot cut the video off. From the keyboard, where there is no
 * holding, pressing the button is enough.
 */
export function HeroLaptopPowerSpot({
  spot,
  isOn,
  onToggle,
}: {
  spot: PowerSpot;
  isOn: boolean;
  onToggle: () => void;
}) {
  const [holding, setHolding] = useState(false);
  const holdTimerRef = useRef<number | undefined>(undefined);
  const onToggleRef = useRef(onToggle);
  useEffect(() => {
    onToggleRef.current = onToggle;
  });
  useEffect(() => () => window.clearTimeout(holdTimerRef.current), []);

  const release = () => {
    window.clearTimeout(holdTimerRef.current);
    setHolding(false);
  };
  const hold = () => {
    window.clearTimeout(holdTimerRef.current);
    setHolding(true);
    holdTimerRef.current = window.setTimeout(() => {
      setHolding(false);
      onToggleRef.current();
    }, HOLD_MS);
  };

  const action = isOn ? "Switch off the laptop" : "Switch on the laptop";

  return (
    <button
      type="button"
      aria-label={action}
      title={`${action} (press and hold)`}
      style={{
        left: spot.left,
        top: spot.top,
        width: spot.width,
        height: spot.height,
      }}
      onPointerDown={(event) => {
        if (event.button === 0) hold();
      }}
      onPointerUp={release}
      onPointerLeave={release}
      onPointerCancel={release}
      onContextMenu={(event) => event.preventDefault()}
      onClick={(event) => {
        // A click with no pointer behind it came from the keyboard.
        if (event.detail === 0) onToggle();
      }}
      className="group/power absolute z-10 cursor-pointer touch-none rounded-full outline-none select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
    >
      {/* What the hold has reached: a thin light that grows a little from
          the middle of the strip and goes out the moment the power changes.
          It is tilted to lie along the laptop's edge, which runs slightly
          downhill to the right in the picture. */}
      <span
        aria-hidden="true"
        style={{ top: spot.lightTop }}
        className={`absolute left-1/2 block h-0.5 -translate-1/2 rotate-[3.3deg] rounded-full bg-white/80 shadow-[0_0_8px_rgb(255_255_255/0.7)] motion-reduce:transition-none ${
          holding
            ? "w-[calc(40%+4px)] opacity-100 transition-[width] duration-650 ease-linear"
            : "w-0 opacity-0 group-hover/power:w-1/5 group-hover/power:opacity-60"
        }`}
      />
    </button>
  );
}
