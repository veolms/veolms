import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  type HTMLAttributes,
  type Ref,
  type RefObject,
  type ReactNode,
} from "react";
import type { Chapter } from "../chapters/chapterTypes";
import type { VideoEngine } from "../core/VideoEngine";
import type { VideoLoadOptions, VideoSource } from "../core/types";
import type { StoryboardFrame } from "../storyboard/storyboardTypes";
import type { TimelineMarker } from "../timeline/timelineMath";
import {
  getPlayerThemeStyle,
  resolvePlayerTheme,
  type PlayerTheme,
} from "../themes/playerThemes";
import { PlayerThemeProvider } from "../themes/PlayerThemeContext";
import { classNames } from "../utils/classNames";
import { PlayerControllerContext } from "./context";
import {
  areVideoLoadOptionsEquivalent,
  areVideoSourcesLoadEquivalent,
} from "./loadRequestEquality";
import { PlayerController } from "./PlayerController";
import type { VideoPlayerEventListener } from "./playerEvents";
import type { PlayerSnapshot } from "./playerState";
import { usePlayerZoomGestures } from "../hooks/usePlayerZoomGestures";
import {
  PlayerInteractionModeProvider,
  useResolvedPlayerMobileInteraction,
  type PlayerInteractionMode,
} from "./PlayerInteractionMode";

export type VideoEngineFactory = () => VideoEngine;

export interface VideoPlayerHandle {
  play(): Promise<void>;
  waitForPresentedFrame(): Promise<void>;
  pause(): void;
  togglePlayback(): Promise<void>;
  reload(): Promise<void>;
  seekTo(time: number): void;
  seekBy(delta: number): void;
  setVolume(volume: number): void;
  setMuted(muted: boolean): void;
  toggleMuted(): void;
  setPlaybackRate(rate: number): void;
  selectQuality(id: string | null): void;
  selectAudioTrack(id: string): void;
  selectTextTrack(id: string | null): void;
  enterFullscreen(): Promise<void>;
  exitFullscreen(): Promise<void>;
  toggleFullscreen(): Promise<void>;
  enterPictureInPicture(): Promise<void>;
  exitPictureInPicture(): Promise<void>;
  togglePictureInPicture(): Promise<void>;
  focus(): void;
  getSnapshot(): PlayerSnapshot;
}

export interface PlayerRootProps extends Omit<
  HTMLAttributes<HTMLDivElement>,
  "children" | "onError"
> {
  children: ReactNode;
  engineFactory: VideoEngineFactory;
  source: VideoSource;
  loadOptions?: VideoLoadOptions;
  autoPlay?: boolean;
  chapters?: readonly Chapter[];
  storyboard?: readonly StoryboardFrame[];
  markers?: readonly TimelineMarker[];
  theaterMode?: boolean;
  onEvent?: VideoPlayerEventListener;
  containerRef?: Ref<HTMLDivElement>;
  /**
   * Element that owns presentation modes such as fullscreen. The inner player
   * root remains the keyboard/focus target. When omitted, presentation falls
   * back to the inner root for backwards compatibility.
   */
  presentationContainerRef?: RefObject<HTMLElement | null>;
  /** Visual theme for package controls. Custom definitions can replace tokens and icons. */
  theme?: PlayerTheme;
  /** Enables pinch-to-zoom and one-finger panning of the video content. */
  zoomEnabled?: boolean;
  /** Keeps touch-first controls and gestures stable across viewport rotation. */
  interactionMode?: PlayerInteractionMode;
}

function assignRef<Value>(
  ref: Ref<Value> | undefined,
  value: Value | null,
): void {
  if (typeof ref === "function") ref(value);
  else if (ref) ref.current = value;
}

