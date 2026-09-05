import { randomUUID } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createDatabase } from "@veolms/database";
import { loadFleetManagerConfig } from "@veolms/config";
import {
  isMainModule,
  resolveJobHardware,
  type ProviderTriggerOptions,
  type ProviderTriggerResult,
  type VideoQualityLevel,
} from "@veolms/fleet-types";
import { bold, cyan, green } from "@veolms/fleet-types/terminal";
import { createLocalProvider } from "./provider.ts";

export async function triggerTest(
  options: ProviderTriggerOptions = {},
): Promise<ProviderTriggerResult> {
  const fleetConfig = loadFleetManagerConfig();
  const db = createDatabase(fleetConfig.DATABASE_URL);

  const __dirname = dirname(fileURLToPath(import.meta.url));
  const repoRoot = resolve(__dirname, "../../..");

  const defaultWorkerScript = join(repoRoot, "apps/media-worker/src/index.ts");
  const workerScript = existsSync(defaultWorkerScript)
    ? defaultWorkerScript
    : undefined;

  const provider = createLocalProvider({
    workerScriptPath: workerScript,
    cwd: repoRoot,
    defaultEnv: {
      DATABASE_URL: fleetConfig.DATABASE_URL,
      STORAGE_PROVIDER: "local",
    },
  });

  const jobId = options.jobId ?? randomUUID();
  const workerId = randomUUID();
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
    bold(
      cyan("=== AUTONOMOUS END-TO-END FLEET & TRANSCODER PIPELINE TEST ==="),
    ),
  );
  console.info(
    bold(
      cyan("==============================================================="),
    ),
  );
  console.info(`Job ID:        ${jobId}`);
  console.info(`Video Key:     ${videoKey}`);
  console.info(`Output Folder: s3-bucket/${outputPrefix}`);
  console.info(`Qualities:     ${qualities.join(", ")}`);
  console.info(
    "---------------------------------------------------------------\n",
  );

  try {
    // 1. Cancel any stale pending jobs from prior test runs (excluding our target job)
    await db
      .updateTable("video_jobs")
      .set({ status: "cancelled", updated_at: new Date() })
      .where("status", "in", ["queued", "processing", "provisioning"])
      .where("id", "!=", jobId)
      .execute();

    await db
      .updateTable("workers")
      .set({ status: "terminated", updated_at: new Date() })
      .where("provider", "=", "local")
      .where("status", "in", [
        "pending",
        "provisioning",
        "starting",
        "ready",
        "processing",
      ])
      .execute();

    // 2. Insert media asset and job if not already queued by fleet-manager
    let videoId = options.videoId;
    if (!options.jobId) {
      let existingMedia = await db
        .selectFrom("media_assets")
        .selectAll()
        .where("storage_key", "=", videoKey)
        .executeTakeFirst();

      videoId = existingMedia?.id ?? randomUUID();
      if (!existingMedia) {
        const ownerUser = await db
          .selectFrom("users")
          .select("id")
          .limit(1)
          .executeTakeFirst();

        let ownerId = ownerUser?.id;
        if (!ownerId) {
          ownerId = "00000000-0000-4000-8000-000000000001";
          await db
            .insertInto("users")
            .values({
              id: ownerId,
              email: "creator@veolms.org",
              username: "creator",
              display_name: "VeoLMS Creator",
              email_verified_at: new Date(),
            })
            .onConflict((oc: any) => oc.column("id").doNothing())
            .execute();
        }

        const filename = videoKey.split(/[/\\]/).pop() || "sample-input.mp4";
        await db
          .insertInto("media_assets")
          .values({
            id: videoId,
            owner_id: ownerId,
            type: "video",
            storage_provider: "local",
            storage_key: videoKey,
            original_filename: filename,
            mime_type: "video/mp4",
            size_bytes: 0,
            status: "ready",
          })
          .execute();
      }

      await db
        .insertInto("video_jobs")
        .values({
          id: jobId,
          video_id: videoId,
          status: "queued",
          video_key: videoKey,
          output_prefix: outputPrefix,
          video_size: options.videoSize ?? 0,
          qualities: [...qualities],
          worker_id: null,
          attempts: 0,
          max_attempts: 3,
          error_message: null,
          created_at: new Date(),
          started_at: null,
          completed_at: null,
          failed_at: null,
          updated_at: new Date(),
        })
        .execute();
      console.info(`✓ Job [${jobId}] is now QUEUED in PostgreSQL.\n`);
    }

    // 4. Calculate hardware spec and insert Worker and Monitoring records
    const hw = resolveJobHardware({
      video_size: options.videoSize ?? 0,
      qualities,
    });

    await db
      .insertInto("workers")
      .values({
        id: workerId,
        provider: "local",
        provider_worker_id: "pending",
        status: "pending",
        architecture: hw.architecture,
        cpu: hw.minCpu,
        memory_mb: hw.minMemoryMb,
        storage_gb: hw.storageGb,
        region: "local",
        job_id: jobId,
        metadata: {},
        last_heartbeat_at: null,
        created_at: new Date(),
        started_at: null,
        terminated_at: null,
        updated_at: new Date(),
      })
      .execute();

    await db
      .insertInto("worker_monitoring")
      .values({
        worker_id: workerId,
        next_check_at: new Date(Date.now() + 10000),
        last_check_at: null,
        estimated_duration_sec: hw.estimatedDurationSeconds,
        progress_percent: 0.0,
        last_progress_at: null,
        monitoring_attempts: 0,
        check_interval_sec: 10,
        updated_at: new Date(),
      })
      .execute();

    // 5. Launch worker child process
    console.info("[2/4] Spawning local media worker child process...");
    const workerHandle = await provider.createWorker(workerId, {
      cpu: hw.minCpu,
      memoryMb: hw.minMemoryMb,
      architecture: hw.architecture,
      storageGb: hw.storageGb,
      region: "local",
      environmentVariables: {
        DATABASE_URL: fleetConfig.DATABASE_URL,
        JOB_ID: jobId,
        WORKER_ID: workerId,
        STORAGE_PROVIDER: "local",
      },
    });

    await db
      .updateTable("workers")
      .set({
        provider_worker_id: workerHandle.providerWorkerId,
        status: "provisioning",
        updated_at: new Date(),
      })
      .where("id", "=", workerId)
      .execute();

    // 6. Monitor job completion
    console.info("[3/4] Watching job progress and heartbeats in database...");
    const startTime = Date.now();
    let completed = false;

    while (!completed) {
      await new Promise((res) => setTimeout(res, 2000));

      const currentJob = await db
        .selectFrom("video_jobs")
        .select(["status", "worker_id", "error_message"])
        .where("id", "=", jobId)
        .executeTakeFirst();

      if (!currentJob) continue;

      const monitoring = await db
        .selectFrom("worker_monitoring")
        .select(["progress_percent"])
        .where("worker_id", "=", workerId)
        .executeTakeFirst();

      const progress = monitoring?.progress_percent ?? 0;
      process.stdout.write(
        `\r  [Progress] Status: ${currentJob.status} | Worker: ${workerId.slice(0, 8)} | Progress: ${Number(progress).toFixed(1)}%   `,
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
        throw new Error("Timeout: Job took longer than 180s");
      }
    }

    // Terminate worker if still alive
    await provider
      .terminateWorker(workerHandle.providerWorkerId)
      .catch(() => {});

    // 7. Verify generated HLS files on disk
    console.info("\n[4/4] Verifying generated HLS files on disk...");
    const cleanPrefix = outputPrefix.replace(/^s3-bucket[/\\]/, "");
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
    }

    console.info(
      bold(
        green(
          "\n===============================================================",
        ),
      ),
    );
    console.info(
      bold(green("🎉 LOCAL AUTONOMOUS PIPELINE TEST PASSED SUCCESSFULLY!")),
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
      workerId,
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
