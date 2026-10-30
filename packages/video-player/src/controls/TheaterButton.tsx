import { usePlayerState } from "../react/usePlayerState";
import { usePlayerTheme } from "../themes/PlayerThemeContext";
import { PlayerIconButton } from "./PlayerIconButton";

export interface TheaterButtonProps {
  onToggle: () => void;
}

export function TheaterButton({ onToggle }: TheaterButtonProps) {
  const active = usePlayerState(({ ui }) => ui.theater);
  const { icons } = usePlayerTheme();
  const Icon = active ? icons.theaterExit : icons.theaterEnter;
  return (
    <PlayerIconButton
      className="player-secondary-control"
      label={active ? "Exit theater mode" : "Enter theater mode"}
      title={active ? "Exit theater mode (T)" : "Enter theater mode (T)"}
      pressed={active}
      icon={<Icon size={22} active={active} />}
      onClick={onToggle}
    />
  );
}