export const PlayerRoot = forwardRef<VideoPlayerHandle, PlayerRootProps>(
  function PlayerRoot(
    {
      autoPlay = false,
      chapters = [],
      children,
      containerRef,
      engineFactory,
      loadOptions,
      interactionMode = "responsive",
      markers = [],
      onClickCapture,
      onEvent,
      onPointerCancelCapture,
      onPointerDownCapture,
      onPointerMoveCapture,
      onPointerUpCapture,
      onTouchCancelCapture,
      onTouchEndCapture,
      onTouchMoveCapture,
      onTouchStartCapture,
      presentationContainerRef,
      source,
      storyboard = [],
      theaterMode = false,
      theme = "youtube",
      zoomEnabled = true,
      className,
      style,
      ...containerProps
    },
    ref,
  ) {
    const controllerRef = useRef<PlayerController | null>(null);
    if (!controllerRef.current) {
      controllerRef.current = new PlayerController(engineFactory());
    }
    const controller = controllerRef.current;
    const mobileInteraction =
      useResolvedPlayerMobileInteraction(interactionMode);
    const zoomGestures = usePlayerZoomGestures(controller);
    const controlsHiddenAtPointerDownRef = useRef(false);
    const lifecycleVersionRef = useRef(0);
    const autoPlayRef = useRef(autoPlay);
    autoPlayRef.current = autoPlay;
    const stableSourceRef = useRef(source);
    if (!areVideoSourcesLoadEquivalent(stableSourceRef.current, source)) {
      stableSourceRef.current = source;
    }
    const stableLoadOptionsRef = useRef(loadOptions);
    if (
      !areVideoLoadOptionsEquivalent(stableLoadOptionsRef.current, loadOptions)
    ) {
      stableLoadOptionsRef.current = loadOptions;
    }
    const stableSource = stableSourceRef.current;
    const stableLoadOptions = stableLoadOptionsRef.current;

    useLayoutEffect(() => {
      lifecycleVersionRef.current += 1;
      controller.activate();

      return () => {
        controller.deactivate();
        const cleanupVersion = ++lifecycleVersionRef.current;

        // StrictMode immediately replays effect setup after its development-only
        // cleanup. Deferring final destruction through that replay keeps the
        // committed controller usable, while a real unmount still owns exactly
        // one engine destruction.
        queueMicrotask(() => {
          if (lifecycleVersionRef.current !== cleanupVersion) return;
          void controller.destroy().catch(() => undefined);
        });
      };
    }, [controller]);

    const setContainer = useCallback(
      (container: HTMLDivElement | null) => {
        controller.setFocusTarget(container);
        if (!presentationContainerRef) {
          controller.setPresentationContainer(container);
        }
        assignRef(containerRef, container);
      },
      [containerRef, controller, presentationContainerRef],
    );

    useLayoutEffect(() => {
      if (!presentationContainerRef) return undefined;
      controller.setPresentationContainerResolver(
        () => presentationContainerRef.current,
      );
      return () => controller.setPresentationContainerResolver(null);
    }, [controller, presentationContainerRef]);

    useImperativeHandle(
      ref,
      () => ({
        play: () => controller.play(),
        waitForPresentedFrame: () => controller.waitForPresentedFrame(),
        pause: () => controller.pause(),
        togglePlayback: () => controller.togglePlayback(),
        reload: () => controller.reload(),
        seekTo: (time) => controller.seekTo(time),
        seekBy: (delta) => controller.seekBy(delta),
        setVolume: (volume) => controller.setVolume(volume),
        setMuted: (muted) => controller.setMuted(muted),
        toggleMuted: () => controller.toggleMuted(),
        setPlaybackRate: (rate) => controller.setPlaybackRate(rate),
        selectQuality: (id) => controller.selectQuality(id),
        selectAudioTrack: (id) => controller.selectAudioTrack(id),
        selectTextTrack: (id) => controller.selectTextTrack(id),
        enterFullscreen: () => controller.enterFullscreen(),
        exitFullscreen: () => controller.exitFullscreen(),
        toggleFullscreen: () => controller.toggleFullscreen(),
        enterPictureInPicture: () => controller.enterPictureInPicture(),
        exitPictureInPicture: () => controller.exitPictureInPicture(),
        togglePictureInPicture: () => controller.togglePictureInPicture(),
        focus: () => controller.focus(),
        getSnapshot: () => controller.getSnapshot(),
      }),
      [controller],
    );

    useEffect(() => {
      controller.setChapters(chapters);
    }, [chapters, controller]);

    useEffect(() => {
      controller.setStoryboard(storyboard);
    }, [controller, storyboard]);

    useEffect(() => {
      controller.setMarkers(markers);
    }, [controller, markers]);

    useEffect(() => {
      controller.setTheaterMode(theaterMode);
    }, [controller, theaterMode]);

    useEffect(() => {
      if (!onEvent) return undefined;
      return controller.onEvent(onEvent);
    }, [controller, onEvent]);

    useEffect(() => {
      void controller
        .load({
          source: stableSource,
          options: stableLoadOptions,
          autoPlay: autoPlayRef.current,
        })
        .catch(() => undefined);
    }, [controller, stableLoadOptions, stableSource]);

    const resolvedTheme = resolvePlayerTheme(theme);
    const themeStyle = {
      ...getPlayerThemeStyle(resolvedTheme),
      ...style,
    };

    return (
      <PlayerThemeProvider theme={resolvedTheme}>
        <PlayerControllerContext.Provider value={controller}>
          <PlayerInteractionModeProvider mobile={mobileInteraction}>
            <div
              {...containerProps}
              ref={setContainer}
              className={classNames(resolvedTheme.className, className)}
              style={themeStyle}
              data-video-player-root=""
              data-player-theme={resolvedTheme.id}
              data-player-mobile-interaction={
                mobileInteraction ? "true" : "false"
              }
              data-player-zoom-enabled={zoomEnabled}
              onClickCapture={(event) => {
                const controlLayerRequested =
                  event.target instanceof Element
                    ? event.target.closest("[data-video-player-control-layer]")
                    : null;
                const zoomResetRequested =
                  event.target instanceof Element &&
                  event.target.closest("[data-player-zoom-reset]") !== null;
                const pointerStartedWithHiddenControls =
                  controlsHiddenAtPointerDownRef.current &&
                  controlLayerRequested !== null &&
                  !zoomResetRequested &&
                  event.detail > 0;
                controlsHiddenAtPointerDownRef.current = false;
                const hiddenControlsRequested =
                  !zoomResetRequested &&
                  controlLayerRequested?.getAttribute("aria-hidden") === "true";
                if (
                  pointerStartedWithHiddenControls ||
                  hiddenControlsRequested
                ) {
                  event.preventDefault();
                  event.stopPropagation();
                  controller.setSettingsView("closed");
                  controller.setControlsVisible(true);
                  return;
                }
                if (
                  zoomEnabled &&
                  !zoomResetRequested &&
                  zoomGestures.suppressLegacyTouch()
                ) {
                  event.preventDefault();
                  event.stopPropagation();
                  return;
                }
                onClickCapture?.(event);
              }}
              onPointerCancelCapture={(event) => {
                controlsHiddenAtPointerDownRef.current = false;
                onPointerCancelCapture?.(event);
                if (zoomEnabled && zoomGestures.onPointerEnd(event)) {
                  event.stopPropagation();
                }
              }}
              onPointerDownCapture={(event) => {
                controlsHiddenAtPointerDownRef.current =
                  !controller.getSnapshot().ui.controlsVisible;
                onPointerDownCapture?.(event);
                if (
                  zoomEnabled &&
                  !event.defaultPrevented &&
                  zoomGestures.onPointerDown(event)
                ) {
                  event.stopPropagation();
                }
              }}
              onPointerMoveCapture={(event) => {
                onPointerMoveCapture?.(event);
                if (
                  zoomEnabled &&
                  !event.defaultPrevented &&
                  zoomGestures.onPointerMove(event)
                ) {
                  event.stopPropagation();
                }
              }}
              onPointerUpCapture={(event) => {
                onPointerUpCapture?.(event);
                if (zoomEnabled && zoomGestures.onPointerEnd(event)) {
                  event.stopPropagation();
                }
              }}
              onTouchCancelCapture={(event) => {
                onTouchCancelCapture?.(event);
                const handled = zoomEnabled && zoomGestures.onTouchEnd(event);
                if (
                  zoomEnabled &&
                  (handled || zoomGestures.suppressLegacyTouch())
                ) {
                  event.preventDefault();
                  event.stopPropagation();
                }
              }}
              onTouchEndCapture={(event) => {
                onTouchEndCapture?.(event);
                const handled = zoomEnabled && zoomGestures.onTouchEnd(event);
                if (
                  zoomEnabled &&
                  (handled || zoomGestures.suppressLegacyTouch())
                ) {
                  event.preventDefault();
                  event.stopPropagation();
                }
              }}
              onTouchMoveCapture={(event) => {
                onTouchMoveCapture?.(event);
                const handled =
                  zoomEnabled &&
                  !event.defaultPrevented &&
                  zoomGestures.onTouchMove(event);
                if (
                  zoomEnabled &&
                  (handled || zoomGestures.suppressLegacyTouch())
                ) {
                  event.preventDefault();
                  event.stopPropagation();
                }
              }}
              onTouchStartCapture={(event) => {
                onTouchStartCapture?.(event);
                const handled =
                  zoomEnabled &&
                  !event.defaultPrevented &&
                  zoomGestures.onTouchStart(event);
                if (
                  zoomEnabled &&
                  (handled || zoomGestures.suppressLegacyTouch())
                ) {
                  event.preventDefault();
                  event.stopPropagation();
                }
              }}
            >
              {children}
            </div>
          </PlayerInteractionModeProvider>
        </PlayerControllerContext.Provider>
      </PlayerThemeProvider>
    );
  },
);
