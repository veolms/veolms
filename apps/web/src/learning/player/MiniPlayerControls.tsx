import {
  PlayButton,
  PlayerIconButton,
  usePlayerTheme,
} from "@veolms/video-player";

export interface MiniPlayerControlsProps {
  lessonTitle: string;
  onClose: () => void;
  onRestore: () => void;
}

export function MiniPlayerControls({
  lessonTitle,
  onClose,
  onRestore,
}: MiniPlayerControlsProps) {
  const CloseIcon = usePlayerTheme().icons.close;
  return (
    <div className="absolute inset-0 z-30 bg-linear-to-t from-black/34 via-transparent to-black/30">
      <button
        type="button"
        className="absolute inset-0 z-10 cursor-pointer rounded-xl focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-white"
        aria-label={`Return to ${lessonTitle}`}
        onClick={onRestore}
      />
      <div className="absolute left-1 top-1 z-20">
        <PlayButton
          className="!size-9 !rounded-full !bg-black/62 shadow-lg backdrop-blur-md"
          iconSize={20}
        />
      </div>
      <div className="absolute right-1 top-1 z-20">
        <PlayerIconButton
          label="Close mini player"
          className="!size-9 !rounded-full !bg-black/54 backdrop-blur-md"
          icon={<CloseIcon size={20} />}
          onClick={onClose}
        />
      </div>
    </div>
  );
}
