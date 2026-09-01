import { MinusIcon as Minus } from "@phosphor-icons/react/Minus";
import { PlusIcon as Plus } from "@phosphor-icons/react/Plus";
import { type CSSProperties, useId } from "react";
import {
  CUSTOM_PLAYBACK_RATE_STEP,
  DEFAULT_PLAYBACK_RATES,
  formatPlaybackRate,
  MAX_CUSTOM_PLAYBACK_RATE,
  MIN_CUSTOM_PLAYBACK_RATE,
  playbackRatesMatch,
} from "../playback/playbackRates";
import { classNames } from "../utils/classNames";

export interface PlaybackRateSliderProps {
  playbackRate: number;
  onRateChange: (rate: number) => void;
  quickRates?: readonly number[];
}

export function PlaybackRateSlider({
  onRateChange,
  playbackRate,
  quickRates = DEFAULT_PLAYBACK_RATES,
}: PlaybackRateSliderProps) {
  const sliderId = useId();
  const sliderValue = Math.min(
    MAX_CUSTOM_PLAYBACK_RATE,
    Math.max(MIN_CUSTOM_PLAYBACK_RATE, playbackRate),
  );
  const valueLabel = formatPlaybackRate(sliderValue);
  const sliderProgress =
    ((sliderValue - MIN_CUSTOM_PLAYBACK_RATE) /
      (MAX_CUSTOM_PLAYBACK_RATE - MIN_CUSTOM_PLAYBACK_RATE)) *
    100;
  const normalizedQuickRates = Array.from(
    new Set(
      quickRates.filter(
        (rate) =>
          Number.isFinite(rate) &&
          rate >= MIN_CUSTOM_PLAYBACK_RATE &&
          rate <= MAX_CUSTOM_PLAYBACK_RATE,
      ),
    ),
  ).sort((left, right) => left - right);
  const changeByStep = (direction: -1 | 1) => {
    onRateChange(
      Math.min(
        MAX_CUSTOM_PLAYBACK_RATE,
        Math.max(
          MIN_CUSTOM_PLAYBACK_RATE,
          Math.round(
            (sliderValue + direction * CUSTOM_PLAYBACK_RATE_STEP) * 100,
          ) / 100,
        ),
      ),
    );
  };

  return (
    <div role="none" className="px-2.5 pb-2 pt-1" data-playback-rate-control="">
      <label className="sr-only" htmlFor={sliderId}>
        Custom playback speed
      </label>
      <output
        htmlFor={sliderId}
        className="mb-3 block text-center text-xl font-semibold tabular-nums text-(--video-player-menu-text)"
        aria-live="polite"
      >
        {sliderValue.toFixed(2)}×
      </output>

      <div className="mb-3 flex items-center gap-2.5" role="none">
        <button
          type="button"
          role="menuitem"
          tabIndex={-1}
          data-menu-keep-open=""
          aria-label={`Decrease playback speed by ${formatPlaybackRate(CUSTOM_PLAYBACK_RATE_STEP)}`}
          aria-disabled={sliderValue <= MIN_CUSTOM_PLAYBACK_RATE || undefined}
          disabled={sliderValue <= MIN_CUSTOM_PLAYBACK_RATE}
          className="grid size-11 !min-h-11 shrink-0 place-items-center rounded-full bg-[color-mix(in_srgb,var(--video-player-menu-text,#fff)_10%,transparent)] text-(--video-player-menu-text) transition-colors duration-150 hover:bg-[color-mix(in_srgb,var(--video-player-menu-text,#fff)_16%,transparent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--video-player-menu-text) disabled:cursor-not-allowed disabled:opacity-35 sm:size-9 sm:!min-h-9"
          onClick={() => changeByStep(-1)}
        >
          <Minus aria-hidden="true" size={18} weight="bold" />
        </button>

        <input
          id={sliderId}
          data-menu-keep-open=""
          type="range"
          min={MIN_CUSTOM_PLAYBACK_RATE}
          max={MAX_CUSTOM_PLAYBACK_RATE}
          step={CUSTOM_PLAYBACK_RATE_STEP}
          value={sliderValue}
          aria-label="Custom playback speed"
          aria-valuetext={valueLabel}
          className="player-playback-rate-slider h-9 min-w-0 flex-1 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--video-player-menu-text)"
          style={
            {
              "--video-player-playback-rate-progress": `${sliderProgress}%`,
            } as CSSProperties
          }
          onChange={(event) => onRateChange(event.currentTarget.valueAsNumber)}
        />

        <button
          type="button"
          role="menuitem"
          tabIndex={-1}
          data-menu-keep-open=""
          aria-label={`Increase playback speed by ${formatPlaybackRate(CUSTOM_PLAYBACK_RATE_STEP)}`}
          aria-disabled={sliderValue >= MAX_CUSTOM_PLAYBACK_RATE || undefined}
          disabled={sliderValue >= MAX_CUSTOM_PLAYBACK_RATE}
          className="grid size-11 !min-h-11 shrink-0 place-items-center rounded-full bg-[color-mix(in_srgb,var(--video-player-menu-text,#fff)_10%,transparent)] text-(--video-player-menu-text) transition-colors duration-150 hover:bg-[color-mix(in_srgb,var(--video-player-menu-text,#fff)_16%,transparent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--video-player-menu-text) disabled:cursor-not-allowed disabled:opacity-35 sm:size-9 sm:!min-h-9"
          onClick={() => changeByStep(1)}
        >
          <Plus aria-hidden="true" size={18} weight="bold" />
        </button>
      </div>

      <div role="none" className="grid grid-cols-5 gap-1.5">
        {normalizedQuickRates.map((rate) => (
          <div key={rate} role="none" className="min-w-0 text-center">
            <button
              type="button"
              role="menuitemradio"
              tabIndex={-1}
              aria-checked={playbackRatesMatch(rate, playbackRate)}
              aria-label={formatPlaybackRate(rate)}
              className={classNames(
                "h-11 !min-h-11 w-full min-w-0 rounded-full px-1 text-xs font-semibold tabular-nums text-(--video-player-menu-text) transition-[background-color,color] duration-150 hover:bg-[color-mix(in_srgb,var(--video-player-menu-text,#fff)_16%,transparent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--video-player-menu-text) sm:h-8 sm:!min-h-8",
                playbackRatesMatch(rate, playbackRate)
                  ? "bg-(--video-player-accent) text-(--video-player-accent-contrast)"
                  : "bg-[color-mix(in_srgb,var(--video-player-menu-text,#fff)_10%,transparent)]",
              )}
              onClick={() => onRateChange(rate)}
            >
              {Number.isInteger(rate) ? rate.toFixed(1) : rate}
            </button>
            {playbackRatesMatch(rate, 1) ? (
              <span className="mt-1 block text-[10px] leading-none text-(--video-player-menu-text-muted)">
                Normal
              </span>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
