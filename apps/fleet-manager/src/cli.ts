import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createDatabase } from "@veolms/database";
import {
  DEFAULT_QUALITIES,
  videoQualityLevelSchema,
  type VideoQualityLevel,
} from "@veolms/fleet-types";
import { bold, cyan, dim, red } from "@veolms/fleet-types/terminal";
import { loadFleetManagerConfig, resolveProviderName } from "@veolms/config";
import { loadModuleFunction } from "./core/dynamic-module.ts";
import { createJobManager } from "./core/video-job-manager.ts";
import { resolveFleetProvider } from "./core/provider-resolver.ts";
import {
  getFleetHealthSummary,
  getJobDiagnostics,
  pruneZombieWorkers,
} from "./diagnostics/diagnostics.ts";
import { startServerfulFleetManager } from "./entrypoints/serverful.ts";

export interface ParsedCliArgs {
  command: string;
  positional: string[];
  flags: Record<string, string | boolean>;
}

export function parseCliArgs(args: readonly string[]): ParsedCliArgs {
  const [command = "help", ...rest] = args;
  const positional: string[] = [];
  const flags: Record<string, string | boolean> = {};

  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (!arg) continue;

    if (arg.startsWith("--")) {
      const equalIndex = arg.indexOf("=");
      if (equalIndex !== -1) {
        const key = arg.slice(2, equalIndex);
        const value = arg.slice(equalIndex + 1);
        flags[key] = value;
      } else {
        const key = arg.slice(2);
        const nextArg = rest[i + 1];
        if (nextArg && !nextArg.startsWith("--")) {
          flags[key] = nextArg;
          i++;
        } else {
          flags[key] = true;
        }
      }
    } else {
      positional.push(arg);
    }
  }

  return { command, positional, flags };
}

