import {
  PlayButton,
  PlayerIconButton,
  Timeline,
  usePlayerState,
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
  const ready = usePlayerState(({ media }) => media.lifecycle === "ready");
  return (
    <div
      className={`absolute inset-0 z-30 bg-linear-to-t from-black/34 via-transparent to-black/30 ${
        ready ? "visible opacity-100" : "invisible opacity-0"
      }`}
      aria-hidden={ready ? undefined : true}
      inert={ready ? undefined : true}
      data-learning-mini-player-controls-ready={ready ? "true" : "false"}
    >
      <button
        type="button"
        className="absolute inset-0 z-10 cursor-pointer rounded-xl focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-white"
        aria-label={`Return to ${lessonTitle}`}
        data-learning-mini-player-restore=""
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
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 z-30 hidden min-[641px]:block"
        data-learning-mini-player-gesture-ignore=""
      >
        <Timeline
          ariaLabel="Mini player timeline"
          showPreview={false}
          className="pointer-events-none [&_[role=slider]]:pointer-events-auto [&_[data-timeline-buffered-range]]:rounded-none [&_[data-timeline-progress]]:rounded-none [&_[data-timeline-track]]:bottom-0 [&_[data-timeline-track]]:top-auto [&_[data-timeline-track]]:h-0.5 [&_[data-timeline-track]]:translate-y-0 [&_[data-timeline-track]]:rounded-none"
        />
      </div>
    </div>
  );
}
