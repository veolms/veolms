import { randomUUID } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createDatabase } from "@veolms/database";
import { loadFleetManagerConfig, loadServerConfig } from "@veolms/config";
import type { VideoQualityLevel } from "@veolms/fleet-types";
import { createFleetManager } from "../src/core/fleet-manager.ts";
import { resolveFleetProvider } from "../src/core/provider-resolver.ts";

async function main() {
  const serverConfig = loadServerConfig(process.env);
  const fleetConfig = loadFleetManagerConfig({
    ...process.env,
    POLL_INTERVAL_MS: 1000,
    HEARTBEAT_TIMEOUT_SECONDS: 90,
  });

  const db = createDatabase(serverConfig.DATABASE_URL);

  // Resolved from this file's own location, not process.cwd() — this
  // script always lives at apps/fleet-manager/scripts/.
  const repoRoot = join(
    dirname(fileURLToPath(import.meta.url)),
    "..",
    "..",
    "..",
  );
  const defaultWorkerScript = join(repoRoot, "apps/media-worker/src/index.ts");
  const workerScript = existsSync(defaultWorkerScript)
    ? defaultWorkerScript
    : undefined;

  const provider = await resolveFleetProvider("local", {
    workerScriptPath: workerScript,
    defaultEnv: {
      DATABASE_URL: serverConfig.DATABASE_URL,
    },
  });

  const fleet = createFleetManager({
    provider,
    db,
    config: fleetConfig,
  });

  const jobId = randomUUID();
  const videoKey = "s3-bucket/raw/video.mp4";
  const outputPrefix = "output/auto-demo/";
  const qualities: VideoQualityLevel[] = ["240p", "144p"];

  console.info(
    "===============================================================",
  );
  console.info(
    "=== AUTONOMOUS END-TO-END FLEET & TRANSCODER PIPELINE TEST ===",
  );
  console.info(
    "===============================================================",
  );
  console.info(`Job ID:        ${jobId}`);
  console.info(`Video Key:     ${videoKey}`);
  console.info(`Output Folder: s3-bucket/${outputPrefix}`);
  console.info(`Qualities:     ${qualities.join(", ")}`);
  console.info(
    "---------------------------------------------------------------\n",
  );

  // Cancel any stale pending jobs from prior runs
  await db
    .updateTable("video_jobs")
    .set({ status: "cancelled", updated_at: new Date() })
    .where("status", "in", ["queued", "processing"])
    .execute();

  // Step 1: Insert job into PostgreSQL
  console.info(
    "[1/4] User queues a new transcode task directly into PostgreSQL `video_jobs` table...",
  );
  let existingMedia = await db
    .selectFrom("media_assets")
    .selectAll()
    .where("storage_key", "=", videoKey)
    .executeTakeFirst();

  const videoId = existingMedia?.id ?? randomUUID();
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
        .onConflict((oc) => oc.column("id").doNothing())
        .execute();
    }

    const filename = videoKey.split("/").pop() || "sample-input.mp4";
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
      video_size: 0,
      qualities,
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

  // Step 2: Fleet Manager starts daemon loop and automatically picks up the job
  console.info(
    "[2/4] Starting Fleet Manager daemon (auto-claiming & worker provisioning)...",
  );
  const abortController = new AbortController();
  const fleetLoopPromise = fleet.startServerfulLoop(abortController.signal);

  // Step 3: Monitor job completion
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

    if (currentJob.worker_id) {
      const monitoring = await db
        .selectFrom("worker_monitoring")
        .select(["progress_percent", "check_interval_sec"])
        .where("worker_id", "=", currentJob.worker_id)
        .executeTakeFirst();

      const progress = monitoring?.progress_percent ?? 0;
      process.stdout.write(
        `\r  [Progress] Status: ${currentJob.status} | Worker: ${currentJob.worker_id.slice(0, 8)} | Progress: ${Number(progress).toFixed(1)}%   `,
      );
    }

    if (currentJob.status === "completed") {
      completed = true;
      console.info("\n\n✓ Job successfully COMPLETED!");
      break;
    }

    if (currentJob.status === "failed") {
      throw new Error(`Job FAILED: ${currentJob.error_message}`);
    }

    // Safety timeout: 120s
    if (Date.now() - startTime > 120000) {
      throw new Error("Timeout: Job took longer than 120s");
    }
  }

  // Stop fleet daemon loop
  abortController.abort();
  await fleetLoopPromise.catch(() => {});

  // Step 4: Verify generated HLS files on disk
  console.info(
    "\n[4/4] Verifying generated HLS files in `s3-bucket/output/auto-demo/` on disk...",
  );
  const outputDir = resolve(process.cwd(), "s3-bucket", outputPrefix);

  if (!existsSync(outputDir)) {
    throw new Error(`Output directory not found: ${outputDir}`);
  }

  const masterPlaylist = join(outputDir, "master.m3u8");
  if (!existsSync(masterPlaylist)) {
    throw new Error(`master.m3u8 missing at ${masterPlaylist}`);
  }

  console.info(`✓ Found master.m3u8 (${statSync(masterPlaylist).size} bytes)`);
  console.info("\n--- master.m3u8 ---");
  console.info(readFileSync(masterPlaylist, "utf-8").trim());

  for (const q of qualities) {
    const qDir = join(outputDir, q);
    const hasPlaylist =
      existsSync(join(qDir, `${q}.m3u8`)) ||
      existsSync(join(qDir, "prog_index.m3u8"));
    if (!hasPlaylist) {
      throw new Error(`Playlist missing in ${qDir}`);
    }
    const playlistName = existsSync(join(qDir, `${q}.m3u8`))
      ? `${q}.m3u8`
      : "prog_index.m3u8";
    const segments = readdirSync(qDir).filter((f) => f.endsWith(".ts"));
    console.info(
      `✓ Quality ${q}: Found playlist (${playlistName}) and ${segments.length} segment (.ts) chunks`,
    );
  }

  console.info(
    "\n===============================================================",
  );
  console.info("🎉 FULL AUTONOMOUS PIPELINE TEST PASSED SUCCESSFULLY!");
  console.info(
    "===============================================================",
  );

  await db.destroy();
  process.exit(0);
}

main().catch((err) => {
  console.error("\n❌ Pipeline test error:", err);
  process.exit(1);
});