export async function runCli(
  argv: readonly string[] = process.argv.slice(2),
): Promise<void> {
  const { command, positional, flags } = parseCliArgs(argv);

  if (flags["provider"] === true) {
    console.error(
      `${red("✘")} --provider requires a value, e.g. --provider=aws`,
    );
    process.exit(1);
  }
  const cliProvider =
    typeof flags["provider"] === "string" ? flags["provider"] : undefined;

  const config = loadFleetManagerConfig(
    cliProvider ? { ...process.env, PROVIDER: cliProvider } : process.env,
  );
  let dbInstance: ReturnType<typeof createDatabase> | undefined;
  const getDb = () => {
    dbInstance ??= createDatabase(config.DATABASE_URL);
    return dbInstance;
  };
  // Resolved from this file's own location, not process.cwd() — the CLI
  // can be run from the repo root or from inside apps/fleet-manager, and
  // cwd differs between the two.
  const repoRoot = join(
    dirname(fileURLToPath(import.meta.url)),
    "..",
    "..",
    "..",
  );
  const defaultWorkerScript = join(repoRoot, "apps/media-worker/src/index.ts");
  const workerScript =
    config.MEDIA_WORKER_SCRIPT_PATH ??
    (existsSync(defaultWorkerScript) ? defaultWorkerScript : undefined);

  const heartbeatTimeoutMs = config.HEARTBEAT_TIMEOUT_SECONDS * 1000;

  switch (command) {
    case "run": {
      console.info("[fleet-cli] Starting Fleet Manager daemon...");
      const controller = new AbortController();

      const shutdown = () => {
        console.info("[fleet-cli] Shutting down daemon...");
        controller.abort();
      };

      process.on("SIGINT", shutdown);
      process.on("SIGTERM", shutdown);

      const { startPromise } = await startServerfulFleetManager({
        signal: controller.signal,
      });

      await startPromise;
      break;
    }

    case "queue": {
      const rawVideoKey = positional[0] ?? (flags["video"] as string);
      if (!rawVideoKey) {
        console.error(
          "Error: Missing video key. Usage: fleet queue <video-key> [--prefix <prefix>] [--qualities 1080p,720p]",
        );
        process.exit(1);
      }

      // Sanitize videoKey: prevent directory traversal and leading slashes
      const videoKey = rawVideoKey
        .replace(/^[/\\]+/, "")
        .replace(/\.\.[/\\]/g, "");
      if (!videoKey || videoKey.includes("..")) {
        console.error(`Error: Invalid video key '${rawVideoKey}'`);
        process.exit(1);
      }

      const rawPrefix = flags["prefix"] as string | undefined;
      const cleanPrefix = rawPrefix
        ? rawPrefix.replace(/^[/\\]+/, "").replace(/\.\.[/\\]/g, "")
        : `transcoded/${videoKey.replace(/\.[^/.]+$/, "")}/`;
      const outputPrefix = cleanPrefix.endsWith("/")
        ? cleanPrefix
        : `${cleanPrefix}/`;

      const rawQualities = flags["qualities"] as string | undefined;

      let qualities: readonly VideoQualityLevel[] = DEFAULT_QUALITIES;
      if (rawQualities) {
        qualities = rawQualities.split(",").map((q) => {
          const parsed = videoQualityLevelSchema.safeParse(q.trim());
          if (!parsed.success) {
            throw new Error(
              `Invalid video quality '${q}'. Allowed: 2160p, 1440p, 1080p, 720p, 480p, 360p, 240p, 144p`,
            );
          }
          return parsed.data;
        });
      }

      const rawVideoSize = flags["video-size"] as string | undefined;
      const videoSize = rawVideoSize ? Number(rawVideoSize) : undefined;
      if (rawVideoSize && (!Number.isFinite(videoSize) || videoSize! < 0)) {
        console.error(
          `Error: --video-size must be a non-negative number of bytes`,
        );
        process.exit(1);
      }

      const videoId =
        (flags["video-id"] as string) || (flags["videoId"] as string);

      const jobManager = createJobManager({ db: getDb(), config });
      const job = await jobManager.queueJob({
        videoId,
        videoKey,
        outputPrefix,
        qualities,
        videoSize,
      });

      console.info(`✓ Job queued successfully!`);
      console.info(`  Job ID:        ${job.id}`);
      console.info(`  Video ID:      ${job.video_id}`);
      console.info(`  Video Key:     ${job.video_key}`);
      console.info(`  Output Prefix: ${job.output_prefix}`);
      console.info(`  Qualities:     ${job.qualities.join(", ")}`);
      break;
    }

    case "status": {
      const jobId = positional[0] ?? (flags["id"] as string);
      if (!jobId) {
        console.error("Error: Missing Job ID. Usage: fleet status <job-id>");
        process.exit(1);
      }

      const diagnostics = await getJobDiagnostics(getDb(), jobId);
      if (!diagnostics) {
        console.error(`Error: Job not found with ID '${jobId}'`);
        process.exit(1);
      }

      console.info(`\n=== JOB DIAGNOSTICS [${diagnostics.job.id}] ===`);
      console.info(`Status:        ${diagnostics.job.status}`);
      console.info(`Video ID:      ${diagnostics.job.video_id}`);
      console.info(`Video Key:     ${diagnostics.job.video_key}`);
      console.info(`Output Prefix: ${diagnostics.job.output_prefix}`);
      console.info(`Qualities:     ${diagnostics.job.qualities.join(", ")}`);
      console.info(
        `Attempts:      ${diagnostics.job.attempts} / ${diagnostics.job.max_attempts}`,
      );
      console.info(
        `Worker ID:     ${diagnostics.job.worker_id ?? "Unassigned"}`,
      );

      if (diagnostics.worker) {
        console.info(`\n--- Worker Details ---`);
        console.info(`Provider ID:   ${diagnostics.worker.providerWorkerId}`);
        console.info(`Provider:      ${diagnostics.worker.provider}`);
        console.info(`Status:        ${diagnostics.worker.status}`);
      }

      if (diagnostics.events.length > 0) {
        console.info(`\n--- Audit Events ---`);
        for (const evt of diagnostics.events) {
          console.info(`  [${evt.createdAt.toISOString()}] ${evt.event}`);
        }
      }

      if (diagnostics.progressHistory.length > 0) {
        const last =
          diagnostics.progressHistory[diagnostics.progressHistory.length - 1];
        if (last) {
          console.info(`\n--- Progress ---`);
          console.info(
            `  Progress: ${last.progressPercent.toFixed(1)}% (Interval: ${last.checkIntervalSec}s)`,
          );
        }
      }
      break;
    }

    case "workers": {
      const workers = await getDb()
        .selectFrom("workers")
        .selectAll()
        .orderBy("created_at", "desc")
        .limit(20)
        .execute();

      console.info(`\nActive / Recent Workers (${workers.length}):`);
      for (const w of workers) {
        console.info(
          `- ID: ${w.id} | Status: ${w.status} | Provider: ${w.provider} | Heartbeat: ${w.last_heartbeat_at ? new Date(w.last_heartbeat_at).toLocaleTimeString() : "N/A"}`,
        );
      }
      break;
    }

    case "jobs": {
      const jobs = await getDb()
        .selectFrom("video_jobs")
        .selectAll()
        .orderBy("created_at", "desc")
        .limit(20)
        .execute();

      console.info(`\nRecent Jobs (${jobs.length}):`);
      for (const j of jobs) {
        console.info(
          `- ID: ${j.id} | Status: ${j.status} | Key: ${j.video_key} | Attempts: ${j.attempts}/${j.max_attempts}`,
        );
      }
      break;
    }

    case "health": {
      const summary = await getFleetHealthSummary(getDb(), heartbeatTimeoutMs);
      console.info(`\n=== FLEET HEALTH SUMMARY ===`);
      console.info(`Queued Jobs:     ${summary.queuedJobsCount}`);
      console.info(`Processing Jobs: ${summary.processingJobsCount}`);
      console.info(`Completed Jobs:  ${summary.completedJobsCount}`);
      console.info(`Failed Jobs:     ${summary.failedJobsCount}`);
      console.info(`Active Workers:  ${summary.activeWorkersCount}`);
      console.info(`Stalled Workers: ${summary.stalledWorkersCount}`);
      break;
    }

    case "prune": {
      console.info("[fleet-cli] Pruning zombie workers...");
      const provider = await resolveFleetProvider(config.PROVIDER, {
        workerScriptPath: workerScript,
      });
      const pruned = await pruneZombieWorkers(
        getDb(),
        provider,
        heartbeatTimeoutMs,
      );
      console.info(`✓ Pruned ${pruned.length} stalled workers.`);
      break;
    }

    case "infra": {
      const infraProvider = resolveProviderName(cliProvider, process.env) ?? "";

      if (!infraProvider) {
        console.error(`
  ${red("✘ No provider set.")}

  Set it before running infra setup:

    ${bold("Option 1 — CLI flag:")}
      ${cyan("pnpm fleet:infra --provider=aws")}
      ${cyan("pnpm fleet:infra --provider=local")}

    ${bold("Option 2 — Environment variable:")}
      ${cyan("FLEET_PROVIDER=aws pnpm fleet:infra")}
      ${cyan("FLEET_PROVIDER=local pnpm fleet:infra")}

    ${bold("Option 3 — .env file")} ${dim("(apps/fleet-manager/.env):")}
      ${cyan('FLEET_PROVIDER="aws"')}

  ${bold("Supported providers:")}
    ${bold("aws")}   — AWS EC2 Graviton workers with IAM, Lambda, CloudWatch, S3
    ${bold("local")} — Local child process workers (development / testing)
    ${bold("gcp")}   — Google Cloud Platform workers ${dim("(future)")}
`);
        process.exit(1);
      }

      const normalized = infraProvider.trim().toLowerCase();

      if (normalized === "gcp" || normalized === "azure") {
        console.error(`
  ${red(`✘ ${infraProvider.toUpperCase()} provider setup is not yet implemented.`)}

  The ${infraProvider.toUpperCase()} provider is planned for a future release.
  For now, use ${bold("aws")} or ${bold("local")} as your FLEET_PROVIDER.
`);
        process.exit(1);
      }

      const packageName = normalized.startsWith("@")
        ? `${normalized}/setup`
        : `@veolms/fleet-provider-${normalized}/setup`;

      let setupFn: () => Promise<void>;
      try {
        setupFn = await loadModuleFunction<() => Promise<void>>(
          packageName,
          [
            "runAwsInfraSetup",
            "runLocalInfraSetup",
            "runInfraSetup",
            "default",
          ],
          `Provider setup package "${packageName}" does not export a setup function.`,
        );
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(
          `\n  ${red("✘ Infrastructure setup failed:")} Failed to load setup module for provider "${infraProvider}" (${packageName}). Run "pnpm fleet:provider" to install it. Details: ${msg}\n`,
        );
        process.exit(1);
      }

      try {
        // Outside the try above so a real provisioning failure (bad AWS
        // credentials, an S3 bucket name conflict, IAM propagation
        // timeout) propagates with its own message instead of being
        // mislabeled as "failed to load the module."
        await setupFn();
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`\n  ${red("✘ Infrastructure setup failed:")} ${msg}\n`);
        process.exit(1);
      }
      break;
    }

    default:
      console.info(`
VeoLMS Video Fleet Manager CLI

Usage:
  fleet run                     Start fleet manager daemon
  fleet queue <video-key>       Queue video transcoding job
    --qualities=1080p,720p,...  Specify target resolutions
    --prefix=courses/xyz/       Specify S3 output folder
    --video-size=<bytes>        Source file size, used to size the worker
  fleet status <job-id>         Inspect job progress & diagnostic history
  fleet workers                 List active & recent workers
  fleet jobs                    List recent jobs
  fleet health                  Show cluster health metrics
  fleet prune                   Terminate stalled zombie workers
  fleet infra                   Provision infrastructure for FLEET_PROVIDER
`);
      break;
  }
}

if (
  process.argv[1] &&
  (import.meta.url.endsWith(process.argv[1]) ||
    import.meta.url === `file://${resolve(process.argv[1])}`)
) {
  runCli().catch((err) => {
    console.error("[fleet-cli] Fatal error:", err);
    process.exit(1);
  });
}
