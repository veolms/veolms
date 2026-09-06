import { useRef, type ReactNode } from "react";
import type { VideoEngineEventMap } from "../core/events";
import {
  createInitialVideoEngineSnapshot,
  type VideoEngineSnapshot,
} from "../core/snapshot";
import { TypedEventEmitter } from "../core/typed-emitter";
import type {
  VideoAudioTrack,
  VideoEngineCapabilities,
  VideoLoadOptions,
  VideoQuality,
  VideoSource,
  VideoTextTrack,
} from "../core/types";
import type { VideoEngine } from "../core/VideoEngine";
import {
  getPlayerThemeStyle,
  resolvePlayerTheme,
  type PlayerTheme,
} from "../themes/playerThemes";
import { PlayerThemeProvider } from "../themes/PlayerThemeContext";
import { classNames } from "../utils/classNames";
import { PlayerControllerContext } from "./context";
import { PlayerController } from "./PlayerController";
import {
  PlayerInteractionModeProvider,
  useResolvedPlayerMobileInteraction,
  type PlayerInteractionMode,
} from "./PlayerInteractionMode";

/**
 * Frozen engine used to paint package controls before a real PlayerRoot
 * attaches media. It never loads, attaches, or emits playback updates.
 */
class PreviewVideoEngine implements VideoEngine {
  readonly name = "preview" as const;
  readonly #events = new TypedEventEmitter<VideoEngineEventMap>();
  readonly #snapshot: VideoEngineSnapshot;

  constructor(playback?: {
    muted?: boolean;
    playbackRate?: number;
    volume?: number;
  }) {
    this.#snapshot = {
      ...createInitialVideoEngineSnapshot(),
      lifecycle: "loading",
      muted: playback?.muted ?? false,
      playbackRate: playback?.playbackRate ?? 1,
      volume: playback?.volume ?? 1,
    };
  }

  async attach(): Promise<void> {}
  async detach(): Promise<void> {}
  async load(_source: VideoSource, _options?: VideoLoadOptions): Promise<void> {}
  async unload(): Promise<void> {}
  async destroy(): Promise<void> {
    this.#events.clear();
  }
  async play(): Promise<void> {}
  pause(): void {}
  seek(_time: number): void {}
  setVolume(_volume: number): void {}
  setMuted(_muted: boolean): void {}
  setPlaybackRate(_rate: number): void {}

  getCapabilities(): VideoEngineCapabilities {
    return {
      browserSupported: true,
      adaptiveStreaming: false,
      drm: false,
      nativeHls: false,
      pictureInPicture: false,
    };
  }

  getSnapshot(): VideoEngineSnapshot {
    return this.#snapshot;
  }

  getQualities(): readonly VideoQuality[] {
    return this.#snapshot.qualities;
  }
  selectQuality(_id: string): void {}
  enableAutoQuality(): void {}
  getAudioTracks(): readonly VideoAudioTrack[] {
    return this.#snapshot.audioTracks;
  }
  selectAudioTrack(_id: string): void {}
  getTextTracks(): readonly VideoTextTrack[] {
    return this.#snapshot.textTracks;
  }
  selectTextTrack(_id: string | null): void {}

  on<Type extends keyof VideoEngineEventMap>(
    type: Type,
    listener: (event: VideoEngineEventMap[Type]) => void,
  ): () => void {
    return this.#events.on(type, listener);
  }
}

export interface PlayerChromePreviewProps {
  children: ReactNode;
  muted?: boolean;
  playbackRate?: number;
  theme?: PlayerTheme;
  interactionMode?: PlayerInteractionMode;
  volume?: number;
}

/**
 * Hosts the same control components as PlayerRoot without mounting a video
 * element or starting a load. Used as prerender / first-paint chrome.
 */
export function PlayerChromePreview({
  children,
  interactionMode = "responsive",
  muted = false,
  playbackRate = 1,
  theme = "youtube",
  volume = 1,
}: PlayerChromePreviewProps) {
  const controllerRef = useRef<PlayerController | null>(null);
  if (!controllerRef.current) {
    controllerRef.current = new PlayerController(
      new PreviewVideoEngine({ muted, playbackRate, volume }),
    );
  }
  const controller = controllerRef.current;
  const mobileInteraction =
    useResolvedPlayerMobileInteraction(interactionMode);
  const resolvedTheme = resolvePlayerTheme(theme);

  return (
    <PlayerThemeProvider theme={resolvedTheme}>
      <PlayerControllerContext.Provider value={controller}>
        <PlayerInteractionModeProvider mobile={mobileInteraction}>
          <div
            className={classNames(resolvedTheme.className, "relative size-full")}
            style={getPlayerThemeStyle(resolvedTheme)}
            data-player-theme={resolvedTheme.id}
            data-player-mobile-interaction={
              mobileInteraction ? "true" : "false"
            }
            data-video-player-root=""
            data-video-player-chrome-preview=""
          >
            {children}
          </div>
        </PlayerInteractionModeProvider>
      </PlayerControllerContext.Provider>
    </PlayerThemeProvider>
  );
}
