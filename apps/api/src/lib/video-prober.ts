import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface ProbedVideoMetadata {
  durationSeconds: number;
  sizeBytes: number;
  width: number;
  height: number;
  codec?: string;
  fps?: number;
  bitrate?: number;
}

interface FfprobeStream {
  readonly codec_type?: string;
  readonly codec_name?: string;
  readonly width?: number;
  readonly height?: number;
  readonly r_frame_rate?: string;
  readonly avg_frame_rate?: string;
  readonly duration?: string | number;
  readonly bit_rate?: string | number;
}

interface FfprobeFormat {
  readonly duration?: string | number;
  readonly size?: string | number;
  readonly bit_rate?: string | number;
}

interface FfprobeOutput {
  readonly streams?: readonly FfprobeStream[];
  readonly format?: FfprobeFormat;
}

function parseFrameRate(rateStr?: string): number | undefined {
  if (!rateStr || rateStr === "0/0") return undefined;
  const parts = rateStr.split("/");
  if (parts.length === 2) {
    const num = Number(parts[0]);
    const den = Number(parts[1]);
    if (Number.isFinite(num) && Number.isFinite(den) && den > 0) {
      return Math.round((num / den) * 100) / 100;
    }
  }
  const parsed = Number(rateStr);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

/**
 * Executes ffprobe against a presigned S3 URL, HTTP URL, or local path to extract video dimensions,
 * duration, size, and codec metadata.
 */
export async function probeVideoSource(
  videoSourceUrlOrPath: string,
  options: { ffprobePath?: string; timeoutMs?: number } = {},
): Promise<ProbedVideoMetadata | null> {
  const ffprobePath = options.ffprobePath || process.env["FFPROBE_PATH"] || "ffprobe";
  const timeout = options.timeoutMs ?? 15_000;

  const args = [
    "-v",
    "error",
    "-show_entries",
    "format=duration,size,bit_rate:stream=width,height,codec_name,codec_type,r_frame_rate,avg_frame_rate,duration,bit_rate",
    "-of",
    "json",
    videoSourceUrlOrPath,
  ];

  try {
    const { stdout } = await execFileAsync(ffprobePath, args, {
      encoding: "utf-8",
      maxBuffer: 5 * 1024 * 1024,
      timeout,
      shell: false,
    });

    const parsed: FfprobeOutput = JSON.parse(stdout.trim());
    const streams = parsed.streams ?? [];
    const format = parsed.format ?? {};

    const videoStream = streams.find(
      (s) => s.codec_type === "video" || (Boolean(s.width) && Boolean(s.height)),
    );

    const width = Number(videoStream?.width ?? 0);
    const height = Number(videoStream?.height ?? 0);
    const streamDuration = Number(videoStream?.duration ?? 0);
    const formatDuration = Number(format.duration ?? 0);
    const resolvedDuration = Math.round(
      Math.max(formatDuration, streamDuration, 0),
    );
    const sizeBytes = Number(format.size ?? 0);
    const bitrate = Number(format.bit_rate ?? videoStream?.bit_rate ?? 0);
    const fps =
      parseFrameRate(videoStream?.r_frame_rate) ??
      parseFrameRate(videoStream?.avg_frame_rate);
    const codec = videoStream?.codec_name;

    return {
      durationSeconds: resolvedDuration,
      sizeBytes,
      width,
      height,
      codec: codec || undefined,
      fps: fps || undefined,
      bitrate: bitrate > 0 ? bitrate : undefined,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[video-prober] Failed to probe video metadata: ${message}`);
    return null;
  }
}
