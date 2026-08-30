import { useEffect, useState } from "react";
import { usePlayerState } from "../react/usePlayerState";
import { usePlayerTheme } from "../themes/PlayerThemeContext";

export interface BufferingIndicatorProps {
  delay?: number;
}

function PlayerBufferingOverlay({ label }: { label: string }) {
  const BufferingIcon = usePlayerTheme().icons.buffering;

  return (
    <div
      className="pointer-events-none absolute inset-0 z-20 grid place-items-center"
      role="status"
      aria-label={label}
    >
      <span className="grid size-14 place-items-center rounded-(--video-player-control-radius) border border-(--video-player-control-border) bg-(--video-player-control-surface) text-(--video-player-control-text) shadow-(--video-player-control-shadow)">
        <BufferingIcon
          size={30}
          className="animate-spin motion-reduce:animate-none"
        />
      </span>
    </div>
  );
}

function DelayedBufferingIndicator({ delay }: { delay: number }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), delay);
    return () => clearTimeout(timer);
  }, [delay]);

  return visible ? <PlayerBufferingOverlay label="Buffering video" /> : null;
}

export function BufferingIndicator({ delay = 280 }: BufferingIndicatorProps) {
  const { buffering, lifecycle } = usePlayerState(
    ({ media }) => ({ buffering: media.buffering, lifecycle: media.lifecycle }),
    (left, right) =>
      left.buffering === right.buffering && left.lifecycle === right.lifecycle,
  );
  const initialLoading = lifecycle === "loading";

  if (initialLoading) return <PlayerBufferingOverlay label="Loading video" />;
  if (!buffering) return null;
  return <DelayedBufferingIndicator delay={delay} />;
}
