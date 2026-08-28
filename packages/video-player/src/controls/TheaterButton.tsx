import { Rectangle, RectangleDashed } from "@phosphor-icons/react";
import { usePlayerState } from "../react/usePlayerState";
import { PlayerIconButton } from "./PlayerIconButton";

export interface TheaterButtonProps {
  onToggle: () => void;
}

export function TheaterButton({ onToggle }: TheaterButtonProps) {
  const active = usePlayerState(({ ui }) => ui.theater);
  return (
    <PlayerIconButton
      className="player-secondary-control"
      label={active ? "Exit theater mode" : "Enter theater mode"}
      title={active ? "Exit theater mode (T)" : "Enter theater mode (T)"}
      pressed={active}
      icon={
        active ? <RectangleDashed size={22} /> : <Rectangle size={22} />
      }
      onClick={onToggle}
    />
  );
}
