import { usePlayerController } from "../react/context";
import { usePlayerTheme } from "../themes/PlayerThemeContext";
import { PlayerIconButton } from "./PlayerIconButton";

export interface SeekButtonProps {
  seconds: number;
  className?: string;
}

export function SeekButton({ className, seconds }: SeekButtonProps) {
  const controller = usePlayerController();
  const forward = seconds >= 0;
  const amount = Math.abs(seconds);
  const { icons } = usePlayerTheme();
  const Icon = forward ? icons.next : icons.previous;
  return (
    <PlayerIconButton
      className={className}
      label={`Seek ${forward ? "forward" : "backward"} ${amount} seconds`}
      icon={
        <span className="relative grid place-items-center">
          <Icon size={22} />
          <span className="absolute text-[8px] font-bold leading-none">
            {amount}
          </span>
        </span>
      }
      onClick={() => controller.seekBy(seconds)}
    />
  );
}
