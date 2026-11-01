import "../../learning/learning-feature.css";
import type { HeroVideoPlayback } from "@veolms/contracts";
import {
  getPageFullscreenElement,
  ShakaVideoEngine,
  usePlayerController,
  usePlayerState,
  VideoPlayer,
  type VideoEngine,
  type VideoPlayerHandle,
} from "@veolms/video-player";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LessonAmbientProjection } from "../../learning/player/LessonAmbientProjection";
import {
  LessonCentralControls,
  LessonPlayerControls,
} from "../../learning/player/LessonPlayerControls";
import { LearningMiniPlayerBufferingIndicator } from "../../learning/player/learningMiniPlayerBufferingIndicator";
import {
  readAmbientPreference,
  writeAmbientPreference,
} from "../../learning/player/lessonPlayerPersistence";
import { useLearningPlayerTheme } from "../../learning/player/useLearningPlayerTheme";
import type { HeroVideoFrame } from "./HeroVideo";
import { flyHeroLaptopVideo } from "./heroFullscreenFlight";
import { heroVideoSync } from "./heroVideoSync";
import {
  createHeroVideoSource,
  HERO_WAITING_BUFFER_SECONDS,
} from "./heroVideoSource";

// As the lesson page's player (LessonVideoPlayer).
const CONTROLS_IDLE_DELAY_MS = 1_000;
const CONTROLS_TOUCH_IDLE_DELAY_MS = 3_000;
const SHORTCUTS = {
  seekBackwardLarge: false,
  seekForwardLarge: false,
  toggleTheaterMode: false,
  togglePictureInPicture: false,
} as const;
const noop = () => undefined;
/** How long after full screen opens or closes the page is left to settle. */
const FULLSCREEN_SETTLE_MS = 1_500;

/**
 * Where the video's glow goes, as the lesson page's: around the video, and
 * on a page wide enough for it behind the page too, placed by this anchor
 * name (learning.css). A phone's lesson page clips the glow to the video;
 * the hero lets it spread past the card to the screen's sides and well
 * above and below it (the hero itself clips it at its edges, so the page
 * does not grow wider).
 */
/**
 * On the page, a vertical swipe over the hero's video scrolls the page (the
 * phone layout keeps vertical swipes for itself otherwise, and swipes up
 * into full screen); a pinch still zooms the picture. In full screen every
 * gesture is the lesson's, swiping down out of it among them. The timeline
 * runs between the
 * same margins as the time and full screen buttons below it, not from edge
 * to edge.
 */
const heroSharedClasses =
  // While the timeline is dragged the buttons along the top step aside too.
  "[&:has([data-video-player-timeline][data-scrubbing=true])_[data-player-fullscreen-swipe-top-zone]]:opacity-0 [&:has([data-video-player-timeline][data-scrubbing=true])_[data-player-fullscreen-swipe-top-zone]]:pointer-events-none [&:not(:fullscreen):not([data-player-page-fullscreen])_[data-video-player-root]]:touch-pan-y! [&:not(:fullscreen):not([data-player-page-fullscreen])_[data-player-zoom-surface]]:touch-pan-y! [&:not(:fullscreen):not([data-player-page-fullscreen])_[data-player-timeline-wrap]]:inset-x-2!";

const cardClasses =
  // The card keeps its rounded corners, so the timeline runs a little above
  // its lower edge, where the corners have rounded off and its thumb is
  // clear of them, and the time and full screen buttons sit a little above
  // it (at every width: a wider window would raise the timeline into the
  // time). Full screen keeps the lesson's layout.
  `${heroSharedClasses} ` +
  "[&:not(:fullscreen):not([data-player-page-fullscreen])_[data-player-timeline-wrap]]:bottom-0! [&:not(:fullscreen):not([data-player-page-fullscreen])_[data-player-timeline-wrap]]:translate-y-[calc(50%-12px)]! [&:not(:fullscreen):not([data-player-page-fullscreen])_[data-mobile-player-corner]]:bottom-4! " +
  "[anchor-name:--learning-ambient-video-shell] [&_[data-video-player-shell-overlay-host]]:overflow-visible! [&_[data-video-player-shell-overlay-host]]:[contain:none]! [&_[data-ambient-inline-projection]]:[transform:scale(1.18,1.45)]! [&_[data-ambient-inline-projection]]:[filter:blur(44px)_saturate(1.6)]!";

