import {
  framesPerSheet,
  parseSpriteStoryboardIndex,
  sheetIndexAtTime,
  spriteSheetFrames,
  type SpriteStoryboardIndex,
  type SpriteStoryboardLevel,
} from "./spriteStoryboardIndex.ts";
import {
  registerFrameProvider,
  registerSpriteSheet,
  releaseSpriteSheet,
} from "./spriteSheetStore.ts";
import { PreviewChunkCache } from "./previewChunkCache.ts";
import { PreviewVideoFrames } from "./PreviewVideoFrames.ts";
import type { StoryboardFrame } from "./storyboardTypes.ts";

export interface SpriteStoryboardLoaderOptions {
  indexUrl: string;
  /**
   * Turns a storyboard URL into the one to request (adds the playback
   * token, for one). Applied to the index and to every sheet, on every try.
   */
  prepareUrl?: (url: string) => Promise<string> | string;
  /** Called whenever the set of frames that can be shown changes. */
  onFrames: (frames: readonly StoryboardFrame[]) => void;
  onError?: (error: unknown) => void;
  /** Called once the storyboard is found to be a preview video. */
  onPreviewVideo?: () => void;
}

/** A detail sheet this close to the pointer's sheet edge brings its neighbour. */
const NEIGHBOUR_PREFETCH_SECONDS = 5;
const MAX_DETAIL_REQUESTS_IN_FLIGHT = 2;
/** Waits before the second and third try of a request. */
const RETRY_DELAYS_MS = [400, 1_500];
/** After a failed index, the next hover tries again no sooner than this. */
const INDEX_RETRY_COOLDOWN_MS = 5_000;

class HttpStatusError extends Error {
  readonly status: number;

  constructor(status: number) {
    super(`Storyboard request failed with ${status}.`);
    this.status = status;
  }
}

function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(signal.reason);
      },
      { once: true },
    );
  });
}

/**
 * Loads a two-level sprite storyboard on demand: nothing until the viewer
 * first points at the timeline, then every coarse sheet (the whole video in
 * a few small images), then single detail sheets where the viewer slows
 * down. Sheets are kept by the page (`spriteSheetStore`) and handed out only
 * once decoded, so a frame can be drawn the moment it is chosen. A request
 * that fails is tried again, and a sheet that still failed is asked for
 * again the next time the viewer points there.
 */
export class SpriteStoryboardLoader {
  readonly #options: SpriteStoryboardLoaderOptions;
  readonly #abort = new AbortController();
  #index: SpriteStoryboardIndex | null = null;
  #indexPromise: Promise<SpriteStoryboardIndex | null> | null = null;
  #indexRetryAt = 0;
  readonly #coarseFrames = new Map<number, StoryboardFrame[]>();
  readonly #coarseInFlight = new Set<number>();
  readonly #detailFrames = new Map<number, StoryboardFrame[]>();
  readonly #detailRequested = new Set<number>();
  #detailQueue: number[] = [];
  #detailInFlight = 0;
  readonly #keptSheets: string[] = [];
  // Set when the index has a preview video this browser can decode: it
  // then stands in for both sheet levels.
  #video: PreviewVideoFrames | null = null;
  #unregisterVideo: (() => void) | null = null;

  constructor(options: SpriteStoryboardLoaderOptions) {
    this.#options = options;
  }

  get destroyed(): boolean {
    return this.#abort.signal.aborted;
  }

  destroy(): void {
    this.#abort.abort();
    this.#detailQueue = [];
    for (const key of this.#keptSheets.splice(0)) releaseSpriteSheet(key);
    this.#unregisterVideo?.();
    this.#video?.destroy();
    this.#video = null;
  }

  /** Loads the index only (a few kilobytes), so a first hover is quick. */
  prepare(): Promise<SpriteStoryboardIndex | null> {
    return this.#ensureIndex();
  }

  /**
   * Loads the index and every coarse sheet not loaded yet. Cheap to call on
   * every pointer move: it only starts what is missing.
   */
  start(): Promise<SpriteStoryboardIndex | null> {
    return this.#ensureIndex().then((index) => {
      if (index && !this.#video) this.#loadMissingCoarse(index);
      return index;
    });
  }

