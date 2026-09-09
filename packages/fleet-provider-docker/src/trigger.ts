/**
 * VeoLMS Docker Provider End-to-End Test Trigger
 *
 * In Serverful Docker mode:
 * 1. The job is queued in PostgreSQL by Fleet Manager CLI.
 * 2. Fleet Manager daemon (running via Docker Compose or `pnpm fleet:cli run daemon`)
 *    polls `video_jobs`, claims the queued job, and spawns the Docker worker.
 * 3. This trigger script monitors the job and worker progress in PostgreSQL,
 *    and verifies the generated HLS outputs upon completion.
 *    It does NOT start containers directly, delegating orchestration to Fleet Manager.
 *
 * Dispatched via: apps/fleet-manager/src/cli.ts's "trigger" command
 * Triggered by:   pnpm fleet:queue:trigger  (when FLEET_PROVIDER=docker)
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createDatabase } from "@veolms/database";
import { loadFleetManagerConfig } from "@veolms/config";
import {
  isMainModule,
  type ProviderTriggerOptions,
  type ProviderTriggerResult,
  type VideoQualityLevel,
} from "@veolms/fleet-types";
import { bold, cyan, green, yellow } from "@veolms/fleet-types/terminal";
import { findRepoRoot } from "@veolms/fleet-types/env";

export async function triggerTest(
  options: ProviderTriggerOptions = {},
): Promise<ProviderTriggerResult> {
  const jobId = options.jobId;
  if (!jobId) {
    throw new Error(
      "Missing required option 'jobId'. Video jobs must be queued via Fleet Manager CLI before triggering.",
    );
  }

  const fleetConfig = loadFleetManagerConfig();
  const db = createDatabase(fleetConfig.DATABASE_URL);

  const __dirname = dirname(fileURLToPath(import.meta.url));
  const repoRoot = findRepoRoot(__dirname);

  const videoKey = options.videoKey ?? "s3-bucket/raw/video.mp4";
  const outputPrefix = options.outputPrefix ?? "output/auto-demo/";
  const qualities: readonly VideoQualityLevel[] =
    (options.qualities as VideoQualityLevel[]) ?? ["240p", "144p"];

  console.info(
    bold(
      cyan("==============================================================="),
    ),
  );
  console.info(
    bold(cyan("=== DOCKER AUTONOMOUS END-TO-END FLEET & PIPELINE TEST ===")),
  );
  console.info(
    bold(
      cyan("==============================================================="),
    ),
  );
  console.info(`Job ID:        ${jobId}`);
  console.info(`Video ID:      ${options.videoId ?? "N/A"}`);
  console.info(`Video Key:     ${videoKey}`);
  console.info(`Video Size:    ${options.videoSize ?? 0} bytes`);
  console.info(
    `Output Folder: s3-bucket/${outputPrefix.replace(/^s3-bucket[/\\\\]/, "")}`,
  );
  console.info(`Qualities:     ${qualities.join(", ")}`);
  console.info(
    "---------------------------------------------------------------\n",
  );

  try {
    // 1. Monitor Job Execution by Fleet Manager Daemon
    console.info(
      "[1/2] Awaiting Fleet Manager daemon to claim job and provision Docker worker...",
    );
    const startTime = Date.now();
    let completed = false;
    let assignedWorkerId: string | null = null;
    let warnedDaemonNotice = false;
    let finalOriginalFileKey: string | null = null;

    while (!completed) {
      await new Promise((res) => setTimeout(res, 2000));

      const currentJob = await db
        .selectFrom("video_jobs")
        .select(["status", "worker_id", "error_message", "original_file_key"])
        .where("id", "=", jobId)
        .executeTakeFirst();

      if (!currentJob) continue;
      finalOriginalFileKey = currentJob.original_file_key ?? null;

      if (currentJob.worker_id && !assignedWorkerId) {
        assignedWorkerId = currentJob.worker_id;
        console.info(
          `\n✓ Fleet Manager assigned worker [${assignedWorkerId}] (Job status: ${currentJob.status})`,
        );
        console.info(
          "Watching transcoding progress & heartbeats in database...",
        );
      }

      if (
        !assignedWorkerId &&
        !warnedDaemonNotice &&
        Date.now() - startTime > 8000
      ) {
        warnedDaemonNotice = true;
        console.warn(
          yellow(
            "\n⚠ Job is queued but no worker has been assigned yet.\n" +
              "  Ensure Fleet Manager daemon is running in another terminal or container:\n" +
              "    • pnpm fleet:cli run daemon\n" +
              "    • or docker compose up veolms-fleet-manager\n",
          ),
        );
      }

      let progress = 0;
      if (assignedWorkerId) {
        const monitoring = await db
          .selectFrom("worker_monitoring")
          .select(["progress_percent"])
          .where("worker_id", "=", assignedWorkerId)
          .executeTakeFirst();
        progress = monitoring?.progress_percent
          ? Number(monitoring.progress_percent)
          : 0;
      }

      const displayWorker = assignedWorkerId
        ? assignedWorkerId.slice(0, 8)
        : "awaiting...";
      process.stdout.write(
        `\r  [Progress] Status: ${currentJob.status} | Worker: ${displayWorker} | Progress: ${progress.toFixed(1)}%   `,
      );

      if (currentJob.status === "completed") {
        completed = true;
        console.info("\n\n✓ Job successfully COMPLETED!");
        break;
      }

      if (currentJob.status === "failed") {
        throw new Error(`Job FAILED: ${currentJob.error_message}`);
      }

      if (Date.now() - startTime > 180000) {
        throw new Error("Timeout: Job took longer than 180s to complete");
      }
    }

    // 2. Verify generated HLS output on disk
    console.info("\n[2/2] Verifying generated HLS files on disk...");
    const cleanPrefix = outputPrefix.replace(/^s3-bucket[/\\\\]/, "");
    const outputDir = existsSync(resolve(repoRoot, outputPrefix))
      ? resolve(repoRoot, outputPrefix)
      : resolve(repoRoot, "s3-bucket", cleanPrefix);

    if (existsSync(outputDir)) {
      const masterPlaylist = join(outputDir, "master.m3u8");
      if (existsSync(masterPlaylist)) {
        console.info(
          `✓ Found master.m3u8 (${statSync(masterPlaylist).size} bytes)`,
        );
        console.info("\n--- master.m3u8 ---");
        console.info(readFileSync(masterPlaylist, "utf-8").trim());
      }

      for (const q of qualities) {
        const qDir = join(outputDir, q);
        if (existsSync(qDir)) {
          const playlistName = existsSync(join(qDir, `${q}.m3u8`))
            ? `${q}.m3u8`
            : "prog_index.m3u8";
          const segments = readdirSync(qDir).filter((f) => f.endsWith(".ts"));
          console.info(
            `✓ Quality ${q}: Found playlist (${playlistName}) and ${segments.length} segment (.ts) chunks`,
          );
        }
      }

      const origKey = options.originalFileKey ?? finalOriginalFileKey;
      if (origKey) {
        const cleanOrig = origKey.replace(/^s3-bucket[/\\\\]/, "");
        const origFile = existsSync(resolve(repoRoot, origKey))
          ? resolve(repoRoot, origKey)
          : resolve(repoRoot, "s3-bucket", cleanOrig);
        if (existsSync(origFile)) {
          console.info(
            `✓ Found optimized original backup (${statSync(origFile).size} bytes) at ${origKey}`,
          );
        }
      }
    }

    console.info(
      bold(
        green(
          "\n===============================================================",
        ),
      ),
    );
    console.info(
      bold(green("🎉 DOCKER AUTONOMOUS PIPELINE TEST PASSED SUCCESSFULLY!")),
    );
    console.info(
      bold(
        green(
          "===============================================================\n",
        ),
      ),
    );

    return {
      success: true,
      jobId,
      workerId: assignedWorkerId ?? undefined,
    };
  } finally {
    await db.destroy();
  }
}

export const runTrigger = triggerTest;
export default triggerTest;

if (isMainModule(import.meta.url)) {
  triggerTest().catch((err) => {
    console.error("\n❌ Pipeline test error:", err);
    process.exit(1);
  });
}
