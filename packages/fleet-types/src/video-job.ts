import { z } from "zod";
import {
  HARDWARE_PROFILES,
  hardwareProfileSchema,
  JOB_STATUSES,
  VIDEO_JOB_STATUSES,
  videoJobStatusSchema,
  videoMetadataSchema,
  type HardwareProfile,
  type PersistedVideoMetadata,
  type VideoJobStatus,
  type VideoMetadata,
} from "@veolms/contracts";
import {
  DEFAULT_QUALITIES,
  getQualityProfile,
  videoQualityLevelSchema,
  type VideoQualityLevel,
} from "./quality.ts";

export {
  HARDWARE_PROFILES,
  hardwareProfileSchema,
  JOB_STATUSES,
  VIDEO_JOB_STATUSES,
  videoJobStatusSchema,
  videoMetadataSchema,
};
export type {
  HardwareProfile,
  VideoJobStatus,
  VideoMetadata,
  PersistedVideoMetadata,
};

// Aliases for backwards compatibility with existing imports
export const MACHINE_PROFILES = HARDWARE_PROFILES;
export type MachineProfile = HardwareProfile;

// The codec/segment settings a job used to be able to override per-row were
// never actually set by the real inserter (the backend API only ever writes
// video_key/output_prefix/qualities/video_size) — so they're fixed defaults
// here instead of DB-backed fields nothing ever populated.
export const DEFAULT_VIDEO_CODEC = "h264";
export const DEFAULT_AUDIO_CODEC = "aac";
export const DEFAULT_SEGMENT_DURATION_SECONDS = 6;

export interface JobHardwareRequirements {
  minCpu: number;
  minMemoryMb: number;
  architecture: "arm64" | "x86_64";
  storageGb: number;
  estimatedDurationSeconds: number;
  /** Informational only — logs/dashboards. Not used by any sizing logic. */
  profile: HardwareProfile;
}

const BASE_HARDWARE = {
  architecture: "arm64" as const,
  estimatedDurationSeconds: 600,
};

// minCpu/minMemoryMb/storageGb per tier. micro/small/medium are exact
// renames of the values this module used before named tiers existed — the
// qualities-only fallback path below reproduces the old baseline/1440p/
// 2160p buckets bit-for-bit. nano and large are new tiers only reachable
// when probed source metadata confirms a source is unusually simple or
// unusually demanding.
const PROFILE_HARDWARE: Record<
  HardwareProfile,
  { minCpu: number; minMemoryMb: number; storageGb: number }
> = {
  nano: { minCpu: 1, minMemoryMb: 2048, storageGb: 20 },
  micro: { minCpu: 2, minMemoryMb: 4096, storageGb: 30 },
  small: { minCpu: 4, minMemoryMb: 8192, storageGb: 50 },
  medium: { minCpu: 8, minMemoryMb: 16384, storageGb: 80 },
  large: { minCpu: 16, minMemoryMb: 32768, storageGb: 130 },
};

// Codecs that cost materially more CPU to software-decode than H.264 —
// this pipeline always decodes the source once (directly, or via the
// resolution-cap compression pass in media-worker) before re-encoding, so
// a heavier source codec bumps the tier even when the output qualities
// alone wouldn't suggest it.
const HEAVY_DECODE_CODECS = new Set(["hevc", "h265", "av1", "vp9"]);

const BYTES_PER_GB = 1024 ** 3;
const SAFETY_MARGIN_GB = 10;

function qualitiesBaselineIndex(
  qualities: readonly VideoQualityLevel[],
): number {
  if (qualities.includes("2160p")) return 3; // MEDIUM
  if (qualities.includes("1440p") || qualities.length >= 5) return 2; // SMALL
  return 1; // MICRO
}

function resolutionFloorIndex(width?: number, height?: number): number {
  const maxDim = Math.max(width ?? 0, height ?? 0);
  if (maxDim >= 7680) return 4; // 8K source
  if (maxDim >= 3840) return 3; // 4K source
  if (maxDim >= 2560) return 2; // 1440p+ source
  return 0;
}

function fpsBump(fps?: number): number {
  if (!fps) return 0;
  if (fps >= 100) return 2; // 120fps-class sources
  if (fps >= 48) return 1; // 50/60fps sources
  return 0;
}

function codecBump(codec?: string): number {
  if (!codec) return 0;
  return HEAVY_DECODE_CODECS.has(codec.toLowerCase()) ? 1 : 0;
}

/**
 * Resolves the named machine-sizing tier for a job.
 *
 * Without probed source metadata, this returns exactly the tier the old
 * qualities-only heuristic implied (MICRO, SMALL, or MEDIUM) — this is the
 * fallback path for direct triggers that bypass the probe Lambda, or for
 * jobs where probing failed. It must never regress below that heuristic.
 *
 * With metadata, the source's real resolution/fps/codec can raise the tier
 * above what the requested qualities alone imply (e.g. a 4K/60fps/HEVC
 * source still costs more to decode even when only a 480p output is
 * requested), or — only when metadata *confirms* the source is small and
 * simple — step a low-quality-count job down to NANO. Qualities alone
 * never imply NANO; that would be guessing without a probe.
 */
