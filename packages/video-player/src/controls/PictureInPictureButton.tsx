import { PictureInPicture } from "@phosphor-icons/react";
import { usePlayerController } from "../react/context";
import { usePlayerState } from "../react/usePlayerState";
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
  if (!available) return null;
  return (
    <PlayerIconButton
      className="player-secondary-control"
      label="Toggle picture in picture"
      title={active ? "Exit picture in picture (I)" : "Picture in picture (I)"}
      pressed={active}
      icon={<PictureInPicture size={22} />}
      onClick={() => void controller.togglePictureInPicture()}
    />
  );
}
