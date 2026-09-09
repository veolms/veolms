import { VideoEngineError, normalizeUnknownError } from "../../core/errors";
import type {
  ExternalTextTrack,
  VideoLoadOptions,
  VideoSource,
} from "../../core/types";
import { MediaElementEngineBase } from "../base/MediaElementEngineBase";

function isElement(value: unknown): value is Element {
  return typeof Element !== "undefined" && value instanceof Element;
}

export class NativeVideoEngine extends MediaElementEngineBase {
  readonly name = "native";
  readonly #managedTracks = new Set<HTMLTrackElement>();

  async load(source: VideoSource, options: VideoLoadOptions = {}): Promise<void> {
    const media = this.requireMedia();
    if (source.drm) {
      throw new VideoEngineError({
        category: "UNSUPPORTED",
        code: "NATIVE_DRM_UNSUPPORTED",
        message: "Use a DRM-capable engine for protected media.",
      });
    }

    const generation = this.beginOperation();
    this.startLoading(source);
    this.removeManagedTracks();
    this.addTextTracks(media, source.textTracks ?? []);

    try {
      media.src = source.src;
      const ready = this.waitForMetadata(media);
      media.load();
      await ready;

      if (!this.isCurrentOperation(generation)) {
        return;
      }

      const startTime = options.startTime ?? source.startTime;
      if (startTime !== undefined && Number.isFinite(startTime) && startTime >= 0) {
        this.seek(startTime);
      }

      this.refreshNativeTextTracks();
      this.finishLoading(source);
    } catch (error) {
      if (!this.isCurrentOperation(generation)) {
        return;
      }

      const existing = this.getSnapshot().error;
      const normalized =
        existing ??
        normalizeUnknownError(error, {
          category: "SOURCE",
          code: "NATIVE_LOAD_FAILED",
        });
      if (!existing) this.emitError(normalized);
      throw normalized;
    }
  }

  async unload(): Promise<void> {
    const media = this.requireMedia();
    this.beginOperation();
    this.updateSnapshot({ lifecycle: "unloading" });
    this.releaseMedia(media);
    this.finishUnloading();
  }

  protected override async onDetaching(media: HTMLMediaElement): Promise<void> {
    this.releaseMedia(media);
  }

  protected override async onDestroying(
    media: HTMLMediaElement | null,
  ): Promise<void> {
    if (media) {
      this.releaseMedia(media);
    }
  }

  private waitForMetadata(media: HTMLMediaElement): Promise<void> {
    if (media.readyState >= 1) {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      const cleanup = (): void => {
        media.removeEventListener("loadedmetadata", onLoadedMetadata);
        media.removeEventListener("error", onError);
        media.removeEventListener("abort", onAbort);
      };
      const onLoadedMetadata = (): void => {
        cleanup();
        resolve();
      };
      const onError = (): void => {
        cleanup();
        reject(media.error ?? new Error("The browser failed to load the media."));
      };
      const onAbort = (): void => {
        cleanup();
        reject(
          new VideoEngineError({
            category: "ABORTED",
            code: "NATIVE_LOAD_ABORTED",
            message: "Media loading was aborted.",
            fatal: false,
            recoverable: true,
          }),
        );
      };

      media.addEventListener("loadedmetadata", onLoadedMetadata, { once: true });
      media.addEventListener("error", onError, { once: true });
      media.addEventListener("abort", onAbort, { once: true });
    });
  }

  private addTextTracks(
    media: HTMLMediaElement,
    tracks: readonly ExternalTextTrack[],
  ): void {
    if (!isElement(media)) {
      return;
    }

    for (const track of tracks) {
      const element = document.createElement("track");
      element.dataset.veolmsEngineTrack = "true";
      element.src = track.src;
      element.srclang = track.language;
      element.label = track.label ?? track.language;
      element.kind = track.kind ?? "subtitles";
      media.append(element);
      this.#managedTracks.add(element);
    }
  }

  private removeManagedTracks(): void {
    for (const track of this.#managedTracks) {
      track.remove();
    }
    this.#managedTracks.clear();
  }

  private releaseMedia(media: HTMLMediaElement): void {
    media.pause();
    this.removeManagedTracks();
    media.removeAttribute("src");
    media.load();
  }
}
