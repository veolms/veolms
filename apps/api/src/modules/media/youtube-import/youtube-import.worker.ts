import { cacheTags, invalidateCache } from "@veolms/api-core";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { Kysely } from "kysely";
import type { FastifyBaseLogger } from "fastify";
import type { Database } from "@veolms/database";
import {
  VIDEO_QUALITY_LEVELS,
  type VideoQualityLevel,
} from "@veolms/contracts";
import type { AppServices, MediaImportPackageResult } from "@veolms/services";
import {
  GIB,
  directorySize,
  getAvailableBytes,
} from "../../../lib/media-tools/disk.ts";
import { createChapterSyncService } from "../../courses/chapters/chapters.service.ts";
import { createCurriculumService } from "../../courses/index.ts";
import * as mediaRepo from "../media.repository.ts";
import { clearHlsPackager } from "./clear-hls.packager.ts";
import { capturePosterFrame, posterKeyFor } from "./poster.ts";
import { outputPrefixFor } from "./youtube-import.cancel.ts";
import {
  downloadHlsLadder,
  readLocalLadder,
  transmuxMp4ToHls,
} from "./source/hls.ts";
import {
  YoutubeUnavailableError,
  downloadProgressiveVideo,
  readVideoMetadata,
} from "./source/youtube.ts";
import * as importRepo from "./youtube-import.repository.ts";
import type { YoutubeImportJob } from "./youtube-import.repository.ts";
import type { YoutubeImportTools } from "./youtube-import.tools.ts";

const JOB = "youtube-import";
const POLL_INTERVAL_MS = 5_000;
const LEASE_MS = 2 * 60_000;
const HEARTBEAT_MS = 30_000;
/** Progress is written at most this often (the stream reads every 1.5 s). */
const PROGRESS_WRITE_MS = 2_000;
const SCRATCH_SWEEP_MS = 60 * 60_000;
const SCRATCH_KEEP_MS = 24 * 60 * 60_000;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** A failed attempt waits this long (doubling) before the next one. */
const RETRY_BACKOFF_MS = 60_000;

/** Percent of the whole import each stage ends at. */
const STAGE_END = { resolved: 2, downloaded: 42, packaged: 82, uploaded: 99 };

const STAGE_ORDER = ["resolved", "downloaded", "packaged", "uploaded"] as const;
type Stage = (typeof STAGE_ORDER)[number];

/** A failure the author can act on; its message is shown to them as is. */
class ImportUserError extends Error {}

class LeaseLostError extends Error {}
class CancelledError extends Error {}

type StopReason = "lease" | "cancel" | "shutdown";

interface JobControl {
  controller: AbortController;
  /** Why the job was told to stop; the first reason wins. */
  reason: StopReason | null;
  stop: (reason: StopReason) => void;
  done: Promise<void>;
}

function stageDone(
  job: { completed_stage: Stage | null },
  stage: Stage,
): boolean {
  return (
    job.completed_stage !== null &&
    STAGE_ORDER.indexOf(job.completed_stage) >= STAGE_ORDER.indexOf(stage)
  );
}

function qualityLabels(qualities: readonly string[]): VideoQualityLevel[] {
  const known = new Set<string>(VIDEO_QUALITY_LEVELS);
  return qualities
    .map((quality) => `${quality}p`)
    .filter((label): label is VideoQualityLevel => known.has(label));
}

async function listFiles(root: string, dir = root): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await listFiles(root, full)));
    else if (entry.isFile() && !entry.name.startsWith(".")) files.push(full);
  }
  return files;
}

function estimateScratchBytes(
  durationSeconds: number | null,
  qualityCount: number,
): number {
  const seconds = Math.max(
    durationSeconds && durationSeconds > 0 ? durationSeconds : 3600,
    60,
  );
  // ~2 Mbps per quality, held twice at the peak (source + packaged output).
  return Math.max(
    2 * GIB,
    Math.ceil((2_000_000 / 8) * seconds * Math.max(qualityCount, 1) * 2),
  );
}

