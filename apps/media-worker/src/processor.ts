import { randomUUID } from "node:crypto";
import { execFile, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { copyFile, cp, mkdir, rm, stat, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import { promisify } from "node:util";
import type { Kysely } from "kysely";
import type { Database } from "@veolms/database";
import {
  ARCHITECTURES,
  DEFAULT_SEGMENT_DURATION_SECONDS,
  resolveJobHardware,
  type JobHardwareRequirements,
  type VideoQualityLevel,
} from "@veolms/fleet-types";
import {
  buildCompressionArgs,
  buildFfmpegHlsArgs,
  type VideoMetadata,
} from "./ffmpeg-builder.ts";
import { FfmpegProgressParser } from "./progress.ts";
import { sampleResourceUsage } from "./resource-monitor.ts";
import { S3StorageService } from "@veolms/storage";
import { downloadHttpFile } from "./http-download.ts";
import {
  startIncrementalHlsUpload,
  type IncrementalUploadHandle,
} from "./incremental-upload.ts";
import type { MediaWorkerConfig } from "@veolms/config";
import { getRequestedTestFault, type MediaWorkerContext } from "./worker.ts";

const execFileAsync = promisify(execFile);
const FFMPEG_STDERR_TAIL_BYTES = 16 * 1024;

function appendOutputTail(current: string, chunk: Buffer): string {
  const combined = current + chunk.toString();
  return combined.length > FFMPEG_STDERR_TAIL_BYTES
    ? combined.slice(-FFMPEG_STDERR_TAIL_BYTES)
    : combined;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new Error("Media processing was cancelled");
  }
}

// Generic "keep this path inside root" primitive. Doubles as a security
// boundary for untrusted job-supplied keys (job.video_key) and as a plain
// path-joiner for internally-derived paths (job.output_prefix) — both
// cases share the same invariant (never escape root), so one helper covers
// both call sites rather than duplicating the traversal check.
function resolveWithin(root: string, candidate: string): string {
  if (isAbsolute(candidate)) {
    throw new Error("Absolute local paths are not allowed in media job keys");
  }

  const resolvedRoot = resolve(root);
  const resolvedPath = resolve(resolvedRoot, candidate);
  const pathFromRoot = relative(resolvedRoot, resolvedPath);
  if (
    pathFromRoot === ".." ||
    pathFromRoot.startsWith("../") ||
    pathFromRoot.startsWith("..\\")
  ) {
    throw new Error(
      "Media job path must remain inside its configured directory",
    );
  }
  return resolvedPath;
}

/**
 * Returns the portable storage key for the HLS master playlist.  Database
 * paths are storage keys (not absolute scratch/container paths), so the same
 * value works for both local `s3-bucket/` storage and S3.
 */
export function buildMasterPlaylistStorageKey(outputPrefix: string): string {
  const prefix = outputPrefix.replace(/^\/+|\/+$/g, "");
  return prefix ? `${prefix}/master.m3u8` : "master.m3u8";
}

async function persistVideoOutput(
  database: Kysely<Database>,
  videoId: string,
  masterPlaylistPath: string,
): Promise<void> {
  const existing = await database
    .selectFrom("video_outputs")
    .select(["id"])
    .where("video_id", "=", videoId)
    .orderBy("created_at", "desc")
    .executeTakeFirst();

  if (existing) {
    await database
      .updateTable("video_outputs")
      .set({ master_playlist_path: masterPlaylistPath })
      .where("id", "=", existing.id)
      .execute();
    return;
  }

  await database
    .insertInto("video_outputs")
    .values({
      id: randomUUID(),
      video_id: videoId,
      master_playlist_path: masterPlaylistPath,
      created_at: new Date(),
    })
    .execute();
}

async function runFfmpeg(options: {
  executable: string;
  args: readonly string[];
  phase: string;
  signal?: AbortSignal;
  onStdout?: (data: Buffer) => void;
}): Promise<void> {
  const { executable, args, phase, signal, onStdout } = options;
  throwIfAborted(signal);

  await new Promise<void>((resolve, reject) => {
    const child = spawn(executable, args, {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let settled = false;
    let stderrOutput = "";
    let forceKillTimer: ReturnType<typeof setTimeout> | undefined;

    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener("abort", abortChild);
      if (forceKillTimer) clearTimeout(forceKillTimer);
      if (error) reject(error);
      else resolve();
    };

    const abortChild = () => {
      child.kill("SIGTERM");
      forceKillTimer = setTimeout(() => child.kill("SIGKILL"), 10_000);
      forceKillTimer.unref();
    };

    signal?.addEventListener("abort", abortChild, { once: true });
    child.stdout?.on("data", (data: Buffer) => onStdout?.(data));
    child.stderr?.on("data", (data: Buffer) => {
      stderrOutput = appendOutputTail(stderrOutput, data);
    });
    child.once("error", (error) => finish(error));
    child.once("close", (code, closeSignal) => {
      if (signal?.aborted) {
        finish(new Error(`FFmpeg ${phase} was cancelled`));
      } else if (code === 0) {
        finish();
      } else {
        finish(
          new Error(
            `FFmpeg ${phase} exited with code ${code ?? "null"}${closeSignal ? ` (${closeSignal})` : ""}: ${stderrOutput.slice(-500)}`,
          ),
        );
      }
    });
  });
}

export function extractVideoExtension(videoKey: string): string {
  const withoutQuery = videoKey.split(/[?#]/)[0] ?? videoKey;
  const match = /\.([a-zA-Z0-9]{1,5})$/.exec(withoutQuery);
  return match?.[1]?.toLowerCase() ?? "mp4";
}

/**
 * Backs off upload parallelism under real system pressure (FFmpeg, not
 * this Node process, is what actually drives CPU/memory usage here) —
 * UPLOAD_MAX_CONCURRENCY normally, dropping to UPLOAD_MIN_CONCURRENCY once
 * either CPU or memory crosses its configured throttle threshold.
 */
async function resolveUploadConcurrency(
  config: MediaWorkerConfig,
): Promise<number> {
  const { cpuPercent, memoryPercent } = await sampleResourceUsage();
  const throttled =
    cpuPercent >= config.UPLOAD_THROTTLE_CPU_PERCENT ||
    memoryPercent >= config.UPLOAD_THROTTLE_MEMORY_PERCENT;
  return throttled
    ? config.UPLOAD_MIN_CONCURRENCY
    : config.UPLOAD_MAX_CONCURRENCY;
}

export async function probeVideoMetadata(
  videoPath: string,
  ffprobePath = "ffprobe",
): Promise<VideoMetadata> {
  try {
    const { stdout } = await execFileAsync(ffprobePath, [
      "-v",
      "error",
      "-show_entries",
      "format=duration:stream=width,height,r_frame_rate",
      "-of",
      "json",
      videoPath,
    ]);

    const parsed = JSON.parse(stdout) as {
      format?: { duration?: string };
      streams?: Array<{
        width?: number;
        height?: number;
        r_frame_rate?: string;
      }>;
    };

    const durationSeconds = Number(parsed.format?.duration);
    const videoStream = parsed.streams?.find(
      (s) => typeof s.width === "number" && typeof s.height === "number",
    );
    const width = videoStream?.width;
    const height = videoStream?.height;

    if (
      typeof width !== "number" ||
      typeof height !== "number" ||
      !Number.isFinite(durationSeconds) ||
      durationSeconds <= 0
    ) {
      throw new Error(
        "ffprobe did not return usable video dimensions and duration",
      );
    }

    const fpsParts = (videoStream?.r_frame_rate ?? "").split("/", 2);
    const fpsNumerator = Number(fpsParts[0]);
    const fpsDenominator = Number(fpsParts[1]);
    const fps =
      Number.isFinite(fpsNumerator) &&
      Number.isFinite(fpsDenominator) &&
      fpsNumerator > 0 &&
      fpsDenominator > 0
        ? fpsNumerator / fpsDenominator
        : undefined;

    return {
      durationSeconds,
      width,
      height,
      fps,
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Unable to probe input video ${videoPath}: ${detail}`);
  }
}

export async function executeTranscodeJob(
  ctx: MediaWorkerContext,
  jobId: string,
  signal?: AbortSignal,
): Promise<void> {
  const { db, config, workerId, recordEvent } = ctx;

  // 1. Fetch Job from DB
  const job = await db
    .selectFrom("video_jobs")
    .selectAll()
    .where("id", "=", jobId)
    .executeTakeFirst();

  if (!job) {
    throw new Error(`Job ${jobId} not found in database`);
  }

  let hardware: JobHardwareRequirements | null = null;
  const jobScratchDir = join(config.SCRATCH_DIR, jobId);
  const inputVideoPath = join(
    jobScratchDir,
    `originalvideo.${extractVideoExtension(job.video_key)}`,
  );
  const outputHlsDir = join(jobScratchDir, "hls");
  let uploadHandle: IncrementalUploadHandle | null = null;
  let progressWrite: Promise<void> = Promise.resolve();
  let ownsJob = false;

  try {
    throwIfAborted(signal);

    if ((await getRequestedTestFault(ctx)) === "worker-failure") {
      throw new Error("Test fault: worker-failure");
    }

    if (
      job.status !== "processing" &&
      job.status !== "provisioning" &&
      job.status !== "queued"
    ) {
      throw new Error(`Job ${jobId} is ${job.status}, not runnable`);
    }
    if (job.worker_id && job.worker_id !== workerId) {
      throw new Error(`Job ${jobId} is assigned to another worker`);
    }

    // Same pure function of (video_size, qualities, video_metadata) the
    // fleet manager used to size this worker at provisioning time, reading
    // the same persisted row — so this re-check can never disagree with
    // provisioning-time sizing.
    hardware = resolveJobHardware(job);
    const claimHardware = hardware;

    await db.transaction().execute(async (trx) => {
      const worker = await trx
        .selectFrom("workers")
        .select(["cpu", "memory_mb", "storage_gb", "architecture"])
        .where("id", "=", workerId)
        .forUpdate()
        .executeTakeFirst();

      if (!worker) {
        throw new Error(`Worker ${workerId} not found`);
      }

      if (
        claimHardware.minCpu > worker.cpu ||
        claimHardware.minMemoryMb > worker.memory_mb ||
        claimHardware.storageGb > worker.storage_gb ||
        !ARCHITECTURES.includes(worker.architecture)
      ) {
        throw new Error(
          `Job ${jobId} requires ${claimHardware.minCpu} vCPU / ${claimHardware.minMemoryMb}MB / ${claimHardware.storageGb}GB / (ARM64|X86_64), which worker ${workerId} (${worker.cpu} vCPU / ${worker.memory_mb}MB / ${worker.storage_gb}GB / ${worker.architecture}) does not meet`,
        );
      }

      const claimResult = await trx
        .updateTable("video_jobs")
        .set({
          status: "provisioning",
          worker_id: workerId,
          started_at: job.started_at ?? new Date(),
          updated_at: new Date(),
        })
        .where("id", "=", jobId)
        .where((eb) =>
          eb.or([eb("worker_id", "is", null), eb("worker_id", "=", workerId)]),
        )
        .executeTakeFirst();

      if (claimResult.numUpdatedRows !== 1n) {
        throw new Error(`Job ${jobId} could not be claimed by this worker`);
      }

      await trx
        .updateTable("workers")
        .set({
          status: "processing",
          job_id: jobId,
          updated_at: new Date(),
        })
        .where("id", "=", workerId)
        .execute();
    });
    ownsJob = true;

    await db
      .updateTable("worker_monitoring")
      .set({
        estimated_duration_sec: hardware.estimatedDurationSeconds,
        progress_percent: 0,
        last_progress_at: null,
        monitoring_attempts: 0,
        next_check_at: new Date(),
        updated_at: new Date(),
      })
      .where("worker_id", "=", workerId)
      .execute();

    const storage = new S3StorageService({
      bucket: config.S3_BUCKET,
      region: config.S3_REGION,
      endpoint: config.S3_ENDPOINT,
      forcePathStyle: config.S3_FORCE_PATH_STYLE,
    });
    await mkdir(jobScratchDir, { recursive: true });
    await mkdir(outputHlsDir, { recursive: true });

    // 3. Obtain source video (HTTP(S) URL, local file, or S3 download)
    const isHttpUrl = /^https?:\/\//i.test(job.video_key);

    if (isHttpUrl) {
      await downloadHttpFile(job.video_key, inputVideoPath, {
        timeoutMs: config.HTTP_DOWNLOAD_TIMEOUT_MS,
        maxBytes: config.HTTP_DOWNLOAD_MAX_BYTES,
        signal,
      });
    } else {
      const cleanVideoKey = job.video_key.replace(/^[/\\]+/, "");
      const localStorageRoot = resolve(config.LOCAL_STORAGE_ROOT);
      const workspaceDir = process.cwd();
      const localCandidates = [
        resolveWithin(workspaceDir, cleanVideoKey),
        resolveWithin(localStorageRoot, cleanVideoKey),
        resolveWithin(join(workspaceDir, "scratch"), cleanVideoKey),
      ];
      let isLocalFile = false;
      for (const candidate of localCandidates) {
        if (existsSync(candidate)) {
          try {
            const s = await stat(candidate);
            if (s.isFile()) {
              if (s.size > config.HTTP_DOWNLOAD_MAX_BYTES) {
                throw new Error(
                  `Local source ${candidate} exceeds the ${config.HTTP_DOWNLOAD_MAX_BYTES}-byte limit`,
                );
              }
              await copyFile(candidate, inputVideoPath);
              isLocalFile = true;
              break;
            }
          } catch (error) {
            if (
              error instanceof Error &&
              error.message.startsWith("Local source ")
            ) {
              throw error;
            }
            // Candidate disappeared or could not be read; try the next
            // configured local location, then S3.
          }
        }
      }

      if (!isLocalFile) {
        await storage.downloadObject(cleanVideoKey, inputVideoPath, {
          signal,
        });
      }
    }

    // 4. Probe Video Metadata (or reuse from DB if already probed)
    const mediaAsset = await db
      .selectFrom("media_assets")
      .selectAll()
      .where("id", "=", job.video_id)
      .executeTakeFirst();

    let sourceMetadata: VideoMetadata;

    if (
      mediaAsset &&
      typeof mediaAsset.width === "number" &&
      mediaAsset.width > 0 &&
      typeof mediaAsset.height === "number" &&
      mediaAsset.height > 0 &&
      mediaAsset.duration_seconds !== null &&
      Number(mediaAsset.duration_seconds) > 0
    ) {
      console.info(
        `[media-worker] Reusing video metadata from database: ${mediaAsset.width}x${mediaAsset.height}, duration: ${mediaAsset.duration_seconds}s`,
      );
      sourceMetadata = {
        width: mediaAsset.width,
        height: mediaAsset.height,
        durationSeconds: Number(mediaAsset.duration_seconds),
      };
    } else {
      console.info(`[media-worker] Probing video metadata from source file...`);
      sourceMetadata = await probeVideoMetadata(
        inputVideoPath,
        config.FFPROBE_PATH,
      );
    }

    // Keep the media asset authoritative for metadata discovered by the
    // worker. Jobs created with only a video/job id may not have been probed
    // by the API yet, so persist the duration before FFmpeg starts. Existing
    // dimensions are retained when available; the resolved duration is
    // written as the worker's authoritative integer value.
    await db
      .updateTable("media_assets")
      .set({
        width: mediaAsset?.width ?? sourceMetadata.width,
        height: mediaAsset?.height ?? sourceMetadata.height,
        duration_seconds: Math.round(sourceMetadata.durationSeconds),
        updated_at: new Date(),
      })
      .where("id", "=", job.video_id)
      .execute();

    // 5. Build FFmpeg command for requested qualities array
    const targetQualities: readonly VideoQualityLevel[] = [
      ...new Set(job.qualities),
    ];

    // 4b. When necessary, cap the source to the largest requested quality
    // tier before splitting it into renditions. Sources already within that
    // cap skip this pass entirely to avoid an unnecessary full re-encode.
    const optimizedVideoPath = join(jobScratchDir, "optimized.mp4");
    const compression = buildCompressionArgs({
      inputPath: inputVideoPath,
      outputPath: optimizedVideoPath,
      qualities: targetQualities,
      metadata: sourceMetadata,
      crf: config.VIDEO_COMPRESSION_CRF,
    });

    // 5b. Transition job to PROCESSING as FFmpeg is actually starting
    await db
      .updateTable("video_jobs")
      .set({
        status: "processing",
        updated_at: new Date(),
      })
      .where("id", "=", jobId)
      .execute();

    await recordEvent("job_started", jobId, {
      videoKey: job.video_key,
      outputPrefix: job.output_prefix,
      qualities: job.qualities,
    });

    // Avoid a needless full re-encode when the source already fits the
    // largest requested rendition. Capped inputs still use the smaller
    // intermediate to avoid carrying 4K pixels through every HLS rendition.
    const transcodeInputPath = compression.targetResolution
      ? optimizedVideoPath
      : inputVideoPath;
    if (compression.targetResolution) {
      await runFfmpeg({
        executable: config.FFMPEG_PATH,
        args: compression.args,
        phase: "compression pass",
        signal,
      });
    }

    const metadata = compression.targetResolution
      ? await probeVideoMetadata(optimizedVideoPath, config.FFPROBE_PATH)
      : sourceMetadata;

    const { args, masterPlaylistContent, applicableQualities } =
      buildFfmpegHlsArgs({
        inputPath: transcodeInputPath,
        outputDir: outputHlsDir,
        qualities: targetQualities,
        metadata,
        segmentDurationSeconds: DEFAULT_SEGMENT_DURATION_SECONDS,
      });

    // Ensure quality subdirectories exist for applicable qualities
    for (const q of applicableQualities) {
      await mkdir(join(outputHlsDir, q), { recursive: true });
    }

    // 6. Setup progress tracking directly to PostgreSQL
    const progressParser = new FfmpegProgressParser({
      totalDurationSeconds: metadata.durationSeconds,
      throttleIntervalMs: config.PROGRESS_UPDATE_INTERVAL_MS,
      onProgress: (progress) => {
        // Serialize progress writes: a slow earlier query must never land
        // after a newer one and regress the displayed percentage.
        progressWrite = progressWrite
          .catch(() => undefined)
          .then(async () => {
            if ((await getRequestedTestFault(ctx)) === "progress-stall") {
              return;
            }
            await db
              .updateTable("worker_monitoring")
              .set({
                progress_percent: progress.progressPercent,
                last_progress_at: new Date(),
                last_check_at: new Date(),
                updated_at: new Date(),
              })
              .where("worker_id", "=", workerId)
              .execute();
          })
          .catch((err) => {
            console.error("Error persisting progress to DB:", err);
          });
        return progressWrite;
      },
    });

    // 6b. Start uploading segments/playlists as FFmpeg writes them, rather
    // than waiting for the whole multi-quality encode to finish.
    if (config.STORAGE_PROVIDER === "s3") {
      uploadHandle = startIncrementalHlsUpload({
        storage,
        localDir: outputHlsDir,
        s3Prefix: job.output_prefix,
        pollIntervalMs: config.INCREMENTAL_UPLOAD_POLL_MS,
        settleMs: config.INCREMENTAL_UPLOAD_SETTLE_MS,
        drainTimeoutMs: config.INCREMENTAL_UPLOAD_DRAIN_TIMEOUT_MS,
        getConcurrency: () => resolveUploadConcurrency(config),
      });
    }

    // 7. Spawn and execute FFmpeg
    await runFfmpeg({
      executable: config.FFMPEG_PATH,
      args,
      phase: "HLS transcode",
      signal,
      onStdout: (data) => progressParser.parseChunk(data),
    });
    await progressWrite;

    // 8. Write master playlist file
    const masterPlaylistPath = join(outputHlsDir, "master.m3u8");
    await writeFile(masterPlaylistPath, masterPlaylistContent, "utf-8");

    // 9. Persist local artifacts exactly once. The scratch directory is
    // removed in finally, so persistence failures must fail the job rather
    // than leaving a false COMPLETED result with no playable output.
    if (config.STORAGE_PROVIDER === "local") {
      if ((await getRequestedTestFault(ctx)) === "storage-failure") {
        throw new Error("Test fault: storage-failure");
      }
      const cleanPrefix = job.output_prefix.replace(/^s3-bucket\//, "");
      const localTargetDir = resolveWithin(
        resolve(config.LOCAL_STORAGE_ROOT),
        cleanPrefix,
      );
      await mkdir(localTargetDir, { recursive: true });
      await cp(outputHlsDir, localTargetDir, {
        recursive: true,
        force: true,
      });
      console.info(
        `[media-worker] HLS artifacts saved locally to ${localTargetDir}`,
      );
    }

    // 10. Final sweep of the incremental S3 upload — everything the poll
    // loop already picked up while FFmpeg was running is done; this just
    // catches the master playlist (only written above, after FFmpeg
    // exits) and any last segments from the final poll window.
    if (uploadHandle) {
      await uploadHandle.stop();
      uploadHandle = null;
      console.info(
        `[media-worker] Finished uploading HLS output to s3://${config.S3_BUCKET}/${job.output_prefix}`,
      );
    }

    // Mark the job complete and make the live worker ready for a compatible
    // next claim in one transaction. Clearing job_id avoids monitor races
    // against the just-completed job while the worker waits for more work.
    const masterPlaylistStorageKey = buildMasterPlaylistStorageKey(
      job.output_prefix,
    );
    await db.transaction().execute(async (trx) => {
      await persistVideoOutput(trx, job.video_id, masterPlaylistStorageKey);

      await trx
        .updateTable("video_jobs")
        .set({
          status: "completed",
          completed_at: new Date(),
          updated_at: new Date(),
        })
        .where("id", "=", jobId)
        .where("worker_id", "=", workerId)
        .execute();

      await trx
        .updateTable("workers")
        .set({
          status: "ready",
          job_id: null,
          updated_at: new Date(),
        })
        .where("id", "=", workerId)
        .execute();

      await trx
        .updateTable("worker_monitoring")
        .set({
          progress_percent: 100.0,
          last_progress_at: new Date(),
          updated_at: new Date(),
        })
        .where("worker_id", "=", workerId)
        .execute();
    });

    await recordEvent("job_completed", jobId, {
      applicableQualities,
      outputPrefix: job.output_prefix,
      masterPlaylistPath: masterPlaylistStorageKey,
    });
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`Transcode job ${jobId} failed:`, errorMsg);

    if (!ownsJob) {
      throw error;
    }

    // Do not publish a final sweep from a failed/cancelled transcode. It
    // could make incomplete HLS playlists publicly visible under the final
    // output prefix.
    if (uploadHandle) {
      await uploadHandle.abort();
      uploadHandle = null;
    }

    const nextAttempts = job.attempts + 1;
    const shouldRetry = nextAttempts < job.max_attempts;
    await db.transaction().execute(async (trx) => {
      await trx
        .updateTable("video_jobs")
        .set({
          attempts: nextAttempts,
          status: shouldRetry ? "queued" : "failed",
          worker_id: null,
          error_message: errorMsg,
          failed_at: shouldRetry ? null : new Date(),
          updated_at: new Date(),
        })
        .where("id", "=", jobId)
        .where("worker_id", "=", workerId)
        .execute();

      await trx
        .updateTable("workers")
        .set({
          status: shouldRetry ? "ready" : "failed",
          job_id: null,
          updated_at: new Date(),
        })
        .where("id", "=", workerId)
        .execute();
    });

    await recordEvent("job_failed", jobId, {
      error: errorMsg,
      attempts: nextAttempts,
      willRetry: shouldRetry,
    });

    throw error;
  } finally {
    // Clean up scratch files
    try {
      await rm(jobScratchDir, { recursive: true, force: true });
    } catch {
      // Ignored
    }
  }
}