/**
 * The laptop's screen is filled edge to edge (its glass is about 3:2, the
 * video is cropped to it as the poster is) and its corners are the screen's.
 * The timeline runs a little above the screen's lower edge, far enough for
 * its thumb, grown under a pointer, to stay clear of the edge (which cuts
 * off anything past it), and the time and full screen buttons sit a little
 * above it, a size smaller than a phone's, and the settings menu (which
 * opens in the video, as on a desktop) is drawn smaller too, to leave some of
 * the short screen around it, as wide as it is and never scrolling sideways
 * (the phone's settings are made for a sheet, wider than this menu), with all
 * its rows (the height it is given is
 * the screen's, before it is drawn smaller). Full screen keeps the lesson's
 * layout.
 */
const laptopClasses =
  `${heroSharedClasses} ` +
  // The moment a drag shows over the video fills the screen as the video
  // does (a canvas is fitted like it; the drawing kept for older sheets
  // fits inside, and is scaled up by the screen's 530 over the 16:9
  // picture's 450 to match).
  "[&_canvas[data-video-player-scrub-frame]]:object-cover! [&_svg[data-video-player-scrub-frame]]:scale-[1.178] " +
  "h-full [&_[data-video-player-poster-overlay]]:object-cover! [&:not(:fullscreen):not([data-player-page-fullscreen])_[data-player-timeline-wrap]]:bottom-0! [&:not(:fullscreen):not([data-player-page-fullscreen])_[data-player-timeline-wrap]]:translate-y-[calc(50%-12px)]! [&:not(:fullscreen):not([data-player-page-fullscreen])_[data-mobile-player-corner]]:bottom-4! [&:not(:fullscreen):not([data-player-page-fullscreen])_[data-mobile-player-corner]]:scale-85 [&_[data-mobile-player-corner=time]]:origin-bottom-left [&_[data-mobile-player-corner=fullscreen]]:origin-bottom-right [&:not(:fullscreen):not([data-player-page-fullscreen])_[role=menu]]:origin-top-right [&:not(:fullscreen):not([data-player-page-fullscreen])_[role=menu]]:scale-70 [&:not(:fullscreen):not([data-player-page-fullscreen])_[role=menu]]:max-h-none! [&:not(:fullscreen):not([data-player-page-fullscreen])_[role=menu]]:bg-[color-mix(in_srgb,var(--video-player-menu-solid-surface)_88%,transparent)]! [&_[role=menu]>div]:min-w-0! [&_[data-video-player-settings-back]]:-mx-1.5! [&_[data-video-player-settings-back]]:w-[calc(100%+0.75rem)]! " +
  // The seek preview, its time and the timeline's thumb are drawn smaller
  // too, and the preview lower, so it leaves most of the screen showing.
  "[&:not(:fullscreen):not([data-player-page-fullscreen])_[data-video-player-preview-mode=frame]]:mb-2! [&:not(:fullscreen):not([data-player-page-fullscreen])_[data-video-player-preview-mode=frame]]:origin-bottom [&:not(:fullscreen):not([data-player-page-fullscreen])_[data-video-player-preview-mode=frame]]:scale-70 [&:not(:fullscreen):not([data-player-page-fullscreen])_[data-video-player-preview-mode=time]>span]:scale-80 [&:not(:fullscreen):not([data-player-page-fullscreen])_[data-video-player-preview-mode=pill]]:origin-bottom [&:not(:fullscreen):not([data-player-page-fullscreen])_[data-video-player-preview-mode=pill]]:scale-80 [&:not(:fullscreen):not([data-player-page-fullscreen])_[data-timeline-thumb]]:size-2.5!";

/**
 * The hero's video played by the lesson page's player with its controls, in
 * the phone layout at every width (the laptop's in full screen has the
 * desktop's). What belongs to a course is left out:
 * the previous and next lesson buttons, autoplay, the Lessons button and
 * minimize. Settings (quality, speed, picture in picture and, in the card,
 * ambient mode), full screen, the timeline, and the taps and gestures are
 * the lesson's. A glow would only be cut off by the laptop's screen, so
 * the laptop has no ambient mode.
 *
 * It is put up under the poster, loaded and paused, ahead of a press on play,
 * or after the press, playing (see HeroVideo).
 */