export interface YoutubeImportWorkerOptions {
  database: Kysely<Database>;
  services: AppServices;
  tools: YoutubeImportTools;
  logger: FastifyBaseLogger;
}

/**
 * Works queued YouTube imports on this API instance: at most
 * YOUTUBE_IMPORT_CONCURRENCY at once, each under a renewed lease so another
 * instance takes it over if this one dies. Every stage leaves its output on
 * disk and records itself as done, so a resumed job carries on from the
 * last finished stage instead of starting again.
 *
 * Returns an async stop function: it cancels nothing, it only stops taking
 * new jobs and waits for the running ones' current step; their leases then
 * run out and another instance (or this one after a restart) resumes them.
 */
export function startYoutubeImportWorker({
  database,
  services,
  tools,
  logger,
}: YoutubeImportWorkerOptions): () => Promise<void> {
  const config = services.config;
  const workerId = `${os.hostname()}:${process.pid}:${crypto.randomUUID().slice(0, 8)}`;
  const log = logger.child({ job: JOB, workerId });
  const chapterSync = createChapterSyncService({ database, services });
  const curriculum = createCurriculumService({ database, services });
  const running = new Map<string, JobControl>();
  let stopped = false;
  let polling = false;

  const poll = async () => {
    if (stopped || polling) return;
    polling = true;
    try {
      while (!stopped && running.size < config.YOUTUBE_IMPORT_CONCURRENCY) {
        const job = await importRepo.claimNextImportJob(
          database,
          workerId,
          LEASE_MS,
        );
        if (!job) break;
        const controller = new AbortController();
        const control: JobControl = {
          controller,
          reason: null,
          stop(reason) {
            control.reason ??= reason;
            if (!controller.signal.aborted) controller.abort();
          },
          done: Promise.resolve(),
        };
        control.done = runJob(job, control)
          .catch((error: unknown) =>
            log.error(
              { err: error, importJobId: job.id },
              "YouTube import crashed",
            ),
          )
          .finally(() => running.delete(job.id));
        running.set(job.id, control);
      }
    } catch (error) {
      log.error({ err: error }, "YouTube import poll failed");
    } finally {
      polling = false;
    }
  };

  async function runJob(claimed: YoutubeImportJob, control: JobControl) {
    let job = claimed;
    const jobLog = log.child({ importJobId: job.id, mediaId: job.media_id });
    const { controller } = control;
    const signal = controller.signal;
    const heartbeat = setInterval(() => {
      void importRepo
        .renewImportLease(database, job.id, workerId, LEASE_MS)
        .then(({ held, cancelRequested }) => {
          if (!held) control.stop("lease");
          else if (cancelRequested) control.stop("cancel");
        })
        .catch((error: unknown) =>
          jobLog.warn({ err: error }, "YouTube import lease renewal failed"),
        );
    }, HEARTBEAT_MS);
    heartbeat.unref();

    let lastProgressWrite = 0;
    const write = async (
      values: Parameters<typeof importRepo.updateLeasedImportJob>[3],
    ) => {
      const { held, cancelRequested } = await importRepo.updateLeasedImportJob(
        database,
        job.id,
        workerId,
        values,
      );
      if (!held) {
        control.stop("lease");
        throw new LeaseLostError("Lease lost");
      }
      job = { ...job, ...values } as YoutubeImportJob;
      if (cancelRequested) {
        control.stop("cancel");
        throw new CancelledError("cancel");
      }
    };
    const progress = (percent: number, detail: string, force = false) => {
      const now = Date.now();
      if (!force && now - lastProgressWrite < PROGRESS_WRITE_MS) return;
      lastProgressWrite = now;
      void write({
        progress_percent: Math.max(0, Math.min(99, Math.floor(percent))),
        stage_detail: detail,
      }).catch(() => {});
    };
    const throwIfStopped = () => {
      if (control.reason === "lease") throw new LeaseLostError("Lease lost");
      if (control.reason) throw new CancelledError(control.reason);
    };

    const scratchRoot = await tools.getScratchRoot();
    const scratchDir = path.join(scratchRoot, job.media_id);
    const hlsDir = path.join(scratchDir, "hls");
    const workDir = path.join(scratchDir, "out");
    const resultFile = path.join(scratchDir, "package-result.json");
    const uploadedLog = path.join(scratchDir, "uploaded.txt");
    const posterFile = path.join(scratchDir, "poster.webp");
    const outputPrefix = outputPrefixFor(job.media_id);

    try {
      if (job.attempts > job.max_attempts) {
        throw new ImportUserError(
          `The import stopped after ${job.max_attempts} failed attempts. Press Retry to try again.`,
        );
      }
      await fs.mkdir(scratchDir, { recursive: true });
      // Finished stages count only when their files are on THIS disk: a job
      // taken over from another instance starts again where its files are.
      const localStage = await localCompletedStage(job.completed_stage, {
        hlsDir,
        workDir,
        resultFile,
      });
      await write({
        scratch_dir: scratchDir,
        error_message: null,
        completed_stage: localStage,
      });
      jobLog.info(
        { attempt: job.attempts, stage: job.completed_stage },
        "YouTube import started",
      );

      // --- Resolve + download -------------------------------------------
      if (!stageDone(job, "downloaded")) {
        await write({
          status: "resolving",
          stage_detail: "Reading the video from YouTube",
        });
        const ytdlp = await tools.getYtDlp();
        const metadata = await readVideoMetadata(ytdlp, job.source_url, signal);
        throwIfStopped();
        await write({
          title: job.title ?? metadata.title,
          duration_seconds: metadata.durationSeconds ?? job.duration_seconds,
          completed_stage: "resolved",
          progress_percent: STAGE_END.resolved,
        });
        await mediaRepo.fillMediaSourceDetails(database, job.media_id, {
          title: metadata.title,
          channel: metadata.channel,
        });

        const needed = estimateScratchBytes(
          metadata.durationSeconds,
          config.YOUTUBE_IMPORT_QUALITIES.length,
        );
        await assertScratchRoom(scratchRoot, scratchDir, needed);

        await write({
          status: "downloading",
          stage_detail: "Downloading from YouTube",
        });
        let downloadedBytes = 0;
        if (metadata.manifestUrl) {
          await downloadHlsLadder({
            manifestUrl: metadata.manifestUrl,
            headers: {
              ...metadata.headers,
              Referer: metadata.headers.Referer ?? "https://www.youtube.com/",
            },
            outputDir: hlsDir,
            qualities: config.YOUTUBE_IMPORT_QUALITIES,
            workers: 2,
            attempts: 8,
            timeoutMs: 30_000,
            signal,
            onSegment: ({ bytes, completed, total }) => {
              downloadedBytes += bytes;
              if (downloadedBytes > needed) {
                controller.abort();
                throw new ImportUserError(
                  "The video is larger than the space set aside for it.",
                );
              }
              progress(
                STAGE_END.resolved +
                  ((STAGE_END.downloaded - STAGE_END.resolved) * completed) /
                    total,
                "Downloading from YouTube",
              );
            },
          });
        } else {
          // No HLS ladder: YouTube's single muxed MP4 (360p), stream-copied to HLS.
          progress(
            STAGE_END.resolved + 1,
            "Downloading from YouTube (single quality)",
            true,
          );
          await fs.rm(hlsDir, { recursive: true, force: true });
          await fs.mkdir(hlsDir, { recursive: true });
          const mp4 = path.join(scratchDir, "source.mp4");
          await downloadProgressiveVideo(ytdlp, job.source_url, mp4, signal);
          await transmuxMp4ToHls(await tools.getFfmpeg(), mp4, hlsDir, {
            quality: String(metadata.height ?? 360),
            width: metadata.width,
            signal,
          });
          await fs.rm(mp4, { force: true });
        }
        throwIfStopped();
        await write({
          completed_stage: "downloaded",
          progress_percent: STAGE_END.downloaded,
        });
      }

      // --- Package --------------------------------------------------------
      let packaged: MediaImportPackageResult;
      if (!stageDone(job, "packaged")) {
        await write({
          status: "packaging",
          stage_detail: "Preparing the video for streaming",
        });
        const ladder = await readLocalLadder(hlsDir);
        // From the clear source, before a packager may encrypt it. A video
        // without a poster still plays, so a failure here is only logged.
        await capturePosterFrame(
          await tools.getFfmpeg(),
          ladder,
          posterFile,
          signal,
        ).catch((error: unknown) => {
          throwIfStopped();
          jobLog.warn({ err: error }, "YouTube import poster not captured");
        });
        const packager = services.mediaImport.getPackager() ?? clearHlsPackager;
        await fs.rm(workDir, { recursive: true, force: true });
        await fs.mkdir(workDir, { recursive: true });
        packaged = await packager.package({
          mediaId: job.media_id,
          hlsDir,
          ladder,
          workDir,
          resolveFfmpeg: () => tools.getFfmpeg(),
          signal,
          onProgress: (fraction, detail) =>
            progress(
              STAGE_END.downloaded +
                (STAGE_END.packaged - STAGE_END.downloaded) * fraction,
              detail,
            ),
          log: (message) => jobLog.info({ packager: packager.name }, message),
        });
        throwIfStopped();
        await fs.writeFile(resultFile, JSON.stringify(packaged), "utf8");
        // A new output: what an earlier attempt uploaded is not part of it.
        await fs.rm(uploadedLog, { force: true });
        // The source ladder is no longer needed (a packager may have moved it).
        await fs.rm(hlsDir, { recursive: true, force: true });
        await write({
          completed_stage: "packaged",
          progress_percent: STAGE_END.packaged,
          qualities: JSON.stringify(packaged.qualities),
        });
      } else {
        packaged = JSON.parse(
          await fs.readFile(resultFile, "utf8"),
        ) as MediaImportPackageResult;
      }

      // --- Upload ---------------------------------------------------------
      const manifestLocal = path.join(workDir, packaged.manifestPath);
      const manifestKey = `${outputPrefix}/${packaged.manifestPath.split(path.sep).join("/")}`;
      if (!stageDone(job, "uploaded")) {
        await write({
          status: "uploading",
          stage_detail: "Uploading to storage",
        });
        // Every finished upload is noted in the scratch folder, so a resumed
        // attempt (after a crash, restart or failure) sends only the rest.
        // Without the note this output was never uploaded: clear whatever
        // an earlier packaging run may have left under the prefix.
        const alreadyUploaded = await readUploadedKeys(uploadedLog);
        if (alreadyUploaded === null) {
          await services.storage.deletePrefix(`${outputPrefix}/`);
          await fs.writeFile(uploadedLog, "", "utf8");
        }
        const files = (await listFiles(workDir)).filter(
          (file) => file !== manifestLocal,
        );
        const toItem = (file: string) => ({
          localFilePath: file,
          key: `${outputPrefix}/${path.relative(workDir, file).split(path.sep).join("/")}`,
        });
        const pending = files
          .map(toItem)
          .filter((item) => !alreadyUploaded?.has(item.key));
        const done = files.length - pending.length;
        if (done > 0) {
          jobLog.info(
            { alreadyUploaded: done, remaining: pending.length },
            "Resuming the upload where it stopped",
          );
        }
        let noteWrites = Promise.resolve();
        await services.storage.uploadFiles(pending, 6, {
          signal,
          onUploaded: (count, item) => {
            noteWrites = noteWrites.then(() =>
              fs.appendFile(uploadedLog, `${item.key}\n`, "utf8"),
            );
            progress(
              STAGE_END.packaged +
                ((STAGE_END.uploaded - STAGE_END.packaged) * (done + count)) /
                  (files.length + 1),
              "Uploading to storage",
            );
          },
        });
        await noteWrites;
        if (await exists(posterFile)) {
          await services.storage.uploadFiles(
            [
              {
                localFilePath: posterFile,
                key: posterKeyFor(job.media_id),
                contentType: "image/webp",
              },
            ],
            1,
            { signal },
          );
        }
        // The manifest goes last: it only ever points at uploaded segments.
        await services.storage.uploadFiles([toItem(manifestLocal)], 1, {
          signal,
        });
        throwIfStopped();
        await write({
          completed_stage: "uploaded",
          progress_percent: STAGE_END.uploaded,
        });
      }

      // --- Finalize -------------------------------------------------------
      await write({ status: "finalizing", stage_detail: "Finishing" });
      const top = await topVariantSize(
        path.join(workDir, packaged.manifestPath),
      );
      const outputId = crypto.randomUUID();
      const sizeBytes = await directorySize(workDir);
      const completed = await database.transaction().execute(async (trx) => {
        const held = await importRepo.completeLeasedImportJob(
          trx,
          job.id,
          workerId,
          {
            qualities: packaged.qualities,
            duration_seconds: packaged.durationSeconds,
          },
        );
        if (!held) return false;
        await importRepo.publishImportedVideo(trx, job.media_id, {
          outputId,
          videoJobId: crypto.randomUUID(),
          outputPrefix,
          manifestKey,
          mimeType: manifestKey.endsWith(".mpd")
            ? "application/dash+xml"
            : "application/vnd.apple.mpegurl",
          originalFilename: `${(job.title ?? job.youtube_id).slice(0, 100)}${path.extname(manifestKey)}`,
          sizeBytes,
          width: top.width,
          height: top.height,
          durationSeconds: packaged.durationSeconds,
          videoQualities: qualityLabels(packaged.qualities),
          metadata: {
            source: "youtube",
            youtubeId: job.youtube_id,
            sourceUrl: job.source_url,
            qualities: [...packaged.qualities],
          },
        });
        return true;
      });
      if (!completed) {
        // Not completed: either the author cancelled in the last moment or
        // another instance took the job. The lease check tells which.
        const lease = await importRepo.renewImportLease(
          database,
          job.id,
          workerId,
          LEASE_MS,
        );
        if (lease.held && lease.cancelRequested) {
          control.stop("cancel");
          throw new CancelledError("cancel");
        }
        throw new LeaseLostError("Lease lost before finalizing");
      }
      jobLog.info(
        { manifestKey, qualities: packaged.qualities },
        "YouTube import completed",
      );
      // The video now has a length, which the course's cached content shows.
      if (job.course_id) invalidateCache([cacheTags.course(job.course_id)]);

      if (job.course_id && job.lesson_id) {
        try {
          const attached = await curriculum.attachProcessedLessonVideo({
            courseId: job.course_id,
            lessonId: job.lesson_id,
            expectedMediaId: job.replaces_media_id,
            mediaId: job.media_id,
          });
          jobLog.info(
            { lessonId: job.lesson_id, attached },
            attached
              ? "Imported video attached to its lesson"
              : "Lesson's video changed during the import; not attached",
          );
        } catch (error) {
          jobLog.warn(
            { err: error },
            "Could not attach the imported video to its lesson",
          );
        }
      }

      services.analyticsEvents?.emit("media.video.ready", {
        mediaId: job.media_id,
        manifestKey,
        outputId,
        at: new Date(),
      });
      try {
        await chapterSync.syncChaptersForMedia(
          {
            id: job.media_id,
            status: "ready",
            durationSeconds: packaged.durationSeconds,
            storageKey: manifestKey,
            masterPlaylistKey: manifestKey,
          },
          jobLog,
        );
      } catch (error) {
        jobLog.warn(
          { err: error },
          "Failed to sync lesson chapters after a YouTube import",
        );
      }
      await fs.rm(scratchDir, { recursive: true, force: true }).catch(() => {});
    } catch (error) {
      await handleFailure(job, error, {
        scratchDir,
        outputPrefix,
        jobLog,
        reason: control.reason,
      });
    } finally {
      clearInterval(heartbeat);
    }
  }

  async function handleFailure(
    job: YoutubeImportJob,
    error: unknown,
    context: {
      scratchDir: string;
      outputPrefix: string;
      jobLog: FastifyBaseLogger;
      reason: StopReason | null;
    },
  ) {
    const { jobLog } = context;
    if (context.reason === "lease" || error instanceof LeaseLostError) {
      // Another instance holds the job now; it carries on from the last stage.
      jobLog.warn(
        "YouTube import lease lost; leaving the job to its new owner",
      );
      return;
    }
    if (context.reason === "shutdown") {
      jobLog.info("API stopping; the YouTube import resumes on the next poll");
      await importRepo
        .releaseImportLease(database, job.id, workerId)
        .catch(() => {});
      return;
    }
    const packager = services.mediaImport.getPackager() ?? clearHlsPackager;
    if (context.reason === "cancel") {
      jobLog.info("YouTube import cancelled");
      await packager
        .discard?.(job.media_id)
        .catch((err: unknown) =>
          jobLog.warn({ err }, "Packager discard failed"),
        );
      await services.storage
        .deletePrefix(`${context.outputPrefix}/`)
        .catch(() => {});
      await fs
        .rm(context.scratchDir, { recursive: true, force: true })
        .catch(() => {});
      await endJob(job, {
        status: "cancelled",
        error_message: null,
        scratch_dir: null,
      });
      return;
    }

    const message = error instanceof Error ? error.message : String(error);
    const userFacing =
      error instanceof ImportUserError ||
      error instanceof YoutubeUnavailableError;
    jobLog.warn(
      { err: error, attempt: job.attempts },
      "YouTube import attempt failed",
    );
    if (!userFacing && job.attempts < job.max_attempts) {
      // Left in its stage with no owner: claimable again once the lease
      // time passes, so the wait is the retry backoff.
      const backoff = RETRY_BACKOFF_MS * 2 ** Math.max(0, job.attempts - 1);
      await importRepo.updateLeasedImportJob(database, job.id, workerId, {
        lease_owner: null,
        lease_expires_at: new Date(Date.now() + backoff),
        error_message: message.slice(0, 2000),
        stage_detail: `Something went wrong; trying again in ${Math.round(backoff / 60_000)} min`,
      });
      return;
    }
    // Final failure. A packager that keeps something outside the output
    // (encryption keys) drops it, so a manual retry packages again.
    let completedStage = job.completed_stage;
    if (packager.discard) {
      await packager
        .discard(job.media_id)
        .catch((err: unknown) =>
          jobLog.warn({ err }, "Packager discard failed"),
        );
      if (stageDone(job, "packaged")) completedStage = null;
    }
    await endJob(job, {
      status: "failed",
      error_message: message.slice(0, 2000),
      stage_detail: userFacing ? message.slice(0, 500) : null,
      completed_stage: completedStage,
    });
  }

  /** The job ends unfinished; its media is marked failed with it. */
  async function endJob(
    job: YoutubeImportJob,
    values: Parameters<typeof importRepo.endImportJob>[2],
  ) {
    await database.transaction().execute(async (trx) => {
      await importRepo.endImportJob(trx, job.id, values);
      await importRepo.setImportMediaStatus(trx, job.media_id, "failed");
    });
  }

  async function assertScratchRoom(
    scratchRoot: string,
    scratchDir: string,
    needed: number,
  ) {
    const minFree = config.YOUTUBE_IMPORT_MIN_FREE_DISK_GB * GIB;
    const maxScratch = config.YOUTUBE_IMPORT_MAX_SCRATCH_GB * GIB;
    const held =
      (await directorySize(scratchRoot)) - (await directorySize(scratchDir));
    if (held + needed > maxScratch) {
      throw new Error(
        `Import scratch space is full (${(held / GIB).toFixed(1)} GiB of ${config.YOUTUBE_IMPORT_MAX_SCRATCH_GB} GiB in use).`,
      );
    }
    const free = await getAvailableBytes(scratchRoot);
    if (free !== null && free - needed < minFree) {
      throw new ImportUserError(
        "The server does not have enough free disk space for this video right now.",
      );
    }
  }

  const sweep = async () => {
    try {
      const stale = await importRepo.listStaleImportScratchDirs(
        database,
        new Date(Date.now() - SCRATCH_KEEP_MS),
      );
      const root = await tools.getScratchRoot();
      for (const row of stale) {
        // Only ever delete inside this instance's scratch root.
        if (
          path
            .resolve(row.scratch_dir)
            .startsWith(`${path.resolve(root)}${path.sep}`)
        ) {
          await fs.rm(row.scratch_dir, { recursive: true, force: true });
        }
        await importRepo.clearImportScratchDir(database, row.id);
      }
      // Folders whose job is gone (its course or media was deleted while
      // it ran) have no row to find them by.
      const entries = await fs
        .readdir(root, { withFileTypes: true })
        .catch(() => []);
      for (const entry of entries) {
        // Scratch folders are named by media id; leave anything else alone.
        if (!entry.isDirectory() || !UUID_PATTERN.test(entry.name)) continue;
        const dir = path.join(root, entry.name);
        const stat = await fs.stat(dir).catch(() => null);
        if (!stat || Date.now() - stat.mtimeMs < SCRATCH_KEEP_MS) continue;
        if (!(await importRepo.findImportJobByMediaId(database, entry.name))) {
          await fs.rm(dir, { recursive: true, force: true });
        }
      }
    } catch (error) {
      log.warn({ err: error }, "YouTube import scratch sweep failed");
    }
  };

  const pollTimer = setInterval(() => void poll(), POLL_INTERVAL_MS);
  pollTimer.unref();
  const sweepTimer = setInterval(() => void sweep(), SCRATCH_SWEEP_MS);
  sweepTimer.unref();
  void poll();
  log.info(
    { concurrency: config.YOUTUBE_IMPORT_CONCURRENCY },
    "YouTube import worker started",
  );

  return async () => {
    stopped = true;
    clearInterval(pollTimer);
    clearInterval(sweepTimer);
    for (const control of running.values()) control.stop("shutdown");
    await Promise.allSettled([...running.values()].map((entry) => entry.done));
  };
}

