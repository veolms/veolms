import { ArrowCounterClockwise, ArrowClockwise } from "@phosphor-icons/react";
import { usePlayerController } from "../react/context";
import { PlayerIconButton } from "./PlayerIconButton";

export interface SeekButtonProps {
  seconds: number;
  className?: string;
}

export function SeekButton({ className, seconds }: SeekButtonProps) {
  const controller = usePlayerController();
  const forward = seconds >= 0;
  const amount = Math.abs(seconds);
  return (
    <PlayerIconButton
      className={className}
      label={`Seek ${forward ? "forward" : "backward"} ${amount} seconds`}
      icon={
        <span className="relative grid place-items-center">
          {forward ? (
            <ArrowClockwise size={22} />
          ) : (
            <ArrowCounterClockwise size={22} />
          )}
          <span className="absolute text-[8px] font-bold leading-none">{amount}</span>
        </span>
      }
      onClick={() => controller.seekBy(seconds)}
    />
  );
}
