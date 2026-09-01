import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import type { S3StorageService, StorageUploadItem } from "@veolms/storage";

export interface IncrementalUploadHandle {
  /**
   * Stops the poll loop and runs one final sweep (no mtime-settle skip,
   * since the caller guarantees no writer is still touching localDir by
   * the time stop() is called) to catch anything the last poll missed —
   * in particular the master playlist, which FFmpeg's own writer doesn't
   * produce until after it exits.
   */
  stop: () => Promise<void>;
  abort: () => Promise<void>;
}

export interface IncrementalUploadOptions {
  storage: S3StorageService;
  localDir: string;
  s3Prefix: string;
  pollIntervalMs: number;
  settleMs: number;
  drainTimeoutMs: number;
  getConcurrency: () => Promise<number>;
}

/**
 * Starts uploading HLS segments/playlists to S3 as FFmpeg generates them,
 * instead of waiting for the whole multi-quality encode to finish first.
 * Polls localDir every pollIntervalMs; a file is only picked up once it
 * hasn't been modified for settleMs, so a segment FFmpeg is still writing
 * is never uploaded half-written. Concurrency for each batch is resolved
 * fresh via getConcurrency() (typically backed by sampleResourceUsage()),
 * so upload parallelism backs off automatically under CPU/memory pressure.
 */
export function startIncrementalHlsUpload(
  options: IncrementalUploadOptions,
): IncrementalUploadHandle {
  const {
    storage,
    localDir,
    s3Prefix,
    pollIntervalMs,
    settleMs,
    drainTimeoutMs,
    getConcurrency,
  } = options;
  const cleanPrefix = s3Prefix.endsWith("/") ? s3Prefix : `${s3Prefix}/`;
  const uploaded = new Map<string, { mtimeMs: number; size: number }>();
  let ticking = false;
  let stopped = false;
  let inFlightTick: Promise<void> | null = null;

  async function collectPending(
    skipRecentlyModified: boolean,
  ): Promise<
    Array<
      StorageUploadItem & { relPath: string; mtimeMs: number; size: number }
    >
  > {
    const pending: Array<
      StorageUploadItem & { relPath: string; mtimeMs: number; size: number }
    > = [];
    const now = Date.now();

    async function walk(dir: string, rel: string): Promise<void> {
      let entries: string[];
      try {
        entries = await readdir(dir);
      } catch {
        // localDir (or a quality subdir) may not exist yet on early ticks
        return;
      }

      for (const entry of entries) {
        const fullPath = join(dir, entry);
        const relPath = rel ? `${rel}/${entry}` : entry;
        // HLS segments are immutable once they pass the settle window. Avoid
        // a stat call for every historical segment on every poll; playlists
        // remain eligible because FFmpeg rewrites them as it appends output.
        if (!entry.endsWith(".m3u8") && uploaded.has(relPath)) {
          continue;
        }

        let fileStat;
        try {
          fileStat = await stat(fullPath);
        } catch {
          continue; // removed/renamed between readdir and stat
        }

        if (fileStat.isDirectory()) {
          await walk(fullPath, relPath);
        } else if (fileStat.isFile()) {
          const previous = uploaded.get(relPath);
          if (
            previous &&
            previous.mtimeMs === fileStat.mtimeMs &&
            previous.size === fileStat.size
          ) {
            continue;
          }
          if (skipRecentlyModified && now - fileStat.mtimeMs < settleMs) {
            continue;
          }
          pending.push({
            localFilePath: fullPath,
            key: `${cleanPrefix}${relPath}`,
            filename: entry,
            relPath,
            mtimeMs: fileStat.mtimeMs,
            size: fileStat.size,
          });
        }
      }
    }

    await walk(localDir, "");
    return pending;
  }

  async function tick(finalSweep: boolean): Promise<void> {
    const pending = await collectPending(!finalSweep);
    if (pending.length === 0) {
      return;
    }

    const concurrency = await getConcurrency();
    // Only mark files uploaded once the batch actually succeeds — if it
    // throws, none of this batch is marked, so the next tick (or the
    // final sweep) retries the whole batch rather than silently losing a
    // file that failed partway through it.
    await storage.uploadFiles(pending, concurrency);
    for (const item of pending) {
      uploaded.set(item.relPath, {
        mtimeMs: item.mtimeMs,
        size: item.size,
      });
    }
  }

  const interval = setInterval(() => {
    if (stopped || ticking) {
      return;
    }
    ticking = true;
    inFlightTick = tick(false)
      .catch((err: unknown) => {
        console.warn(
          "[media-worker] Incremental upload batch failed, will retry next tick:",
          err,
        );
      })
      .finally(() => {
        ticking = false;
        inFlightTick = null;
      });
  }, pollIntervalMs);
  interval.unref();

  // Awaits the tick already in flight (if any) instead of busy-polling for
  // it to finish, bounded by drainTimeoutMs so a stuck upload batch can't
  // block stop()/abort() — and therefore the caller's job cleanup — forever.
  async function drainInFlightTick(): Promise<void> {
    if (!inFlightTick) {
      return;
    }
    await Promise.race([
      inFlightTick,
      new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, drainTimeoutMs);
        timer.unref();
      }),
    ]);
  }

  return {
    async stop() {
      stopped = true;
      clearInterval(interval);
      await drainInFlightTick();
      await tick(true);
    },
    async abort() {
      stopped = true;
      clearInterval(interval);
      await drainInFlightTick();
    },
  };
}
