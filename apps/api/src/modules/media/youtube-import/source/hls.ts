import fs from "node:fs/promises";
import path from "node:path";
import {
  DOWNLOAD_PROCESS_TIMEOUT_MS,
  runProcess,
} from "../../../../lib/media-tools/process.ts";
import {
  downloadFile,
  fetchText,
  redactUrl,
  type FetchOptions,
} from "./http.ts";

// Ported from yt-import/src/hls.js. The importer accepts only a clear,
// finished (VOD), MPEG-TS HLS ladder whose video variants are segment- and
// time-aligned: that is what YouTube's HLS formats are, and it lets a
// packager cut every quality at the same segment boundaries.

export interface HlsVariant {
  attributesLine: string;
  uri: string;
  url: string;
  bandwidth: number;
  resolution: string;
  height: number;
  codecs: string | null;
  audioGroup: string | null;
}

export interface HlsAudioTrack {
  attributesLine: string;
  groupId: string | null;
  name: string | null;
  default: boolean;
  uri: string;
  url: string;
}

export interface HlsMasterPlaylist {
  variants: HlsVariant[];
  audioTracks: HlsAudioTrack[];
}

export interface HlsSegment {
  uri: string;
  url: string;
  duration: number;
}

export interface HlsMediaPlaylist {
  lines: string[];
  targetDuration: number;
  segments: HlsSegment[];
}

function attributes(raw: string): Record<string, string> {
  const result: Record<string, string> = {};
  let current = "";
  let quoted = false;
  const parts: string[] = [];
  for (const char of raw) {
    if (char === '"') quoted = !quoted;
    if (char === "," && !quoted) {
      parts.push(current);
      current = "";
    } else current += char;
  }
  if (current) parts.push(current);
  for (const part of parts) {
    const separator = part.indexOf("=");
    if (separator === -1) continue;
    result[part.slice(0, separator).trim().toUpperCase()] = part
      .slice(separator + 1)
      .trim()
      .replace(/^"|"$/g, "");
  }
  return result;
}

