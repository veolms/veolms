import { z } from "zod";
import {
  VIDEO_QUALITY_LEVELS,
  videoQualityLevelSchema,
  type VideoQualityLevel,
} from "@veolms/contracts";

export { VIDEO_QUALITY_LEVELS, videoQualityLevelSchema };
export type { VideoQualityLevel };

export const VIDEO_CODECS = ["h264", "h265", "av1"] as const;
export type VideoCodec = (typeof VIDEO_CODECS)[number];
export const videoCodecSchema = z.enum(VIDEO_CODECS);

export const AUDIO_CODECS = ["aac", "opus"] as const;
export type AudioCodec = (typeof AUDIO_CODECS)[number];
export const audioCodecSchema = z.enum(AUDIO_CODECS);

export interface QualityProfile {
  name: VideoQualityLevel;
  width: number;
  height: number;
  videoBitrateKbps: number;
  maxBitrateKbps: number;
  bufferSizeKbps: number;
  audioBitrateKbps: number;
  fps: number;
  segmentDurationSeconds: number;
}

export const QUALITY_PROFILES: Readonly<
  Record<VideoQualityLevel, QualityProfile>
> = {
  "2160p": {
    name: "2160p",
    width: 3840,
    height: 2160,
    videoBitrateKbps: 14000,
    maxBitrateKbps: 16000,
    bufferSizeKbps: 28000,
    audioBitrateKbps: 192,
    fps: 60,
    segmentDurationSeconds: 6,
  },
  "1440p": {
    name: "1440p",
    width: 2560,
    height: 1440,
    videoBitrateKbps: 8000,
    maxBitrateKbps: 9500,
    bufferSizeKbps: 16000,
    audioBitrateKbps: 192,
    fps: 60,
    segmentDurationSeconds: 6,
  },
  "1080p": {
    name: "1080p",
    width: 1920,
    height: 1080,
    videoBitrateKbps: 4500,
    maxBitrateKbps: 5300,
    bufferSizeKbps: 9000,
    audioBitrateKbps: 128,
    fps: 30,
    segmentDurationSeconds: 6,
  },
  "720p": {
    name: "720p",
    width: 1280,
    height: 720,
    videoBitrateKbps: 2400,
    maxBitrateKbps: 2800,
    bufferSizeKbps: 4800,
    audioBitrateKbps: 128,
    fps: 30,
    segmentDurationSeconds: 6,
  },
  "480p": {
    name: "480p",
    width: 854,
    height: 480,
    videoBitrateKbps: 1200,
    maxBitrateKbps: 1400,
    bufferSizeKbps: 2400,
    audioBitrateKbps: 96,
    fps: 30,
    segmentDurationSeconds: 6,
  },
  "360p": {
    name: "360p",
    width: 640,
    height: 360,
    videoBitrateKbps: 800,
    maxBitrateKbps: 950,
    bufferSizeKbps: 1600,
    audioBitrateKbps: 96,
    fps: 30,
    segmentDurationSeconds: 6,
  },
  "240p": {
    name: "240p",
    width: 426,
    height: 240,
    videoBitrateKbps: 400,
    maxBitrateKbps: 500,
    bufferSizeKbps: 800,
    audioBitrateKbps: 64,
    fps: 30,
    segmentDurationSeconds: 6,
  },
  "144p": {
    name: "144p",
    width: 256,
    height: 144,
    videoBitrateKbps: 200,
    maxBitrateKbps: 250,
    bufferSizeKbps: 400,
    audioBitrateKbps: 48,
    fps: 30,
    segmentDurationSeconds: 6,
  },
};

export const DEFAULT_QUALITIES: readonly VideoQualityLevel[] = [
  "1080p",
  "720p",
  "480p",
  "360p",
] as const;

export const DEFAULT_VIDEO_QUALITIES = DEFAULT_QUALITIES;
export const VideoQualityLevelSchema = videoQualityLevelSchema;

export function isValidQualityLevel(value: string): value is VideoQualityLevel {
  return (VIDEO_QUALITY_LEVELS as readonly string[]).includes(value);
}

export function getQualityProfile(level: VideoQualityLevel): QualityProfile {
  return QUALITY_PROFILES[level];
}
