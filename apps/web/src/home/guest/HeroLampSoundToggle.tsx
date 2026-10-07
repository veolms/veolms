import { SpeakerHighIcon as SpeakerHigh } from "@phosphor-icons/react/SpeakerHigh";
import { SpeakerSlashIcon as SpeakerSlash } from "@phosphor-icons/react/SpeakerSlash";
import type { HeroLampHotspot } from "./useHeroLampHotspot";

const TOGGLE_SIZE_PX = 36;
const GAP_FROM_LAMP_PX = 2;

/**
 * The lamp switch's mute button. It sits to the left of the lamp and is only
 * on screen for a moment after the lamp has been right-clicked; `onHold` and
 * `onRelease` let a pointer resting on it keep it there.
 */
export function HeroLampSoundToggle({
  lamp,
  visible,
  muted,
  onToggle,
  onHold,
  onRelease,
}: {
  lamp: HeroLampHotspot;
  visible: boolean;
  muted: boolean;
  onToggle: () => void;
  onHold: () => void;
  onRelease: () => void;
}) {
  const Icon = muted ? SpeakerSlash : SpeakerHigh;
  const label = muted ? "Unmute the lamp switch" : "Mute the lamp switch";

  return (
    <button
      type="button"
      onClick={onToggle}
      onPointerEnter={onHold}
      onPointerLeave={onRelease}
      onFocus={onHold}
      onBlur={onRelease}
      aria-label={label}
      aria-pressed={muted}
      title={label}
      inert={!visible}
      style={{
        left: Math.max(8, lamp.left - GAP_FROM_LAMP_PX - TOGGLE_SIZE_PX),
        top: Math.max(8, lamp.top + (lamp.height - TOGGLE_SIZE_PX) / 2),
      }}
      className={`absolute z-10 grid size-9 cursor-pointer place-items-center rounded-full bg-slate-950/55 text-white backdrop-blur-sm transition-opacity duration-300 hover:bg-slate-950/75 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white motion-reduce:transition-none ${
        visible ? "opacity-100" : "pointer-events-none opacity-0"
      }`}
    >
      <Icon size={18} weight="fill" aria-hidden="true" />
    </button>
  );
}