export default function HeroVideoPlayer({
  playback,
  poster,
  frame,
  autoPlay,
  active,
  onPlayer,
}: {
  playback: HeroVideoPlayback;
  poster?: string;
  frame: HeroVideoFrame;
  /** Plays as soon as it is loaded (read when the video loads). */
  autoPlay: boolean;
  /**
   * False while it waits, loaded, under the poster: its keys are left to
   * the page until the visitor has pressed play.
   */
  active: boolean;
  /** Told the player's handle once it is up (and null when it goes). */
  onPlayer: (player: VideoPlayerHandle | null) => void;
}) {
  const playerRef = useRef<VideoPlayerHandle>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const playerTheme = useLearningPlayerTheme();
  // Off unless the visitor has switched it on (here or in a lesson, which
  // share the choice). The laptop draws no glow, so it changes nothing on a
  // wide page.
  const [ambientEnabled, setAmbientEnabled] = useState(() =>
    readAmbientPreference(undefined, true),
  );
  const [inView, setInView] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const card = frame === "card";
  // The laptop's video in full screen fills a desktop's screen, and gets
  // the desktop's controls there: the bar along the bottom. The card keeps
  // the phone's in full screen too.
  const desktopFullscreen = !card && fullscreen;

  const source = useMemo(() => createHeroVideoSource(playback), [playback]);

  /**
   * Puts this frame's video where the hero's other frame left it, to the
   * second, and plays it if that one was playing.
   */
  // Until this frame has been put where the other one was, its own early
  // times (from the start) are not taken as the video's position.
  const carryOnPendingRef = useRef(heroVideoSync.started);
  const carryOnFromOtherFrame = useCallback(() => {
    const shell = shellRef.current;
    const player = playerRef.current;
    if (!shell || !player || !shell.checkVisibility()) return;
    const media = shell.querySelector<HTMLVideoElement>(
      "video:not([data-player-standby])",
    );
    if (!media || media.readyState < 1) return;
    carryOnPendingRef.current = false;
    if (Math.abs(media.currentTime - heroVideoSync.time) > 0.5) {
      player.seekTo(heroVideoSync.time);
    }
    if (heroVideoSync.playing && media.paused) {
      void player.play().catch(() => undefined);
    }
  }, []);

  // Whether full screen is open, and when it last opened or closed.
  const fullscreenRef = useRef(false);
  const fullscreenChangedAtRef = useRef(Number.NEGATIVE_INFINITY);

  // A video left playing out of sight would keep talking over the page, and
  // its keys (Space, the arrows) belong to the page once it is scrolled away.
  useEffect(() => {
    const shell = shellRef.current;
    if (!shell) return undefined;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry) return;
      setInView(entry.isIntersecting);
      // Full screen takes the page's own box out of sight (a phone turned
      // sideways for it, too, for a moment as it turns back): that is no
      // reason to stop.
      const aroundFullscreen =
        fullscreenRef.current ||
        Boolean(document.fullscreenElement) ||
        getPageFullscreenElement() !== null ||
        performance.now() - fullscreenChangedAtRef.current <
          FULLSCREEN_SETTLE_MS;
      if (!entry.isIntersecting && !aroundFullscreen) {
        playerRef.current?.pause();
      }
      // Coming into view after the hero's other frame was the one shown (a
      // window resized across the switch): carry on where it was.
      if (entry.isIntersecting && heroVideoSync.started) {
        carryOnPendingRef.current = true;
        carryOnFromOtherFrame();
      }
    });
    observer.observe(shell);

    // Where the shown frame is, for the other one to carry on from. A frame
    // that is not drawn (or paused for being hidden) says nothing.
    const video = () =>
      shell.querySelector<HTMLVideoElement>("video:not([data-player-standby])");
    const note = (event: Event) => {
      const media = video();
      if (!media || event.target !== media || !shell.checkVisibility()) return;
      if (carryOnPendingRef.current) {
        carryOnFromOtherFrame();
        return;
      }
      heroVideoSync.time = media.currentTime;
      if (event.type === "play") heroVideoSync.playing = true;
      if (event.type === "pause" || event.type === "ended") {
        heroVideoSync.playing = false;
      }
    };
    for (const type of ["timeupdate", "seeked", "play", "pause", "ended"]) {
      shell.addEventListener(type, note, true);
    }
    return () => {
      observer.disconnect();
      for (const type of ["timeupdate", "seeked", "play", "pause", "ended"]) {
        shell.removeEventListener(type, note, true);
      }
    };
  }, [carryOnFromOtherFrame]);

  // While it waits under the poster it buffers only what the preload fetched
  // (Shaka would otherwise fill its whole buffer for a visitor who may never
  // play it); the press gives it its full buffer back.
  const engineRef = useRef<VideoEngine | null>(null);
  const engineFactory = useCallback(() => {
    const engine = new ShakaVideoEngine();
    engineRef.current = engine;
    return engine;
  }, []);
  const activeRef = useRef(active);
  useEffect(() => {
    activeRef.current = active;
    if (active) engineRef.current?.setBufferAheadLimit?.(null);
  }, [active]);

  const setPlayerRef = useCallback(
    (handle: VideoPlayerHandle | null) => {
      playerRef.current = handle;
      onPlayer(handle);
    },
    [onPlayer],
  );

  // On the laptop, leaving full screen flies the picture back into the
  // laptop's screen (see `flyHeroLaptopVideo`); going full screen is the
  // browser's own.
  const handleFullscreenChange = useCallback(
    (active: boolean) => {
      const left = fullscreenRef.current && !active;
      fullscreenRef.current = active;
      fullscreenChangedAtRef.current = performance.now();
      setFullscreen(active);
      const shell = shellRef.current;
      if (left && !card && shell) {
        void flyHeroLaptopVideo(shell, "in").then((land) => land());
      }
    },
    [card],
  );

  const handleAmbientEnabledChange = useCallback((enabled: boolean) => {
    setAmbientEnabled(enabled);
    writeAmbientPreference(enabled);
  }, []);

  return (
    <div ref={shellRef} className={card ? undefined : "size-full"}>
      <VideoPlayer
        ref={setPlayerRef}
        source={source}
        poster={poster}
        spriteStoryboardUrl={playback.storyboardUrl}
        theme={playerTheme}
        engine="shaka"
        engineFactory={engineFactory}
        autoPlay={autoPlay}
        interactionMode={desktopFullscreen ? "desktop" : "mobile"}
        // A vertical swipe on the hero's video scrolls the page.
        fullscreenSwipe={false}
        keyboardEnabled={active && inView}
        shortcuts={SHORTCUTS}
        emptyTapBehavior="responsive"
        controlsIdleDelay={CONTROLS_IDLE_DELAY_MS}
        controlsTouchIdleDelay={CONTROLS_TOUCH_IDLE_DELAY_MS}
        keepControlsVisibleUntilFirstPlay
        keepPosterVisibleUntilFirstPlay
        lockLandscapeOnFullscreen
        ariaLabel={playback.title ? `Video: ${playback.title}` : "Video"}
        onEvent={(event) => {
          if (event.type === "loaded" && heroVideoSync.started) {
            carryOnFromOtherFrame();
          }
          if (event.type === "loaded" && !activeRef.current) {
            engineRef.current?.setBufferAheadLimit?.(
              HERO_WAITING_BUFFER_SECONDS,
            );
          }
          if (event.type === "fullscreenchange") {
            handleFullscreenChange(event.detail.active);
          }
        }}
        className={card ? cardClasses : laptopClasses}
        playerClassName={
          card
            ? "!shadow-none"
            : "!aspect-auto h-full !rounded-none !shadow-none"
        }
        // Cropped to the laptop's glass, but whole in full screen.
        mediaClassName={card || fullscreen ? undefined : "!object-cover"}
        centralControl={
          <LessonCentralControls
            showLessonNavigation={false}
            canGoNext={false}
            canGoPrevious={false}
            onGoNext={noop}
            onGoPrevious={noop}
          />
        }
        controls={
          <LessonPlayerControls
            showAutoplayControl={false}
            showLessonNavigation={false}
            showAmbientControl={card}
            // The card's settings are the phone's sheet, at a phone's width
            // on a wide screen; the laptop's open in the video, as on a
            // desktop.
            settingsPresentation={card ? "sheet" : "popover"}
            // The timeline comes and goes with the other controls.
            progressWhileHidden={false}
            sheetPanelClassName="mx-auto max-w-md"
            ambientEnabled={card && ambientEnabled}
            autoplayEnabled={false}
            canGoNext={false}
            canGoPrevious={false}
            lessonTitle={playback.title}
            onAmbientEnabledChange={handleAmbientEnabledChange}
            onAutoplayEnabledChange={noop}
            onGoNext={noop}
            onGoPrevious={noop}
          />
        }
        overlays={
          <>
            <ControlsWhenEnded />
            {card ? <LessonAmbientProjection enabled={ambientEnabled} /> : null}
          </>
        }
        bufferingIndicator={<LearningMiniPlayerBufferingIndicator />}
      />
    </div>
  );
}

/**
 * Once the video has played to its end, its controls come up and stay up
 * (the mouse leaving or a resting moment does not hide them) until it plays
 * again.
 */
function ControlsWhenEnded() {
  const controller = usePlayerController();
  const ended = usePlayerState(({ media }) => media.ended);
  useEffect(() => {
    if (!ended) return undefined;
    controller.setControlsLocked(true);
    controller.setControlsVisible(true);
    return () => controller.setControlsLocked(false);
  }, [controller, ended]);
  return null;
}
