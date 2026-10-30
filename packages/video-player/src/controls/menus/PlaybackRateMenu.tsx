import {
  DEFAULT_PLAYBACK_RATES,
  formatPlaybackRate,
} from "../../playback/playbackRates";
import { usePlayerController } from "../../react/context";
import { usePlayerState } from "../../react/usePlayerState";
import { usePlayerTheme } from "../../themes/PlayerThemeContext";
import { PlaybackRateSlider } from "../PlaybackRateSlider";
import { MenuTriggerContent } from "./MenuTriggerContent";
import { PopoverMenu } from "./PopoverMenu";
import type { PlayerMenuCommonProps } from "./menuTypes";

export interface PlaybackRateMenuProps extends PlayerMenuCommonProps {
  rates?: readonly number[];
  onRateChange?: (rate: number) => void;
}

export function PlaybackRateMenu({
  align,
  className,
  defaultOpen,
  disabled,
  onOpenChange,
  onRateChange,
  open,
  panelClassName,
  rates = DEFAULT_PLAYBACK_RATES,
  side,
  trigger,
  triggerClassName,
}: PlaybackRateMenuProps) {
  const controller = usePlayerController();
  const PlaybackRateIcon = usePlayerTheme().icons.playbackRate;
  const playbackRate = usePlayerState(({ media }) => media.playbackRate);
  const normalizedRates = Array.from(
    new Set(rates.filter((rate) => Number.isFinite(rate) && rate > 0)),
  ).sort((left, right) => left - right);
  const currentLabel = formatPlaybackRate(playbackRate);

  return (
    <PopoverMenu
      label={`Playback speed, ${currentLabel}`}
      menuLabel="Playback speed"
      trigger={
        trigger ?? (
          <MenuTriggerContent
            icon={<PlaybackRateIcon className="size-4" />}
            value={currentLabel}
          />
        )
      }
      className={className}
      triggerClassName={triggerClassName}
      panelClassName={panelClassName}
      side={side}
      align={align}
      disabled={disabled || normalizedRates.length === 0}
      open={open}
      defaultOpen={defaultOpen}
      onOpenChange={onOpenChange}
    >
      <PlaybackRateSlider
        playbackRate={playbackRate}
        quickRates={normalizedRates}
        onRateChange={(rate) => {
          controller.setPlaybackRate(rate);
          onRateChange?.(rate);
        }}
      />
    </PopoverMenu>
  );
}
