import { useEffect, useState } from "react";
import { SpinnerGap } from "@phosphor-icons/react";
import { usePlayerState } from "../react/usePlayerState";

export interface BufferingIndicatorProps {
  delay?: number;
}

export function BufferingIndicator({ delay = 280 }: BufferingIndicatorProps) {
  const { buffering, lifecycle } = usePlayerState(
    ({ media }) => ({ buffering: media.buffering, lifecycle: media.lifecycle }),
    (left, right) =>
      left.buffering === right.buffering && left.lifecycle === right.lifecycle,
  );
  const initialLoading = lifecycle === "loading";
  const [showDelayedBuffering, setShowDelayedBuffering] = useState(false);

  useEffect(() => {
    if (!buffering || initialLoading) {
      setShowDelayedBuffering(false);
      return undefined;
    }
    const timer = setTimeout(() => setShowDelayedBuffering(true), delay);
    return () => clearTimeout(timer);
  }, [buffering, delay, initialLoading]);

  if (!initialLoading && !showDelayedBuffering) return null;
  return (
    <div
      className="pointer-events-none absolute inset-0 z-20 grid place-items-center"
      role="status"
      aria-label={initialLoading ? "Loading video" : "Buffering video"}
    >
      <span className="grid size-14 place-items-center rounded-full bg-black/55 text-white shadow-xl backdrop-blur-md">
        <SpinnerGap size={30} className="animate-spin motion-reduce:animate-none" />
      </span>
    </div>
  );
}
