import { MinusIcon as Minus } from "@phosphor-icons/react/Minus";
import { PlusIcon as Plus } from "@phosphor-icons/react/Plus";
import { type CSSProperties, useId } from "react";
import {
  clampPlaybackRate,
  formatPlaybackRate,
  MAX_CUSTOM_PLAYBACK_RATE,
  MIN_CUSTOM_PLAYBACK_RATE,
  PLAYBACK_RATE_SLIDER_STEPS,
  PLAYBACK_RATE_SLIDER_TICKS,
  playbackRatesMatch,
  playbackRateToSliderPosition,
  PRESET_PLAYBACK_RATES,
  sliderPositionToPlaybackRate,
  stepPlaybackRate,
} from "../playback/playbackRates";
import { classNames } from "../utils/classNames";
import { usePlayerMobileInteraction } from "../react/PlayerInteractionMode";

export interface PlaybackRateSliderProps {
  playbackRate: number;
  onRateChange: (rate: number) => void;
  quickRates?: readonly number[];
}

/**
 * Where a tick sits over the slider: the thumb's centre travels from half a
 * thumb in from either end, not from the very ends.
 */
const tickLeft = (rate: number) =>
  `calc(0.5rem + (100% - 1rem) * ${playbackRateToSliderPosition(rate) / PLAYBACK_RATE_SLIDER_STEPS})`;

/**
 * The steps either side stand as tall as the slider and its ticks together,
 * so the three read as one row (a chip's own height, which some themes
 * set, is overridden).
 */
const stepButtonClass =
  "grid w-9 !h-auto shrink-0 self-stretch place-items-center rounded-full bg-[color-mix(in_srgb,var(--video-player-menu-text,#fff)_10%,transparent)] text-(--video-player-menu-text) transition-colors duration-150 hover:bg-[color-mix(in_srgb,var(--video-player-menu-text,#fff)_16%,transparent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--video-player-menu-text) disabled:cursor-not-allowed disabled:opacity-35";

/**
 * The speed panel, the same in every theme: the speed large, a slider from
 * 0.25× to 16× (logarithmic, so each doubling is the same length and the
 * usual speeds are not crowded into its start) with a step either side,
 * and the common speeds as buttons. The buttons are settings chips, so each
 * theme draws them as its own.
 */
