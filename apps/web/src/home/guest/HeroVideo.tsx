import { PlayIcon as Play } from "@phosphor-icons/react/Play";
import type { HeroVideoPlayback } from "@veolms/contracts";
import type { VideoPlayerHandle } from "@veolms/video-player";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useState,
  type Ref,
} from "react";
import { LoadingSpinnerIcon } from "../../components/LoadingSpinner";
import { prefersReducedData } from "../../lib/reduced-data";
import { homeService } from "../../services/home";
import { heroLaptopDrawnSizeClasses } from "./HeroLaptopScreen";

const loadHeroVideoPlayer = () => import("./HeroVideoPlayer");
const HeroVideoPlayer = lazy(loadHeroVideoPlayer);

let prepared: Promise<HeroVideoPlayback> | null = null;

/**
 * What playing the video needs: its playback details (the stream and its
 * token) and the player's code. Fetched once for the page, whichever asks
 * first: the preload or a press on play. A failure is asked again next time.
 */
function prepareHeroVideo(): Promise<HeroVideoPlayback> {
  if (!prepared) {
    const promise = Promise.all([
      homeService.getHeroVideoPlayback(),
      loadHeroVideoPlayer(),
    ]).then(([playback]) => playback);
    prepared = promise;
    promise.catch(() => {
      if (prepared === promise) prepared = null;
    });
  }
  return prepared;
}

let preloading: Promise<HeroVideoPlayback> | null = null;

/**
 * Prepares the video and starts fetching its first seconds in 1080p (see
 * `preloadHeroVideo`), once a page. Settles with the playback details once
 * the preload's player is made, so a player put up after that takes the
 * preload over rather than fetching the same segments beside it.
 */
function preloadHeroVideoAhead(): Promise<HeroVideoPlayback> {
  if (!preloading) {
    const promise = prepareHeroVideo().then(async (playback) => {
      const { preloadHeroVideo } = await import("./heroVideoSource");
      await preloadHeroVideo(playback);
      return playback;
    });
    preloading = promise;
    promise.catch(() => {
      if (preloading === promise) preloading = null;
    });
  }
  return preloading;
}

/**
 * Calls `onReady` once the page has loaded and is idle and `element` is on
 * screen (the hero holds the video twice, for the laptop and for the card,
 * and shows one of them: the other is never on screen). Not for a visitor
 * whose connection asks to fetch only what they ask for.
 */
function useWhenIdleAndShown(
  element: HTMLElement | null,
  onReady: () => void,
): void {
  useEffect(() => {
    if (!element || prefersReducedData()) return undefined;
    let observer: IntersectionObserver | undefined;
    let cancelWait: (() => void) | undefined;
    const watch = () => {
      observer = new IntersectionObserver(([entry]) => {
        if (!entry?.isIntersecting) return;
        observer?.disconnect();
        onReady();
      });
      observer.observe(element);
    };
    const afterLoad = () => {
      if (typeof requestIdleCallback === "function") {
        const idle = requestIdleCallback(watch, { timeout: 4000 });
        cancelWait = () => cancelIdleCallback(idle);
      } else {
        const timer = window.setTimeout(watch, 1500);
        cancelWait = () => window.clearTimeout(timer);
      }
    };
    if (document.readyState === "complete") afterLoad();
    else window.addEventListener("load", afterLoad, { once: true });
    return () => {
      window.removeEventListener("load", afterLoad);
      cancelWait?.();
      observer?.disconnect();
    };
  }, [element, onReady]);
}

/** Where the hero's video is shown. */
export type HeroVideoFrame = "laptop" | "card";

/**
 * The hero's video (the one chosen in the home page settings), played by
 * the lesson page's own player in its phone layout: on the laptop in the
 * hero picture, and in the card a narrow page shows in place of the picture.
 *
 * Until the visitor presses play this is the poster and a play button drawn
 * like the player's. Once the page is loaded and idle, and the video is on
 * screen, its start is fetched in 1080p, and the player is put up under the
 * poster with the video loaded, paused: a press then only takes the poster
 * away and plays it, at once (and within the press, which a phone asks of a
 * video playing with sound). A press before that fetches what it needs and
 * plays the video once it is in.
 */