function resolveUri(uri: string, baseUrl: string): string {
  if (/^[a-z]+:\/\//i.test(baseUrl)) return new URL(uri, baseUrl).toString();
  return path.resolve(path.dirname(baseUrl), uri);
}

function playlistLines(text: string): string[] {
  return text
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

export function parseMasterPlaylist(
  text: string,
  baseUrl: string,
): HlsMasterPlaylist {
  const lines = playlistLines(text);
  if (lines[0] !== "#EXTM3U")
    throw new Error("HLS master playlist is missing #EXTM3U.");
  const variants: HlsVariant[] = [];
  const audioTracks: HlsAudioTrack[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;
    if (line.startsWith("#EXT-X-MEDIA:")) {
      const attrs = attributes(line.slice("#EXT-X-MEDIA:".length));
      if (attrs.TYPE === "AUDIO" && attrs.URI) {
        audioTracks.push({
          attributesLine: line,
          groupId: attrs["GROUP-ID"] ?? null,
          name: attrs.NAME ?? null,
          default: attrs.DEFAULT === "YES",
          uri: attrs.URI,
          url: resolveUri(attrs.URI, baseUrl),
        });
      }
      continue;
    }
    if (!line.startsWith("#EXT-X-STREAM-INF:")) continue;
    const uri = lines[index + 1];
    if (!uri || uri.startsWith("#"))
      throw new Error("HLS master playlist has an invalid variant URI.");
    const attrs = attributes(line.slice("#EXT-X-STREAM-INF:".length));
    const resolution = String(attrs.RESOLUTION ?? "");
    const height = Number(resolution.split("x")[1] ?? 0);
    const bandwidth = Number(
      attrs.BANDWIDTH ?? attrs["AVERAGE-BANDWIDTH"] ?? 0,
    );
    variants.push({
      attributesLine: line,
      uri,
      url: resolveUri(uri, baseUrl),
      bandwidth: Number.isFinite(bandwidth) ? bandwidth : 0,
      resolution,
      height: Number.isInteger(height) ? height : 0,
      codecs: attrs.CODECS ?? null,
      audioGroup: attrs.AUDIO ?? null,
    });
  }
  if (!variants.length)
    throw new Error("HLS master playlist contains no video variants.");
  return { variants, audioTracks };
}

export function parseMediaPlaylist(
  text: string,
  baseUrl: string,
): HlsMediaPlaylist {
  const lines = playlistLines(text);
  if (lines[0] !== "#EXTM3U")
    throw new Error("HLS media playlist is missing #EXTM3U.");
  let targetDuration = 6;
  let pendingDuration: number | null = null;
  let hasEndList = false;
  let hasMap = false;
  let hasEncryption = false;
  const segments: HlsSegment[] = [];
  for (const line of lines) {
    if (line.startsWith("#EXT-X-TARGETDURATION:"))
      targetDuration = Number(line.slice(22)) || targetDuration;
    else if (line.startsWith("#EXTINF:"))
      pendingDuration = Number(
        line.match(/^#EXTINF:([\d.]+)/)?.[1] ?? targetDuration,
      );
    else if (line.startsWith("#EXT-X-ENDLIST")) hasEndList = true;
    else if (line.startsWith("#EXT-X-MAP:")) hasMap = true;
    else if (line.startsWith("#EXT-X-KEY:") && !line.includes("METHOD=NONE"))
      hasEncryption = true;
    else if (!line.startsWith("#")) {
      segments.push({
        uri: line,
        url: resolveUri(line, baseUrl),
        duration:
          pendingDuration !== null && Number.isFinite(pendingDuration)
            ? pendingDuration
            : targetDuration,
      });
      pendingDuration = null;
    }
  }
  if (!hasEndList)
    throw new Error(
      "Live or incomplete HLS playlists are not supported; #EXT-X-ENDLIST is required.",
    );
  if (hasMap)
    throw new Error(
      "fMP4 HLS input is not supported; a muxed MPEG-TS HLS ladder is required.",
    );
  if (hasEncryption)
    throw new Error(
      "Encrypted source HLS is not supported; source media must be clear before packaging.",
    );
  if (!segments.length)
    throw new Error("HLS media playlist contains no segments.");
  return { lines, targetDuration, segments };
}

function qualityForVariant(variant: HlsVariant): string {
  return String(variant.height || variant.resolution || "unknown").replace(
    /[^a-zA-Z0-9_-]/g,
    "_",
  );
}

function isTsUri(uri: string): boolean {
  return /\.ts(?:[?#]|$)/i.test(uri);
}

/**
 * One variant per requested height (falling back to the next lower one),
 * preferring H.264 over VP9 at the same height, then the higher bitrate.
 * Returned in ascending bandwidth order.
 */
export function selectVariants(
  master: HlsMasterPlaylist,
  requestedQualities: readonly (string | number)[],
): HlsVariant[] {
  const byHeight = new Map<number, HlsVariant & { isAvc: boolean }>();
  for (const variant of master.variants) {
    if (variant.audioGroup && !master.audioTracks.length) {
      throw new Error(
        "The HLS ladder uses a separate AUDIO group that the master playlist does not list.",
      );
    }
    if (!variant.height) continue;
    const isAvc =
      !variant.codecs || variant.codecs.toLowerCase().includes("avc");
    const current = byHeight.get(variant.height);
    if (
      !current ||
      (isAvc && !current.isAvc) ||
      (isAvc === current.isAvc && variant.bandwidth > current.bandwidth)
    ) {
      byHeight.set(variant.height, { ...variant, isAvc });
    }
  }
  const available = [...byHeight.values()].sort((a, b) => b.height - a.height);
  if (!available.length)
    throw new Error("HLS ladder has no variants with a resolution.");
  const selected: HlsVariant[] = [];
  for (const requested of requestedQualities) {
    const height = Number(String(requested).replace(/p$/i, ""));
    const candidate =
      byHeight.get(height) ?? available.find((item) => item.height < height);
    if (candidate && !selected.includes(candidate)) selected.push(candidate);
  }
  if (!selected.length) selected.push(...available.slice(0, 4));
  return selected
    .map(
      ({ isAvc: _isAvc, ...variant }: HlsVariant & { isAvc?: boolean }) =>
        variant,
    )
    .sort((a, b) => a.bandwidth - b.bandwidth);
}

async function mapConcurrent<T, R>(
  items: readonly T[],
  workerCount: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  async function run() {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      results[index] = await worker(items[index]!, index);
    }
  }
  await Promise.all(
    Array.from(
      { length: Math.min(workerCount, Math.max(items.length, 1)) },
      run,
    ),
  );
  return results;
}

function replacePlaylistSegmentLines(
  lines: readonly string[],
  localUris: readonly string[],
): string {
  const output: string[] = [];
  let segmentIndex = 0;
  for (const line of lines) {
    if (line && !line.startsWith("#")) output.push(localUris[segmentIndex++]!);
    else output.push(line);
  }
  return `${output.join("\n")}\n`;
}

function localSegmentNames(count: number): string[] {
  return Array.from(
    { length: count },
    (_, index) => `segment_${String(index + 1).padStart(6, "0")}.ts`,
  );
}

export interface DownloadHlsLadderOptions extends FetchOptions {
  manifestUrl: string;
  outputDir: string;
  qualities: readonly (string | number)[];
  workers: number;
  /** Called after every downloaded (or reused) segment. */
  onSegment?: (progress: {
    bytes: number;
    completed: number;
    total: number;
  }) => void;
}

export interface DownloadedLadder {
  qualities: string[];
  segmentCount: number;
  durationSeconds: number;
  masterPath: string;
}

/**
 * Downloads the selected variants (and a separate audio rendition, when the
 * ladder has one) into `outputDir/<quality>/segment_NNNNNN.ts`, and writes a
 * local `master.m3u8` pointing at them.
 */
export async function downloadHlsLadder(
  options: DownloadHlsLadderOptions,
): Promise<DownloadedLadder> {
  const { outputDir, workers } = options;
  const fetchOptions: FetchOptions = {
    headers: options.headers,
    timeoutMs: options.timeoutMs,
    attempts: options.attempts,
    signal: options.signal,
  };
  await fs.mkdir(outputDir, { recursive: true });
  const master = parseMasterPlaylist(
    await fetchText(options.manifestUrl, fetchOptions),
    options.manifestUrl,
  );
  const variants = selectVariants(master, options.qualities);

  const preferredAudioGroup = variants[0]?.audioGroup;
  const audioTrack =
    (preferredAudioGroup &&
      master.audioTracks.find((t) => t.groupId === preferredAudioGroup)) ||
    master.audioTracks.find((t) => t.default) ||
    master.audioTracks[0];

  // Fetch every media playlist first so progress has a real total.
  const plans: Array<{
    dir: string;
    playlistName: string;
    media: HlsMediaPlaylist;
    label: string;
  }> = [];
  for (const variant of variants) {
    const quality = qualityForVariant(variant);
    const media = parseMediaPlaylist(
      await fetchText(variant.url, fetchOptions),
      variant.url,
    );
    for (const segment of media.segments) {
      if (!isTsUri(segment.uri))
        throw new Error(
          `Variant ${quality} contains a non-TS segment: ${redactUrl(segment.url)}`,
        );
    }
    plans.push({
      dir: quality,
      playlistName: `${quality}.m3u8`,
      media,
      label: quality,
    });
  }
  const count = plans[0]!.media.segments.length;
  for (const plan of plans) {
    if (plan.media.segments.length !== count)
      throw new Error(
        `HLS variant ${plan.label} has a different segment count; aligned variants are required.`,
      );
  }
  if (audioTrack) {
    const media = parseMediaPlaylist(
      await fetchText(audioTrack.url, fetchOptions),
      audioTrack.url,
    );
    for (const segment of media.segments) {
      if (!isTsUri(segment.uri))
        throw new Error(
          `Audio track contains a non-TS segment: ${redactUrl(segment.url)}`,
        );
    }
    plans.push({
      dir: "audio",
      playlistName: "audio.m3u8",
      media,
      label: "audio",
    });
  }

  const total = plans.reduce(
    (sum, plan) => sum + plan.media.segments.length,
    0,
  );
  let completed = 0;
  for (const plan of plans) {
    const dir = path.join(outputDir, plan.dir);
    await fs.mkdir(dir, { recursive: true });
    const localUris = localSegmentNames(plan.media.segments.length);
    await mapConcurrent(
      plan.media.segments,
      workers,
      async (segment, index) => {
        const result = await downloadFile(
          segment.url,
          path.join(dir, localUris[index]!),
          fetchOptions,
        );
        completed += 1;
        options.onSegment?.({ bytes: result.bytes, completed, total });
      },
    );
    await fs.writeFile(
      path.join(dir, plan.playlistName),
      replacePlaylistSegmentLines(plan.media.lines, localUris),
      "utf8",
    );
  }

  const hasAudio = Boolean(audioTrack);
  const masterLines = [
    "#EXTM3U",
    "#EXT-X-VERSION:3",
    "#EXT-X-INDEPENDENT-SEGMENTS",
  ];
  if (hasAudio) {
    masterLines.push(
      '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="Default",DEFAULT=YES,AUTOSELECT=YES,URI="audio/audio.m3u8"',
    );
  }
  for (const [index, variant] of variants.entries()) {
    const plan = plans[index]!;
    // Subtitle and caption renditions are not downloaded, so a reference to
    // their group would point at nothing (players reject that master).
    let attrLine = variant.attributesLine.replace(
      /,(?:SUBTITLES|CLOSED-CAPTIONS)="[^"]*"/g,
      "",
    );
    if (hasAudio) {
      attrLine = /AUDIO="[^"]*"/.test(attrLine)
        ? attrLine.replace(/AUDIO="[^"]*"/, 'AUDIO="audio"')
        : `${attrLine},AUDIO="audio"`;
    }
    masterLines.push(attrLine, `${plan.dir}/${plan.playlistName}`);
  }
  const masterPath = path.join(outputDir, "master.m3u8");
  await fs.writeFile(masterPath, `${masterLines.join("\n")}\n`, "utf8");
  return {
    qualities: variants.map(qualityForVariant),
    segmentCount: count,
    durationSeconds: plans[0]!.media.segments.reduce(
      (sum, segment) => sum + segment.duration,
      0,
    ),
    masterPath,
  };
}

/**
 * Stream-copies a progressive MP4 into a single-quality TS HLS ladder
 * (no re-encode) so it can go through the same packaging path.
 */
export async function transmuxMp4ToHls(
  ffmpegPath: string,
  mp4Path: string,
  hlsDir: string,
  {
    quality = "360",
    width,
    segmentDuration = 4,
    signal,
  }: {
    quality?: string;
    width?: number | null;
    segmentDuration?: number;
    signal?: AbortSignal;
  } = {},
): Promise<void> {
  const qualityDir = path.join(hlsDir, quality);
  await fs.mkdir(qualityDir, { recursive: true });
  const result = await runProcess(
    ffmpegPath,
    [
      "-y",
      "-i",
      mp4Path,
      "-c",
      "copy",
      "-f",
      "hls",
      "-hls_time",
      String(segmentDuration),
      "-hls_list_size",
      "0",
      "-hls_playlist_type",
      "vod",
      "-hls_segment_filename",
      path.join(qualityDir, "segment_%06d.ts"),
      path.join(qualityDir, `${quality}.m3u8`),
    ],
    { timeoutMs: DOWNLOAD_PROCESS_TIMEOUT_MS, signal },
  );
  if (result.aborted) throw new Error("The import was cancelled.");
  if (result.code !== 0) {
    throw new Error(
      `ffmpeg transmux failed: ${result.stderr.trim().slice(-800)}`,
    );
  }
  const resolvedWidth =
    width && width > 0 ? width : Math.round((Number(quality) * 16) / 9);
  const masterContent = `${[
    "#EXTM3U",
    "#EXT-X-VERSION:3",
    "#EXT-X-INDEPENDENT-SEGMENTS",
    `#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=${resolvedWidth}x${quality}`,
    `${quality}/${quality}.m3u8`,
  ].join("\n")}\n`;
  await fs.writeFile(path.join(hlsDir, "master.m3u8"), masterContent, "utf8");
}

function localPathInside(
  root: string,
  candidate: string,
  label: string,
): string {
  const resolvedRoot = path.resolve(root);
  const resolvedCandidate = path.resolve(candidate);
  if (
    resolvedCandidate !== resolvedRoot &&
    !resolvedCandidate.startsWith(`${resolvedRoot}${path.sep}`)
  ) {
    throw new Error(`Unsafe local HLS ${label}: ${candidate}`);
  }
  return resolvedCandidate;
}

export interface LocalLadderVariant {
  quality: string;
  height: number;
  bandwidth: number;
  resolution: string;
  codecs: string | null;
  playlistPath: string;
  segments: Array<{ file: string; duration: number }>;
}

export interface LocalLadder {
  /** Ascending bandwidth. */
  variants: LocalLadderVariant[];
  /** A separate audio rendition; null when audio is muxed into the video. */
  audio: {
    playlistPath: string;
    segments: Array<{ file: string; duration: number }>;
  } | null;
}

/**
 * Reads a downloaded ladder back from disk, refusing any playlist or
 * segment path that escapes `hlsDir`, and checks the video variants are
 * segment- and time-aligned (within 100 ms per segment).
 */
export async function readLocalLadder(hlsDir: string): Promise<LocalLadder> {
  const root = path.resolve(hlsDir);
  const masterPath = path.join(root, "master.m3u8");
  const master = parseMasterPlaylist(
    await fs.readFile(masterPath, "utf8"),
    masterPath,
  );
  const variants: LocalLadderVariant[] = [];
  for (const variant of master.variants) {
    const playlistPath = localPathInside(root, variant.url, "playlist path");
    const playlist = parseMediaPlaylist(
      await fs.readFile(playlistPath, "utf8"),
      playlistPath,
    );
    variants.push({
      quality: String(variant.height || qualityForVariant(variant)),
      height: variant.height,
      bandwidth: variant.bandwidth,
      resolution: variant.resolution,
      codecs: variant.codecs,
      playlistPath,
      segments: playlist.segments.map((segment) => ({
        file: localPathInside(root, segment.url, "segment path"),
        duration: segment.duration,
      })),
    });
  }
  if (!variants.length) throw new Error("No local HLS variants were found.");
  variants.sort((a, b) => a.bandwidth - b.bandwidth);

  const reference = variants[0]!.segments;
  for (const variant of variants) {
    if (variant.segments.length !== reference.length)
      throw new Error("HLS variants are not segment-aligned.");
    for (let index = 0; index < reference.length; index += 1) {
      const expected = reference[index]!.duration;
      const actual = variant.segments[index]!.duration;
      if (
        !Number.isFinite(expected) ||
        !Number.isFinite(actual) ||
        Math.abs(expected - actual) > 0.1
      ) {
        throw new Error(
          `HLS variants are not time-aligned at segment ${index + 1}.`,
        );
      }
    }
  }

  let audio: LocalLadder["audio"] = null;
  const audioTrack = master.audioTracks[0];
  if (audioTrack) {
    const playlistPath = localPathInside(
      root,
      audioTrack.url,
      "audio playlist path",
    );
    const playlist = parseMediaPlaylist(
      await fs.readFile(playlistPath, "utf8"),
      playlistPath,
    );
    audio = {
      playlistPath,
      segments: playlist.segments.map((segment) => ({
        file: localPathInside(root, segment.url, "audio segment path"),
        duration: segment.duration,
      })),
    };
  }
  return { variants, audio };
}