export function resolveMachineProfile(
  qualities: readonly VideoQualityLevel[],
  videoMetadata?: PersistedVideoMetadata | null,
): MachineProfile {
  const baselineIndex = qualitiesBaselineIndex(qualities);

  if (!videoMetadata) {
    return MACHINE_PROFILES[baselineIndex]!;
  }

  const floorIndex = resolutionFloorIndex(
    videoMetadata.width,
    videoMetadata.height,
  );

  let adjustedBaseline = baselineIndex;
  if (
    baselineIndex === 1 &&
    qualities.length <= 2 &&
    videoMetadata.width &&
    videoMetadata.height &&
    Math.max(videoMetadata.width, videoMetadata.height) <= 854
  ) {
    adjustedBaseline = 0; // NANO
  }

  const rawIndex =
    Math.max(adjustedBaseline, floorIndex) +
    fpsBump(videoMetadata.fps) +
    codecBump(videoMetadata.codec);

  const clampedIndex = Math.min(
    MACHINE_PROFILES.length - 1,
    Math.max(0, rawIndex),
  );

  return MACHINE_PROFILES[clampedIndex]!;
}

/**
 * Derives how much hardware a job needs from video size, requested
 * qualities, and (when available) probed source metadata:
 * - CPU/Memory/storage floor: resolved from the job's machine profile tier
 *   (see resolveMachineProfile()).
 * - Storage: Estimated using:
 *     (video duration x total output bitrate) + source size + safety margin
 * - Duration: explicit `durationSeconds`, else `videoMetadata.durationSeconds`,
 *   else estimated from source size.
 */
export function estimateJobHardware(
  videoSizeBytes: number,
  qualities: readonly VideoQualityLevel[],
  options?:
    | {
        durationSeconds?: number;
        videoMetadata?: PersistedVideoMetadata | null;
      }
    | number,
): JobHardwareRequirements {
  const opts = typeof options === "object" ? options : undefined;
  const architecture = BASE_HARDWARE.architecture;

  const profile = resolveMachineProfile(qualities, opts?.videoMetadata);
  const {
    minCpu,
    minMemoryMb,
    storageGb: profileStorageFloor,
  } = PROFILE_HARDWARE[profile];

  const explicitDuration =
    typeof options === "number"
      ? options
      : typeof opts?.durationSeconds === "number"
        ? opts.durationSeconds
        : typeof opts?.videoMetadata?.durationSeconds === "number"
          ? opts.videoMetadata.durationSeconds
          : undefined;

  // 1. Calculate total output bitrate across all requested quality renditions (bits/sec)
  const totalBitrateBps = qualities.reduce((sum, q) => {
    const qualityProfile = getQualityProfile(q);
    if (!qualityProfile) return sum;
    return (
      sum +
      (qualityProfile.videoBitrateKbps + qualityProfile.audioBitrateKbps) * 1000
    );
  }, 0);
  const totalOutputBytesPerSec = totalBitrateBps / 8;

  // 2. Video duration (use explicit duration if provided, otherwise estimate from size)
  // Default estimate assumes ~5 Mbps average source bitrate if duration is not known
  const estimatedDurationSeconds =
    typeof explicitDuration === "number" && explicitDuration > 0
      ? explicitDuration
      : Math.max(
          BASE_HARDWARE.estimatedDurationSeconds,
          videoSizeBytes > 0
            ? Math.ceil(videoSizeBytes / ((5 * 1000 * 1000) / 8))
            : BASE_HARDWARE.estimatedDurationSeconds,
        );

  // 3. Storage formula: (video duration x total output bitrate) + source size + safety margin
  const sourceSizeGb = Math.max(videoSizeBytes, 0) / BYTES_PER_GB;
  const estimatedOutputGb =
    (estimatedDurationSeconds * totalOutputBytesPerSec) / BYTES_PER_GB;
  const calculatedStorageGb = Math.ceil(
    sourceSizeGb + estimatedOutputGb + SAFETY_MARGIN_GB,
  );

  const storageGb = Math.max(profileStorageFloor, calculatedStorageGb);

  return {
    minCpu,
    minMemoryMb,
    architecture,
    storageGb,
    estimatedDurationSeconds,
    profile,
  };
}

export interface JobHardwareFields {
  video_size: number;
  qualities: readonly VideoQualityLevel[];
  video_metadata?: PersistedVideoMetadata | Record<string, unknown> | null;
}

/**
 * estimateJobHardware(), reading its inputs off a job row shape instead of
 * three positional arguments. It's a pure function of video_size/qualities/
 * video_metadata, so the fleet manager (sizing the EC2 worker at
 * provisioning time) and the media worker (re-checking its own capacity at
 * claim time) both calling this against the *same persisted row* always
 * agree — nothing needs to be pre-computed or cached to keep them in sync.
 */
export function resolveJobHardware(
  job: JobHardwareFields,
): JobHardwareRequirements {
  return estimateJobHardware(job.video_size, job.qualities, {
    videoMetadata: (job.video_metadata ?? undefined) as
      PersistedVideoMetadata | undefined,
  });
}

export const qualitiesArraySchema = z
  .array(videoQualityLevelSchema)
  .min(1)
  .default([...DEFAULT_QUALITIES]);