export function HeroVideo({
  poster,
  frame,
}: {
  /** Shown until the video is played. */
  poster?: string;
  frame: HeroVideoFrame;
}) {
  const [playback, setPlayback] = useState<HeroVideoPlayback | null>(null);
  const [pressed, setPressed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [player, setPlayer] = useState<VideoPlayerHandle | null>(null);
  const [posterElement, setPosterElement] = useState<HTMLDivElement | null>(
    null,
  );
  const prepareAhead = useCallback(() => {
    void preloadHeroVideoAhead().then(setPlayback, () => undefined);
  }, []);
  useWhenIdleAndShown(posterElement, prepareAhead);

  const start = () => {
    setPressed(true);
    if (player) {
      void player.play().catch(() => undefined);
      return;
    }
    if (loading) return;
    setLoading(true);
    // A press that fails (the API not answering) leaves the button as it
    // was, to be pressed again.
    prepareHeroVideo().then(setPlayback, () => {
      setLoading(false);
      setPressed(false);
    });
  };

  // The poster stays until the press has a player to play.
  const posterShown = !pressed || !player;
  const video = (
    <div className={`relative ${frame === "laptop" ? "size-full" : ""}`}>
      {playback ? (
        <div
          className={
            posterShown
              ? `absolute inset-0 ${frame === "card" ? "overflow-hidden rounded-xl" : ""}`
              : frame === "laptop"
                ? "size-full"
                : undefined
          }
          aria-hidden={posterShown || undefined}
          inert={posterShown}
        >
          <Suspense fallback={null}>
            <HeroVideoPlayer
              playback={playback}
              poster={poster}
              frame={frame}
              // Played by the press when it is up by then (the usual case),
              // or as soon as it is loaded after a press.
              autoPlay={pressed}
              active={pressed}
              onPlayer={setPlayer}
            />
          </Suspense>
        </div>
      ) : null}
      {posterShown ? (
        <div className={playback ? "relative z-10 size-full" : "size-full"}>
          <HeroVideoPoster
            ref={setPosterElement}
            poster={poster}
            frame={frame}
            loading={pressed}
            onPlay={start}
          />
        </div>
      ) : null}
    </div>
  );
  // The laptop's screen is drawn far smaller than it is laid out; the video
  // is laid out at the size it is seen at, so its controls are a phone's.
  return frame === "laptop" ? (
    <div className={heroLaptopDrawnSizeClasses}>{video}</div>
  ) : (
    video
  );
}

/** The poster with the player's play button (LessonCentralControls). */
function HeroVideoPoster({
  ref,
  poster,
  frame,
  loading,
  onPlay,
}: {
  ref?: Ref<HTMLDivElement>;
  poster?: string;
  frame: HeroVideoFrame;
  loading: boolean;
  onPlay: () => void;
}) {
  return (
    <div
      ref={ref}
      className={`relative overflow-hidden bg-black ${
        frame === "laptop" ? "size-full" : "aspect-video w-full rounded-xl"
      }`}
    >
      {poster ? (
        <img
          src={poster}
          alt=""
          loading="lazy"
          decoding="async"
          className="size-full object-cover"
        />
      ) : null}
      <button
        type="button"
        aria-label={loading ? "Loading video" : "Play video"}
        onClick={onPlay}
        className="absolute top-1/2 left-1/2 grid size-15.5 -translate-1/2 cursor-pointer place-items-center rounded-full bg-[rgb(5_7_11/0.5)] text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
      >
        {loading ? (
          <LoadingSpinnerIcon size={29} />
        ) : (
          <Play weight="fill" size={29} />
        )}
      </button>
    </div>
  );
}
