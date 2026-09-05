import {
  getQualityProfile,
  QUALITY_PROFILES,
  type VideoQualityLevel,
} from "@veolms/fleet-types";

export interface VideoMetadata {
  durationSeconds: number;
  width: number;
  height: number;
  fps?: number;
}

export interface GeneratedVariant {
  quality: VideoQualityLevel;
  relativePlaylistPath: string;
  bandwidth: number;
  width: number;
  height: number;
}

export interface FfmpegHlsBuildResult {
  args: readonly string[];
  applicableQualities: readonly VideoQualityLevel[];
  masterPlaylistContent: string;
  variants: readonly GeneratedVariant[];
}

export function filterApplicableQualities(
  requestedQualities: readonly VideoQualityLevel[],
  sourceWidth: number,
  sourceHeight: number,
): VideoQualityLevel[] {
  const sourceMinDim = Math.min(sourceWidth, sourceHeight);
  const sourceMaxDim = Math.max(sourceWidth, sourceHeight);

  const filtered = requestedQualities.filter((quality) => {
    const profile = getQualityProfile(quality);
    const profileMinDim = Math.min(profile.width, profile.height);
    const profileMaxDim = Math.max(profile.width, profile.height);
    // Allow if source dimensions are >= 90% of target resolution in both min and max orientations (supports horizontal and vertical)
    return (
      sourceMinDim >= profileMinDim * 0.9 && sourceMaxDim >= profileMaxDim * 0.9
    );
  });

  // If source is lower than all requested, fallback to the lowest requested quality
  if (filtered.length === 0 && requestedQualities.length > 0) {
    // Find the smallest requested quality
    const sorted = [...requestedQualities].sort(
      (a, b) => QUALITY_PROFILES[a].height - QUALITY_PROFILES[b].height,
    );
    const first = sorted[0];
    if (first) {
      return [first];
    }
  }

  return filtered;
}

/**
 * Video Processing V2's resolution-cap step: the largest quality tier a job
 * actually requests defines the ceiling for the intermediate compressed
 * video — no reason to carry a 4K intermediate through the pipeline when
 * the job only needs up to 720p. Reuses the same orientation-aware
 * min/max-dimension comparison filterApplicableQualities() uses, so a
 * portrait source is capped correctly rather than compared axis-for-axis
 * against a landscape profile. Returns null when the source already fits
 * within the target on both axes — never upscale.
 * @github https://github.com/thedhruvish/veolms-my-docs/blob/main/devops-and-infrastructure/compression-video-v2.md
 */
export function resolveCompressionTarget(
  sourceWidth: number,
  sourceHeight: number,
  requestedQualities: readonly VideoQualityLevel[],
): { width: number; height: number } | null {
  if (requestedQualities.length === 0) {
    return null;
  }

  const largestProfile = requestedQualities
    .map((quality) => getQualityProfile(quality))
    .reduce((largest, profile) =>
      profile.width * profile.height > largest.width * largest.height
        ? profile
        : largest,
    );

  const sourceMinDim = Math.min(sourceWidth, sourceHeight);
  const sourceMaxDim = Math.max(sourceWidth, sourceHeight);
  const profileMinDim = Math.min(largestProfile.width, largestProfile.height);
  const profileMaxDim = Math.max(largestProfile.width, largestProfile.height);

  if (sourceMinDim <= profileMinDim && sourceMaxDim <= profileMaxDim) {
    return null;
  }

  const targetMinDim = Math.min(sourceMinDim, profileMinDim);
  const targetMaxDim = Math.min(sourceMaxDim, profileMaxDim);
  const isPortrait = sourceHeight > sourceWidth;

  return isPortrait
    ? { width: targetMinDim, height: targetMaxDim }
    : { width: targetMaxDim, height: targetMinDim };
}

export interface CompressionBuildResult {
  args: readonly string[];
  targetResolution: { width: number; height: number } | null;
}

/**
 * Builds the args for Video Processing V2's compression pass: a single
 * CRF re-encode (optionally capped to resolveCompressionTarget()) that
 * runs before the existing multi-quality HLS split, producing a smaller
 * intermediate to split instead of the raw uploaded source.
 */