/** The last finished stage whose files are present in this scratch folder. */
async function localCompletedStage(
  stage: Stage | null,
  files: { hlsDir: string; workDir: string; resultFile: string },
): Promise<Stage | null> {
  if (stage === "packaged" || stage === "uploaded") {
    if ((await exists(files.resultFile)) && (await exists(files.workDir))) {
      return stage;
    }
    stage = "downloaded";
  }
  if (stage === "downloaded") {
    return (await exists(path.join(files.hlsDir, "master.m3u8")))
      ? stage
      : null;
  }
  // "resolved" holds nothing on disk; the manifest URL is resolved anew.
  return null;
}

/**
 * Storage keys already uploaded for the current output, one per line, or
 * null when this output has not been uploaded at all.
 */
async function readUploadedKeys(file: string): Promise<Set<string> | null> {
  try {
    const text = await fs.readFile(file, "utf8");
    return new Set(text.split(/\r?\n/).filter(Boolean));
  } catch {
    return null;
  }
}

async function exists(file: string): Promise<boolean> {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

/** Width/height of the highest variant, read from the packaged manifest. */
async function topVariantSize(
  manifestPath: string,
): Promise<{ width: number | null; height: number | null }> {
  try {
    const text = await fs.readFile(manifestPath, "utf8");
    let best = { width: 0, height: 0 };
    for (const match of text.matchAll(
      /RESOLUTION=(\d+)x(\d+)|width="(\d+)"\s+height="(\d+)"/g,
    )) {
      const width = Number(match[1] ?? match[3]);
      const height = Number(match[2] ?? match[4]);
      if (height > best.height) best = { width, height };
    }
    return best.height ? best : { width: null, height: null };
  } catch {
    return { width: null, height: null };
  }
}
