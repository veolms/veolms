import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { GetObjectCommand, type S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { VideoMetadata } from "@veolms/contracts";

const execFileAsync = promisify(execFile);

export interface ProbeOptions {
  readonly ffprobePath?: string;
  readonly timeoutMs?: number;
  readonly maxBufferBytes?: number;
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
  readonly pix_fmt?: string;
  readonly bits_per_raw_sample?: string | number;
  readonly [key: string]: unknown;
}

interface FfprobeFormat {
  readonly format_name?: string;
  readonly duration?: string | number;
  readonly size?: string | number;
  readonly bit_rate?: string | number;
  readonly [key: string]: unknown;
}

interface FfprobeOutput {
  readonly streams?: readonly FfprobeStream[];
  readonly format?: FfprobeFormat;
}

/**
 * Resolves an S3 key to a presigned GET URL so that ffprobe can stream video
 * headers directly from S3 without downloading the entire file.
 */
export async function resolveS3VideoUrl(
  s3: S3Client,
  bucket: string,
  key: string,
  expiresInSeconds = 900,
): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: key,
  });
  return await getSignedUrl(s3, command, { expiresIn: expiresInSeconds });
}

/**
 * Executes ffprobe against a local file path or remote HTTP/S3 URL and parses
 * the structured video stream and format metadata.
 */
export async function probeVideoMetadata(
  videoSourceUrlOrPath: string,
  options: ProbeOptions = {},
): Promise<VideoMetadata> {
  const ffprobePath =
    options.ffprobePath ??
    process.env["FFPROBE_PATH"] ??
    (process.env["AWS_LAMBDA_FUNCTION_NAME"] ? "/opt/bin/ffprobe" : "ffprobe");

  const timeout = options.timeoutMs ?? 30_000;
  const maxBuffer = options.maxBufferBytes ?? 10 * 1024 * 1024;

  const args = [
    "-v",
    "error",
    "-show_entries",
    "format=duration,size,bit_rate,format_name:stream=width,height,codec_name,codec_type,r_frame_rate,avg_frame_rate,duration,bit_rate,pix_fmt,bits_per_raw_sample",
    "-of",
    "json",
    videoSourceUrlOrPath,
  ];

  try {
    const { stdout } = await execFileAsync(ffprobePath, args, {
      encoding: "utf-8",
      maxBuffer,
      timeout,
    });

    const parsed: FfprobeOutput = JSON.parse(stdout.trim());
    const streams = parsed.streams ?? [];
    const format = parsed.format ?? {};

    const videoStream = streams.find(
      (s) => s.codec_type === "video" || (s.width && s.height),
    );

    let fps: number | undefined;
    const frameRateStr =
      videoStream?.r_frame_rate || videoStream?.avg_frame_rate;
    if (frameRateStr && frameRateStr !== "0/0") {
      const [numStr, denStr] = frameRateStr.split("/");
      const num = Number(numStr);
      const den = Number(denStr);
      if (!Number.isNaN(num) && !Number.isNaN(den) && den > 0) {
        fps = Math.round((num / den) * 100) / 100;
      }
    }

    const durationSeconds =
      format.duration !== undefined
        ? Number(format.duration)
        : videoStream?.duration !== undefined
          ? Number(videoStream.duration)
          : undefined;

    const bitrate =
      format.bit_rate !== undefined
        ? Number(format.bit_rate)
        : videoStream?.bit_rate !== undefined
          ? Number(videoStream.bit_rate)
          : undefined;

    return {
      durationSeconds:
        durationSeconds && !Number.isNaN(durationSeconds) && durationSeconds > 0
          ? durationSeconds
          : undefined,
      width:
        videoStream?.width && videoStream.width > 0
          ? videoStream.width
          : undefined,
      height:
        videoStream?.height && videoStream.height > 0
          ? videoStream.height
          : undefined,
      bitrate:
        bitrate && !Number.isNaN(bitrate) && bitrate > 0 ? bitrate : undefined,
      format: format.format_name,
      codec: videoStream?.codec_name,
      fps,
      pixelFormat: videoStream?.pix_fmt,
      bitDepth:
        videoStream?.bits_per_raw_sample !== undefined
          ? Number(videoStream.bits_per_raw_sample) || undefined
          : undefined,
      rawStreams: streams as Record<string, unknown>[],
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`ffprobe failed for "${videoSourceUrlOrPath}": ${message}`);
  }
}