export function PlaybackRateSlider({
  onRateChange,
  playbackRate,
  quickRates = PRESET_PLAYBACK_RATES,
}: PlaybackRateSliderProps) {
  const sliderId = useId();
  const mobileInteraction = usePlayerMobileInteraction();
  const rate = clampPlaybackRate(playbackRate);
  const position = playbackRateToSliderPosition(rate);
  const valueLabel = formatPlaybackRate(rate);
  const normalizedQuickRates = Array.from(
    new Set(
      quickRates.filter(
        (quickRate) =>
          Number.isFinite(quickRate) &&
          quickRate >= MIN_CUSTOM_PLAYBACK_RATE &&
          quickRate <= MAX_CUSTOM_PLAYBACK_RATE,
      ),
    ),
  ).sort((left, right) => left - right);
  const change = (next: number) => {
    if (!playbackRatesMatch(next, playbackRate)) onRateChange(next);
  };
  const slower = stepPlaybackRate(rate, -1);
  const faster = stepPlaybackRate(rate, 1);

  return (
    <div
      role="none"
      className="px-2.5 pt-1 pb-2.5"
      data-playback-rate-control=""
    >
      <div
        role="none"
        className="mb-2 flex items-baseline justify-center gap-2"
      >
        <output
          htmlFor={sliderId}
          aria-live="polite"
          data-playback-rate-value=""
          className="text-[1.625rem] leading-none font-semibold text-(--video-player-menu-text) tabular-nums"
        >
          {valueLabel}
        </output>
        {playbackRatesMatch(rate, 1) ? (
          <span className="text-xs text-(--video-player-menu-text-muted)">
            Normal
          </span>
        ) : null}
      </div>

      <div role="none" className="flex items-stretch gap-2">
        <button
          type="button"
          role="menuitem"
          tabIndex={-1}
          data-menu-keep-open=""
          data-settings-chip=""
          data-playback-rate-step="slower"
          aria-label={`Slower, ${formatPlaybackRate(slower)}`}
          disabled={rate <= MIN_CUSTOM_PLAYBACK_RATE}
          className={classNames(stepButtonClass, mobileInteraction && "!w-10")}
          onClick={() => change(slower)}
        >
          <Minus aria-hidden="true" size={16} weight="bold" />
        </button>

        <div role="none" className="relative min-w-0 flex-1 pb-4">
          <label className="sr-only" htmlFor={sliderId}>
            Playback speed
          </label>
          <input
            id={sliderId}
            data-menu-keep-open=""
            type="range"
            min={0}
            max={PLAYBACK_RATE_SLIDER_STEPS}
            step={1}
            value={position}
            aria-valuetext={valueLabel}
            className="player-playback-rate-slider block h-8 w-full cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--video-player-menu-text)"
            style={
              {
                "--video-player-playback-rate-progress": `${(position / PLAYBACK_RATE_SLIDER_STEPS) * 100}%`,
              } as CSSProperties
            }
            onChange={(event) =>
              change(
                sliderPositionToPlaybackRate(event.currentTarget.valueAsNumber),
              )
            }
          />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-0 h-3.5"
          >
            {PLAYBACK_RATE_SLIDER_TICKS.map((tick) => (
              <span
                key={tick}
                data-playback-rate-tick=""
                className={classNames(
                  "absolute top-0 -translate-x-1/2 text-[0.625rem] leading-none tabular-nums",
                  rate >= tick - 0.001
                    ? "text-(--video-player-menu-text)"
                    : "text-(--video-player-menu-text-muted)",
                )}
                style={{ left: tickLeft(tick) }}
              >
                {tick}
              </span>
            ))}
          </span>
        </div>

        <button
          type="button"
          role="menuitem"
          tabIndex={-1}
          data-menu-keep-open=""
          data-settings-chip=""
          data-playback-rate-step="faster"
          aria-label={`Faster, ${formatPlaybackRate(faster)}`}
          disabled={rate >= MAX_CUSTOM_PLAYBACK_RATE}
          className={classNames(stepButtonClass, mobileInteraction && "!w-10")}
          onClick={() => change(faster)}
        >
          <Plus aria-hidden="true" size={16} weight="bold" />
        </button>
      </div>

      <div
        role="group"
        aria-label="Common speeds"
        className="mt-3 grid grid-cols-4 gap-1.5"
      >
        {normalizedQuickRates.map((quickRate) => {
          const selected = playbackRatesMatch(quickRate, playbackRate);
          return (
            <button
              key={quickRate}
              type="button"
              role="menuitemradio"
              tabIndex={-1}
              aria-checked={selected}
              // A speed is often tried and changed again, so picking one
              // leaves the menu open, as the slider beside it does.
              data-menu-keep-open=""
              data-settings-chip=""
              className={classNames(
                "h-8 min-w-0 rounded-full px-1 text-[0.8125rem] leading-none font-semibold whitespace-nowrap tabular-nums ring-1 transition-colors duration-150 ring-inset focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-(--video-player-menu-text)",
                mobileInteraction && "!h-10",
                // Each state names its own text colour: two colour classes
                // on one element leave the winner to the stylesheet's order.
                selected
                  ? "bg-(--video-player-accent) text-(--video-player-accent-contrast) ring-(--video-player-accent)"
                  : "text-(--video-player-menu-text) ring-[color-mix(in_srgb,var(--video-player-menu-text,#fff)_22%,transparent)] hover:bg-[color-mix(in_srgb,var(--video-player-menu-text,#fff)_9%,transparent)]",
              )}
              onClick={() => change(quickRate)}
            >
              {formatPlaybackRate(quickRate)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
