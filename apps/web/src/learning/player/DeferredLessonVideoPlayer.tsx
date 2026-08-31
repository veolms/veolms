import { PlayIcon as Play } from "@phosphor-icons/react/Play";
import {
  lazy,
  Suspense,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type { LessonVideoPlayerProps } from "./LessonVideoPlayer";
import { hasMiniPlayerRestore } from "./lessonPlayerPersistence";

const LazyLessonVideoPlayer = lazy(async () => {
  const [, module] = await Promise.all([
    import("../../player-runtime.css"),
    import("./LessonVideoPlayer"),
  ]);
  return { default: module.LessonVideoPlayer };
});

interface DeferredLessonVideoPlayerProps extends LessonVideoPlayerProps {
  poster: string;
}

interface LessonVideoPosterProps {
  lessonTitle: string;
  loading?: boolean;
  onPlay?: () => void;
  poster: string;
}

function LessonVideoPoster({
  lessonTitle,
  loading = false,
  onPlay,
  poster,
}: LessonVideoPosterProps) {
  return (
    <div className="video-shell relative isolate w-full">
      <button
        type="button"
        className="youtube-player group relative z-10 aspect-video w-full overflow-hidden rounded-xl bg-black text-white shadow-[0_18px_50px_rgba(0,0,0,.22)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--accent)"
        aria-label={loading ? `Loading ${lessonTitle}` : `Play ${lessonTitle}`}
        aria-busy={loading || undefined}
        disabled={loading}
        onClick={onPlay}
      >
        <img
          src={poster}
          alt=""
          className="absolute inset-0 size-full object-cover"
          decoding="sync"
          fetchPriority="high"
          loading="eager"
          width={960}
          height={540}
        />
        <span
          className="absolute inset-0 bg-black/18 transition-colors duration-150 group-hover:bg-black/24 group-focus-visible:bg-black/24 motion-reduce:transition-none"
          aria-hidden="true"
        />
        <span
          className="absolute inset-0 m-auto grid size-16 place-items-center rounded-full bg-black/62 shadow-[0_8px_24px_rgba(0,0,0,.28)] transition-[transform,background-color] duration-150 group-hover:scale-105 group-hover:bg-black/72 group-focus-visible:scale-105 group-focus-visible:bg-black/72 motion-reduce:transition-none max-sm:size-13"
          aria-hidden="true"
        >
          <Play
            size={30}
            weight="fill"
            className="translate-x-0.5 max-sm:size-6"
          />
        </span>
        {loading ? (
          <span
            className="absolute inset-x-4 bottom-4 text-center text-sm font-medium text-white/92"
            role="status"
            aria-live="polite"
          >
            Loading video…
          </span>
        ) : null}
      </button>
    </div>
  );
}

/**
 * Keeps the course workspace interactive without downloading the player
 * runtime, HLS manifest, or media segments until the learner requests play.
 */
export function DeferredLessonVideoPlayer({
  autoPlayOnMediaChange,
  lessonTitle,
  poster,
  ...playerProps
}: DeferredLessonVideoPlayerProps) {
  const [activated, setActivated] = useState(false);
  const focusTargetRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef(false);
  const playRequestedRef = useRef(false);
  const mediaKey =
    playerProps.resumePersistenceKey ?? playerProps.media.fileName;

  useEffect(() => {
    if (autoPlayOnMediaChange || hasMiniPlayerRestore(mediaKey)) {
      setActivated(true);
    }
  }, [autoPlayOnMediaChange, mediaKey]);

  useLayoutEffect(() => {
    if (!activated || !restoreFocusRef.current) return;

    const container = focusTargetRef.current;
    if (!container) return;

    const focusPlayer = () => {
      const player = container.querySelector<HTMLElement>(
        "[data-video-player-root]",
      );
      if (!player) return false;
      restoreFocusRef.current = false;
      player.focus({ preventScroll: true });
      return true;
    };

    if (focusPlayer()) return;

    const observer = new MutationObserver(() => {
      if (focusPlayer()) observer.disconnect();
    });
    observer.observe(container, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [activated]);

  return (
    <div
      ref={focusTargetRef}
      className="w-full"
      role="group"
      aria-label={`${lessonTitle} video player`}
    >
      {activated ? (
        <Suspense
          fallback={
            <LessonVideoPoster
              lessonTitle={lessonTitle}
              poster={poster}
              loading
            />
          }
        >
          <LazyLessonVideoPlayer
            {...playerProps}
            lessonTitle={lessonTitle}
            autoPlayOnMediaChange={
              autoPlayOnMediaChange || playRequestedRef.current
            }
          />
        </Suspense>
      ) : (
        <LessonVideoPoster
          lessonTitle={lessonTitle}
          poster={poster}
          onPlay={() => {
            restoreFocusRef.current = true;
            playRequestedRef.current = true;
            setActivated(true);
          }}
        />
      )}
    </div>
  );
}
