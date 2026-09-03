import { usePlayerController } from "../react/context";
import { usePlayerState } from "../react/usePlayerState";
import { usePlayerTheme } from "../themes/PlayerThemeContext";
import { PlayerIconButton } from "./PlayerIconButton";

export function PictureInPictureButton() {
  const controller = usePlayerController();
  const { active, available } = usePlayerState(
    ({ capabilities, ui }) => ({
      active: ui.pictureInPicture,
      available: capabilities.pictureInPicture,
    }),
    (left, right) =>
      left.active === right.active && left.available === right.available,
  );
  const { icons } = usePlayerTheme();
  const Icon = icons.pictureInPicture;
  if (!available) return null;
  return (
    <PlayerIconButton
      className="player-secondary-control"
      label="Toggle picture in picture"
      title={active ? "Exit picture in picture (I)" : "Picture in picture (I)"}
      pressed={active}
      icon={<Icon size={22} active={active} />}
      onClick={() => void controller.togglePictureInPicture()}
    />
  );
}
