import { useId } from "react";
import {
  CUSTOM_PLAYBACK_RATE_STEP,
  formatPlaybackRate,
  MAX_CUSTOM_PLAYBACK_RATE,
  MIN_CUSTOM_PLAYBACK_RATE,
} from "../playback/playbackRates";

export interface PlaybackRateSliderProps {
  playbackRate: number;
  onRateChange: (rate: number) => void;
}

export function PlaybackRateSlider({
  onRateChange,
  playbackRate,
}: PlaybackRateSliderProps) {
  const sliderId = useId();
  const sliderValue = Math.min(
    MAX_CUSTOM_PLAYBACK_RATE,
    Math.max(MIN_CUSTOM_PLAYBACK_RATE, playbackRate),
  );
  const valueLabel = formatPlaybackRate(sliderValue);

  return (
    <div
      role="none"
      className="mt-1 border-t border-white/10 px-2.5 pb-1 pt-2.5"
    >
      <label
        htmlFor={sliderId}
        className="flex items-center justify-between gap-3 text-sm text-white"
      >
        <span className="font-medium">Custom speed</span>
        <output htmlFor={sliderId} className="tabular-nums text-white/72">
          {valueLabel}
        </output>
      </label>
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
        className="h-10 w-full cursor-pointer accent-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        onChange={(event) => onRateChange(event.currentTarget.valueAsNumber)}
      />
      <div
        aria-hidden="true"
        className="flex justify-between text-[11px] tabular-nums text-white/55"
      >
        <span>{formatPlaybackRate(MIN_CUSTOM_PLAYBACK_RATE)}</span>
        <span>{formatPlaybackRate(MAX_CUSTOM_PLAYBACK_RATE)}</span>
      </div>
    </div>
  );
}
