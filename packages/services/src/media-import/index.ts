/**
 * How an imported video (today: "Import from YouTube") is turned into what
 * the player streams. Core downloads a clear MPEG-TS HLS ladder; a packager
 * turns that folder into the output folder that is uploaded as is to
 * `<visibility>/transcoded/<mediaId>/`.
 *
 * Core's default packager publishes the clear HLS ladder, remuxed to
 * fragmented MP4. A plugin (the
 * cloud DRM plugin) replaces it with `services.mediaImport.setPackager()`,
 * for example to write CENC-encrypted DASH. The worker reads the packager
 * when each job is packaged, so a plugin registered after the background
 * jobs started still applies.
 */

export interface MediaImportSegment {
  /** Absolute path of the downloaded MPEG-TS segment. */
  file: string;
  /** Seconds, from the source playlist's #EXTINF. */
  duration: number;
}

export interface MediaImportVariant {
  /** Folder/label of the quality, e.g. "720". */
  quality: string;
  height: number;
  bandwidth: number;
  resolution: string;
  codecs: string | null;
  segments: readonly MediaImportSegment[];
}

export interface MediaImportLadder {
  /**
   * Ascending bandwidth. Every variant has the same number of segments, with
   * the same durations (within 100 ms): they can be cut at the same points.
   */
  variants: readonly MediaImportVariant[];
  /** A separate audio rendition; null when audio is muxed into the video. */
  audio: { segments: readonly MediaImportSegment[] } | null;
}

export interface MediaImportPackageInput {
  mediaId: string;
  /** The downloaded clear HLS ladder (has a `master.m3u8`). */
  hlsDir: string;
  ladder: MediaImportLadder;
  /** An empty folder; everything written here is uploaded. */
  workDir: string;
  /**
   * The ffmpeg binary, found (or downloaded) on first call. A packager that
   * does not need ffmpeg never pays for it.
   */
  resolveFfmpeg: () => Promise<string>;
  signal: AbortSignal;
  /** `fraction` is 0..1 of the packaging step; `detail` is shown to the author. */
  onProgress: (fraction: number, detail: string) => void;
  log: (message: string) => void;
}

export interface MediaImportPackageResult {
  /** The player's entry point, relative to `workDir` (e.g. "manifest.mpd"). */
  manifestPath: string;
  qualities: readonly string[];
  durationSeconds: number;
}

export interface MediaImportPackager {
  /** Shown in logs, e.g. "clear-hls" or "cenc-dash". */
  name: string;
  /**
   * Writes the playable output into `input.workDir`. Called again for a
   * retry, with an emptied workDir: anything a packager keeps outside the
   * folder (encryption keys) must be replaced, not added to.
   */
  package(input: MediaImportPackageInput): Promise<MediaImportPackageResult>;
  /**
   * The import was cancelled, failed for good, or its media was deleted:
   * remove anything kept outside the output folder. Optional.
   */
  discard?(mediaId: string): Promise<void>;
}

export interface MediaImportRegistry {
  /** The plugin-provided packager, or null for core's default. */
  getPackager(): MediaImportPackager | null;
  setPackager(packager: MediaImportPackager): void;
}

export function createMediaImportRegistry(): MediaImportRegistry {
  let packager: MediaImportPackager | null = null;
  return {
    getPackager: () => packager,
    setPackager: (next) => {
      packager = next;
    },
  };
}
