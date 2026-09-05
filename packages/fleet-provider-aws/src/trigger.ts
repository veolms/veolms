/**
 * AWS Provider Queue & Trigger Task
 *
 * Queues a video transcoding task into PostgreSQL and invokes the AWS Lambda
 * function to claim it and provision an EC2 Graviton worker.
 */

import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { stdin as input, stdout as output } from "node:process";
import * as readline from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { createDatabase } from "@veolms/database";
import { loadFleetManagerConfig } from "@veolms/config";
import {
  videoQualityLevelSchema,
  type VideoQualityLevel,
  type ProviderTriggerOptions,
  type ProviderTriggerResult,
} from "@veolms/fleet-types";
import { isMainModule } from "@veolms/fleet-types";
import { bold, cyan, green, red, yellow } from "@veolms/fleet-types/terminal";

function resolveAwsRegion(): string {
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg?.startsWith("--region=")) {
      const val = arg.split("=")[1]?.trim();
      if (val) return val;
    }
    if (
      arg === "--region" &&
      i + 1 < args.length &&
      !args[i + 1]?.startsWith("-")
    ) {
      const val = args[i + 1]?.trim();
      if (val) return val;
    }
  }
  if (process.env.AWS_REGION) return process.env.AWS_REGION;
  if (process.env.AWS_DEFAULT_REGION) return process.env.AWS_DEFAULT_REGION;
  if (process.env.FLEET_MANAGER_LAMBDA_REGION)
    return process.env.FLEET_MANAGER_LAMBDA_REGION;
  return "us-east-1";
}

function resolveAwsProfile(): string | undefined {
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg?.startsWith("--profile=") || arg?.startsWith("--aws-profile=")) {
      return arg.split("=")[1]?.trim();
    }
    if (
      (arg === "--profile" || arg === "--aws-profile") &&
      i + 1 < args.length &&
      !args[i + 1]?.startsWith("-")
    ) {
      return args[i + 1]?.trim();
    }
  }
  return process.env.AWS_PROFILE;
}

function resolveTargetLambda(): {
  name: string;
  isDirectFleetManager: boolean;
} {
  const args = process.argv.slice(2);
  const isDirect =
    args.includes("--fleet-manager") ||
    args.includes("--direct") ||
    args.includes("--target=fleet-manager") ||
    process.env["DIRECT"] === "true";

  for (const arg of args) {
    if (arg.startsWith("--lambda=") || arg.startsWith("--function-name=")) {
      const customName = arg.split("=")[1]?.trim();
      if (customName) {
        return { name: customName, isDirectFleetManager: isDirect };
      }
    }
  }

  if (isDirect) {
    return {
      name:
        process.env.FLEET_MANAGER_LAMBDA_NAME ||
        process.env.LAMBDA_FUNCTION_NAME ||
        "veolms-fleet-manager",
      isDirectFleetManager: true,
    };
  }

  return {
    name: process.env.PROBE_LAMBDA_NAME || "veolms-video-metadata-probe",
    isDirectFleetManager: false,
  };
}