export function buildCompressionArgs(options: {
  inputPath: string;
  outputPath: string;
  qualities: readonly VideoQualityLevel[];
  metadata: VideoMetadata;
  crf: number;
}): CompressionBuildResult {
  const { inputPath, outputPath, qualities, metadata, crf } = options;

  const targetResolution = resolveCompressionTarget(
    metadata.width,
    metadata.height,
    qualities,
  );

  const args: string[] = ["-y", "-hide_banner", "-i", inputPath];

  if (targetResolution) {
    args.push(
      "-vf",
      `scale=w=${targetResolution.width}:h=${targetResolution.height}:force_original_aspect_ratio=decrease:force_divisible_by=2`,
    );
  }

  args.push(
    "-c:v",
    "libx264",
    "-crf",
    String(crf),
    "-preset",
    "fast",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    outputPath,
  );

  return { args, targetResolution };
}

export function generateMasterPlaylist(
  variants: readonly GeneratedVariant[],
): string {
  let content = "#EXTM3U\n#EXT-X-VERSION:3\n\n";

  for (const variant of variants) {
    content += `#EXT-X-STREAM-INF:BANDWIDTH=${variant.bandwidth},RESOLUTION=${variant.width}x${variant.height}\n`;
    content += `${variant.relativePlaylistPath}\n\n`;
  }

  return content.trimEnd() + "\n";
}

export function buildFfmpegHlsArgs(options: {
  inputPath: string;
  outputDir: string;
  qualities: readonly VideoQualityLevel[];
  metadata: VideoMetadata;
  segmentDurationSeconds?: number;
}): FfmpegHlsBuildResult {
  const { inputPath, outputDir, qualities, metadata } = options;
  const segmentDuration = options.segmentDurationSeconds ?? 6;

  const applicableQualities = filterApplicableQualities(
    [...new Set(qualities)],
    metadata.width,
    metadata.height,
  );

  const args: string[] = [
    "-y",
    "-hide_banner",
    "-i",
    inputPath,
    "-progress",
    "pipe:1",
    "-nostats",
  ];

  const variants: GeneratedVariant[] = [];

  // Align keyframes uniformly across all renditions to the real input cadence (or 30fps default)
  // so HLS segments cut at the exact same PTS timestamps across every quality level.
  const targetFps =
    typeof metadata.fps === "number" && metadata.fps > 0 ? metadata.fps : 30;
  const gopSize = Math.max(1, Math.round(targetFps * segmentDuration));

  const isPortrait = metadata.height > metadata.width;

  // Build FFmpeg multi-output HLS transcode command
  for (const quality of applicableQualities) {
    const profile = getQualityProfile(quality);
    const targetWidth = isPortrait ? profile.height : profile.width;
    const targetHeight = isPortrait ? profile.width : profile.height;
    const qualityOutputDir = `${outputDir}/${quality}`;
    const playlistPath = `${qualityOutputDir}/${quality}.m3u8`;
    const segmentPattern = `${qualityOutputDir}/segment_%03d.ts`;

    // Video options with strict GOP alignment and even dimension scaling for ABR compatibility
    args.push(
      "-map",
      "0:v:0",
      "-c:v",
      "libx264",
      "-preset",
      "fast",
      "-b:v",
      `${profile.videoBitrateKbps}k`,
      "-maxrate",
      `${profile.maxBitrateKbps}k`,
      "-bufsize",
      `${profile.bufferSizeKbps}k`,
      "-r",
      String(targetFps),
      "-g",
      String(gopSize),
      "-keyint_min",
      String(gopSize),
      "-sc_threshold",
      "0",
      "-vf",
      `scale=w=${targetWidth}:h=${targetHeight}:force_original_aspect_ratio=decrease:force_divisible_by=2,pad=${targetWidth}:${targetHeight}:(ow-iw)/2:(oh-ih)/2:black`,
    );

    // Audio options
    args.push(
      "-map",
      "0:a:0?",
      "-c:a",
      "aac",
      "-b:a",
      `${profile.audioBitrateKbps}k`,
      "-ar",
      "48000",
    );

    // HLS packaging options
    args.push(
      "-f",
      "hls",
      "-hls_time",
      String(segmentDuration),
      "-hls_playlist_type",
      "vod",
      "-hls_flags",
      "independent_segments",
      "-hls_segment_filename",
      segmentPattern,
      playlistPath,
    );

    const totalBandwidthBps =
      (profile.videoBitrateKbps + profile.audioBitrateKbps) * 1000;

    variants.push({
      quality,
      relativePlaylistPath: `${quality}/${quality}.m3u8`,
      bandwidth: totalBandwidthBps,
      width: targetWidth,
      height: targetHeight,
    });
  }

  const masterPlaylistContent = generateMasterPlaylist(variants);

  return {
    args,
    applicableQualities,
    masterPlaylistContent,
    variants,
  };
}
