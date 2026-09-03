import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useRef,
  type VideoHTMLAttributes,
} from "react";
import { usePlayerController } from "./context";

export type PlayerMediaProps = Omit<
  VideoHTMLAttributes<HTMLVideoElement>,
  "src" | "children"
>;

export const PlayerMedia = forwardRef<HTMLVideoElement, PlayerMediaProps>(
  function PlayerMedia({ preload = "auto", ...props }, forwardedRef) {
    const controller = usePlayerController();
    const mediaRef = useRef<HTMLVideoElement | null>(null);
    useImperativeHandle(forwardedRef, () => mediaRef.current as HTMLVideoElement);

    const setMedia = useCallback(
      (media: HTMLVideoElement | null) => {
        const previous = mediaRef.current;
        mediaRef.current = media;
        if (media) {
          void controller.attachMedia(media).catch(() => undefined);
        } else if (previous) {
          void controller.detachMedia(previous).catch(() => undefined);
        }
      },
      [controller],
    );

    return <video {...props} ref={setMedia} preload={preload} />;
  },
);