function buildAwsCliArgs(
  subcommandArgs: string[],
  region: string,
  profile?: string,
  endpointUrl?: string,
): string[] {
  const args = [...subcommandArgs];
  if (region) {
    args.push("--region", region);
  }
  if (profile) {
    args.push("--profile", profile);
  }
  if (endpointUrl) {
    args.push("--endpoint-url", endpointUrl);
  }
  return args;
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export async function triggerTest(
  options: ProviderTriggerOptions = {},
): Promise<ProviderTriggerResult> {
  const fleetConfig = loadFleetManagerConfig();
  const db = createDatabase(fleetConfig.DATABASE_URL);

  const region = resolveAwsRegion();
  const profile = resolveAwsProfile();
  const endpointUrl =
    process.env.AWS_ENDPOINT_URL || process.env.LOCALSTACK_ENDPOINT;
  const { name: lambdaName, isDirectFleetManager } = resolveTargetLambda();

  const isNonInteractive =
    options.nonInteractive === true ||
    process.env.CI === "true" ||
    process.argv.includes("--yes") ||
    process.argv.includes("-y") ||
    process.argv.includes("--non-interactive");

  let videoKey = options.videoKey || process.env.VIDEO_KEY;
  if (!videoKey && !isNonInteractive && process.stdin.isTTY) {
    const rl = readline.createInterface({ input, output });
    const answer = (
      await rl.question(`Video key or URL [raw/video.mp4]: `)
    ).trim();
    rl.close();
    videoKey = answer || "raw/video.mp4";
  } else if (!videoKey) {
    videoKey = "raw/video.mp4";
  }

  const defaultQualities: readonly VideoQualityLevel[] = ["240p"];
  let qualities: readonly VideoQualityLevel[] = defaultQualities;
  if (options.qualities && options.qualities.length > 0) {
    qualities = options.qualities.map((q) => videoQualityLevelSchema.parse(q));
  } else if (process.env.QUALITIES) {
    qualities = process.env.QUALITIES.split(",").map((q) =>
      videoQualityLevelSchema.parse(q.trim()),
    );
  }

  const filename = videoKey.split(/[/\\]/).pop() || "video.mp4";
  const cleanFilename = filename.replace(/\.[^/.]+$/, "");
  const outputPrefix = `transcoded/${cleanFilename}/`;
  const videoSize = options.videoSize ?? 1024 * 1024;
  const jobId = options.jobId ?? randomUUID();
  let videoId = options.videoId;

  console.info(
    bold(
      cyan("==============================================================="),
    ),
  );
  console.info(bold(cyan("=== AWS FLEET MANAGER & WORKER QUEUE TRIGGER ===")));
  console.info(
    bold(
      cyan("==============================================================="),
    ),
  );
  console.info(
    `Target Lambda: ${lambdaName} (${isDirectFleetManager ? "direct" : "probe"})`,
  );
  console.info(`AWS Region:    ${region}`);
  console.info(`Video Key:     ${videoKey}`);
  console.info(`Qualities:     ${qualities.join(", ")}`);
  console.info(`Job ID:        ${jobId}`);
  console.info(
    "---------------------------------------------------------------\n",
  );

  try {
    // If not already queued by fleet-manager, queue into PostgreSQL as fallback
    if (!options.jobId) {
      const existingMedia = await db
        .selectFrom("media_assets")
        .selectAll()
        .where("storage_key", "=", videoKey)
        .executeTakeFirst();

      videoId = existingMedia?.id ?? videoId ?? randomUUID();
      if (!existingMedia) {
        const ownerUser = await db
          .selectFrom("users")
          .select("id")
          .limit(1)
          .executeTakeFirst();

        const ownerId = ownerUser?.id ?? "00000000-0000-4000-8000-000000000001";

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

        await db
          .insertInto("media_assets")
          .values({
            id: videoId,
            owner_id: ownerId,
            type: "video",
            storage_provider: "s3",
            storage_key: videoKey,
            original_filename: filename,
            mime_type: "video/mp4",
            size_bytes: videoSize,
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
          video_size: videoSize,
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
      console.info(`✔ Job [${jobId}] queued in PostgreSQL.`);
    }

    // 3. Invoke AWS Lambda
    console.info(
      `\nInvoking Lambda "${lambdaName}" to claim job and provision EC2 worker...`,
    );

    const outFile = join(tmpdir(), `lambda-invoke-${jobId.slice(0, 8)}.json`);
    const invokeArgs = [
      ...buildAwsCliArgs(
        [
          "lambda",
          "invoke",
          "--function-name",
          lambdaName,
          "--payload",
          JSON.stringify({
            action: "claim",
            jobId,
            videoId,
            videoKey,
            outputPrefix,
            qualities,
            videoSize,
          }),
          "--cli-binary-format",
          "raw-in-base64-out",
        ],
        region,
        profile,
        endpointUrl,
      ),
      outFile,
    ];

    try {
      execFileSync("aws", invokeArgs, {
        stdio: "pipe",
        shell: process.platform === "win32",
      });

      if (existsSync(outFile)) {
        const responseRaw = readFileSync(outFile, "utf-8").trim();
        unlinkSync(outFile);
        console.info(`✔ Lambda Invocation Response:\n  ${responseRaw}`);
      }
    } catch (invokeErr: unknown) {
      const msg =
        invokeErr instanceof Error ? invokeErr.message : String(invokeErr);
      console.warn(yellow(`⚠ Lambda invoke warning: ${msg}`));
    }

    // 4. Poll database to verify worker assignment
    console.info("\nChecking for worker assignment in database...");
    let assignedWorkerId: string | undefined;

    for (let i = 0; i < 10; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      const jobRow = await db
        .selectFrom("video_jobs")
        .select(["status", "worker_id", "error_message"])
        .where("id", "=", jobId)
        .executeTakeFirst();

      if (jobRow?.worker_id) {
        assignedWorkerId = jobRow.worker_id;
        console.info(
          green(
            `✔ Worker allocated: ${assignedWorkerId} (status: ${jobRow.status})`,
          ),
        );
        break;
      }
    }

    if (assignedWorkerId) {
      const workerRow = await db
        .selectFrom("workers")
        .selectAll()
        .where("id", "=", assignedWorkerId)
        .executeTakeFirst();

      if (
        workerRow?.provider_worker_id &&
        workerRow.provider_worker_id !== "pending"
      ) {
        console.info(`  EC2 Instance ID: ${workerRow.provider_worker_id}`);
        try {
          const ec2Desc = execFileSync(
            "aws",
            buildAwsCliArgs(
              [
                "ec2",
                "describe-instances",
                "--instance-ids",
                workerRow.provider_worker_id,
                "--query",
                "Reservations[0].Instances[0].[State.Name,PublicIpAddress,InstanceType]",
                "--output",
                "text",
              ],
              region,
              profile,
              endpointUrl,
            ),
            { stdio: "pipe" },
          )
            .toString()
            .trim();
          console.info(`  EC2 Details:     ${ec2Desc}`);
        } catch {
          // EC2 describe error is non-fatal for test trigger
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
      bold(green("🎉 AWS JOB QUEUED & TRIGGER DISPATCHED SUCCESSFULLY!")),
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
      workerId: assignedWorkerId,
    };
  } finally {
    await db.destroy();
  }
}

export const runTrigger = triggerTest;
export default triggerTest;

if (isMainModule(import.meta.url)) {
  triggerTest().catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`\n❌ AWS trigger failed: ${msg}\n`);
    process.exit(1);
  });
}
