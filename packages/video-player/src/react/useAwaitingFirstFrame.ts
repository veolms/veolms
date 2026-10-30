import { useEffect, useState } from "react";
import type { PlayerController } from "./PlayerController";

/**
 * True from a source's load until its first `playing` event: the stretch
 * where a newly opened video has nothing on screen yet. The snapshot's
 * `playing` flag cannot say this, because a load does not reset it and a
 * full media sync sets it as soon as play has been asked for.
 */
export function useAwaitingFirstFrame(controller: PlayerController): boolean {
  const [awaiting, setAwaiting] = useState(
    () => !controller.getSnapshot().media.playing,
  );

  useEffect(
    () =>
      controller.onEvent((event) => {
        if (event.type === "loadstart") setAwaiting(true);
        else if (event.type === "playing") setAwaiting(false);
      }),
    [controller],
  );

  return awaiting;
}