  #ensureIndex(): Promise<SpriteStoryboardIndex | null> {
    if (this.destroyed) return Promise.resolve(null);
    if (!this.#indexPromise) {
      if (Date.now() < this.#indexRetryAt) return Promise.resolve(null);
      this.#indexPromise = this.#loadIndex().then((index) => {
        // A failed index is asked for again by a later hover.
        if (!index) this.#indexPromise = null;
        return index;
      });
    }
    return this.#indexPromise;
  }

  /**
   * With a preview video: readies the chunk the pointer is moving into.
   * Called on every pointer move; sheets need nothing of the kind.
   */
  prepareAhead(time: number, direction: 1 | -1): void {
    if (this.destroyed || !Number.isFinite(time)) return;
    this.#video?.prepareAhead(time, direction);
  }

  /** Asks for the detail sheet covering `time` (and a close neighbour). */
  requestDetail(time: number): void {
    if (this.destroyed || !Number.isFinite(time)) return;
    void this.start().then((index) => {
      if (this.#video) {
        this.#video.prepareAt(time);
        return;
      }
      const level = index?.detail;
      if (!index || !level || this.destroyed) return;
      const sheet = sheetIndexAtTime(level, time);
      const sheetSeconds = framesPerSheet(level) * level.interval;
      const intoSheet = time - sheet * sheetSeconds;
      const wanted = [sheet];
      if (intoSheet < NEIGHBOUR_PREFETCH_SECONDS && sheet > 0) {
        wanted.push(sheet - 1);
      } else if (
        sheetSeconds - intoSheet < NEIGHBOUR_PREFETCH_SECONDS &&
        sheet + 1 < level.sheets.length
      ) {
        wanted.push(sheet + 1);
      }
      // The newest request goes first: it is where the viewer is now.
      const fresh = wanted.filter((entry) => !this.#detailRequested.has(entry));
      if (fresh.length === 0) return;
      this.#detailQueue = [
        ...fresh,
        ...this.#detailQueue.filter((entry) => !fresh.includes(entry)),
      ];
      this.#pumpDetail(index, level);
    });
  }

  async #loadIndex(): Promise<SpriteStoryboardIndex | null> {
    try {
      const response = await this.#fetchWithRetry(this.#options.indexUrl);
      const index = parseSpriteStoryboardIndex(await response.json());
      if (!index) throw new Error("The storyboard index is not valid.");
      const acceleration = index.video
        ? await PreviewVideoFrames.decoderAcceleration(index.video)
        : null;
      if (acceleration) this.#useVideo(index, acceleration);
      if (this.destroyed) return null;
      this.#index = index;
      return index;
    } catch (error) {
      // No index at all (404): this video has no storyboard yet.
      this.#indexRetryAt =
        error instanceof HttpStatusError && error.status === 404
          ? Number.POSITIVE_INFINITY
          : Date.now() + INDEX_RETRY_COOLDOWN_MS;
      if (!this.destroyed) this.#options.onError?.(error);
      return null;
    }
  }

  #useVideo(
    index: SpriteStoryboardIndex,
    acceleration: HardwareAcceleration,
  ): void {
    const info = index.video;
    if (!info || this.destroyed) return;
    const url = new URL(info.file, this.#options.indexUrl).href;
    const video = new PreviewVideoFrames(
      info,
      acceleration,
      async (start, end, priority) => {
        const response = await this.#fetchWithRetry(url, {
          headers: { Range: `bytes=${start}-${end - 1}` },
          priority,
        });
        const data = new Uint8Array(await response.arrayBuffer());
        // A server that ignores the range sends the whole stream.
        return response.status === 200 ? data.subarray(start, end) : data;
      },
      PreviewChunkCache.open(url, info.gopOffsets.length),
    );
    this.#video = video;
    this.#options.onPreviewVideo?.();
    this.#unregisterVideo = registerFrameProvider(video.prefix, video);
    // Every picture can be asked for at once: each is fetched and decoded
    // when first drawn (the canvas keeps its last picture meanwhile).
    this.#options.onFrames(video.frames(index.duration));
  }

  #loadMissingCoarse(index: SpriteStoryboardIndex): void {
    index.coarse.sheets.forEach((_, sheet) => {
      if (this.#coarseFrames.has(sheet) || this.#coarseInFlight.has(sheet)) {
        return;
      }
      this.#coarseInFlight.add(sheet);
      void this.#loadSheet(index.coarse, sheet)
        .then((key) => {
          if (this.destroyed) return;
          this.#coarseFrames.set(
            sheet,
            spriteSheetFrames(
              index.coarse,
              sheet,
              key,
              index.duration,
              "sprite-coarse",
            ),
          );
          this.#publish();
        })
        .catch((error: unknown) => {
          if (!this.destroyed) this.#options.onError?.(error);
        })
        .finally(() => this.#coarseInFlight.delete(sheet));
    });
  }

  #pumpDetail(index: SpriteStoryboardIndex, level: SpriteStoryboardLevel) {
    while (
      this.#detailInFlight < MAX_DETAIL_REQUESTS_IN_FLIGHT &&
      this.#detailQueue.length > 0 &&
      !this.destroyed
    ) {
      const sheet = this.#detailQueue.shift()!;
      if (this.#detailRequested.has(sheet)) continue;
      this.#detailRequested.add(sheet);
      this.#detailInFlight += 1;
      void this.#loadSheet(level, sheet)
        .then((key) => {
          if (this.destroyed) return;
          this.#detailFrames.set(
            sheet,
            spriteSheetFrames(
              level,
              sheet,
              key,
              index.duration,
              "sprite-detail",
            ),
          );
          this.#publish();
        })
        .catch((error: unknown) => {
          // A later linger over the same part tries again.
          this.#detailRequested.delete(sheet);
          if (!this.destroyed) this.#options.onError?.(error);
        })
        .finally(() => {
          this.#detailInFlight -= 1;
          this.#pumpDetail(index, level);
        });
    }
  }

  /** Fetches, decodes and keeps one sheet; resolves with its store key. */
  async #loadSheet(
    level: SpriteStoryboardLevel,
    sheet: number,
  ): Promise<string> {
    const relative = level.sheets[sheet];
    if (!relative) throw new Error(`Storyboard sheet ${sheet} is missing.`);
    const response = await this.#fetchWithRetry(
      new URL(relative, this.#options.indexUrl).href,
    );
    const blob = await response.blob();
    // Decoded once here, so a sheet that cannot be read is never handed out.
    const bitmap = await createImageBitmap(blob);
    if (this.destroyed) {
      bitmap.close();
      throw new Error("The storyboard was closed.");
    }
    const key = registerSpriteSheet(blob, bitmap);
    this.#keptSheets.push(key);
    return key;
  }

  /**
   * GET with a fresh token on each try. A missing file (404) or a refused
   * one (401/403 after the token was renewed) is not tried again here.
   */
  async #fetchWithRetry(
    url: string,
    init: { headers?: Record<string, string>; priority?: "high" | "low" } = {},
  ): Promise<Response> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
      if (attempt > 0) {
        await wait(RETRY_DELAYS_MS[attempt - 1]!, this.#abort.signal);
      }
      try {
        const response = await fetch(await this.#prepare(url), {
          signal: this.#abort.signal,
          credentials: "omit",
          ...(init.headers ? { headers: init.headers } : {}),
          // Background fetches yield to the lesson's own segments.
          ...(init.priority ? { priority: init.priority } : {}),
        } as RequestInit);
        if (response.ok) return response;
        lastError = new HttpStatusError(response.status);
        if (response.status === 404) break;
      } catch (error) {
        if (this.destroyed) throw error;
        lastError = error;
      }
    }
    throw lastError;
  }

  async #prepare(url: string): Promise<string> {
    return (await this.#options.prepareUrl?.(url)) ?? url;
  }

  #publish(): void {
    if (this.destroyed) return;
    const coarse = [...this.#coarseFrames.values()].flat();
    const detail = [...this.#detailFrames.values()].flat();
    // Where both levels cover a moment, the detail frame starts later and
    // so wins in `getThumbnailAtTime`.
    this.#options.onFrames([...coarse, ...detail]);
  }

  /** The index, once loaded. */
  get index(): SpriteStoryboardIndex | null {
    return this.#index;
  }
}
