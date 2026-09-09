/**
 * AWS Provider Queue & Trigger Task
 *
 * Queues a video transcoding task into PostgreSQL and invokes the AWS Lambda
 * function to claim it and provision an EC2 Graviton worker.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDatabase } from "@veolms/database";
import { loadFleetManagerConfig } from "@veolms/config";
import {
  estimateJobHardware,
  isMainModule,
  videoQualityLevelSchema,
  type VideoQualityLevel,
  type ProviderTriggerOptions,
  type ProviderTriggerResult,
} from "@veolms/fleet-types";

import { bold, cyan, green, yellow } from "@veolms/fleet-types/terminal";

export function resolveAwsRegion(options?: ProviderTriggerOptions): string {
  const args = [...process.argv.slice(2), ...(options?.rawArgs ?? [])];
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

export function resolveAwsProfile(
  options?: ProviderTriggerOptions,
): string | undefined {
  const args = [...process.argv.slice(2), ...(options?.rawArgs ?? [])];
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

export function resolveFleetManagerLambdaName(): string {
  if (process.env.FLEET_MANAGER_LAMBDA_NAME) {
    return process.env.FLEET_MANAGER_LAMBDA_NAME;
  }
  if (process.env.LAMBDA_FUNCTION_NAME) {
    return process.env.LAMBDA_FUNCTION_NAME;
  }
  if (process.env.LAMBDA_FUNCTION_ARN) {
    const parts = process.env.LAMBDA_FUNCTION_ARN.split(":");
    const fnName = parts[parts.length - 1];
    if (fnName) return fnName;
  }
  return "veolms-fleet-manager";
}

export function resolveProbeLambdaName(): string {
  if (process.env.PROBE_LAMBDA_NAME) {
    return process.env.PROBE_LAMBDA_NAME;
  }
  if (process.env.PROBE_LAMBDA_ARN) {
    const parts = process.env.PROBE_LAMBDA_ARN.split(":");
    const fnName = parts[parts.length - 1];
    if (fnName) return fnName;
  }
  return "veolms-video-metadata-probe";
}

export interface ResolvedTargetLambda {
  name: string;
  isDirectFleetManager: boolean;
}

export function resolveTargetLambda(
  options?: ProviderTriggerOptions,
): ResolvedTargetLambda {
  const args = [...process.argv.slice(2), ...(options?.rawArgs ?? [])];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg?.startsWith("--lambda=") || arg?.startsWith("--function-name=")) {
      const customName = arg.split("=")[1]?.trim();
      if (customName) {
        const isDirect =
          args.includes("--fleet-manager") ||
          args.includes("--direct") ||
          args.includes("--target=fleet-manager") ||
          process.env["DIRECT"] === "true";
        return { name: customName, isDirectFleetManager: isDirect };
      }
    }
    if (
      (arg === "--lambda" || arg === "--function-name") &&
      i + 1 < args.length &&
      !args[i + 1]?.startsWith("-")
    ) {
      const customName = args[i + 1]?.trim();
      if (customName) {
        const isDirect =
          args.includes("--fleet-manager") ||
          args.includes("--direct") ||
          args.includes("--target=fleet-manager") ||
          process.env["DIRECT"] === "true";
        return { name: customName, isDirectFleetManager: isDirect };
      }
    }
  }

  const explicitDirect =
    args.includes("--fleet-manager") ||
    args.includes("--direct") ||
    args.includes("--target=fleet-manager") ||
    process.env["DIRECT"] === "true";

  const explicitProbe =
    args.includes("--probe") ||
    args.includes("--target=probe") ||
    process.env["PROBE"] === "true";

  // Probe Lambda is only considered active/configured if PROBE_LAMBDA_NAME or PROBE_LAMBDA_ARN
  // is present in the environment (or SETUP_PROBE_LAMBDA === "true").
  // When skipped during setup, neither variable is set in .env.
  const hasProbeConfigured = Boolean(
    process.env.PROBE_LAMBDA_NAME ||
    process.env.PROBE_LAMBDA_ARN ||
    process.env.SETUP_PROBE_LAMBDA === "true",
  );

  const fleetManagerLambdaName = resolveFleetManagerLambdaName();
  const probeLambdaName = resolveProbeLambdaName();

  // If direct Fleet Manager is explicitly requested, or if probe was NOT explicitly requested
  // and probe Lambda is not configured in the environment (e.g. user selected "Skip probe Lambda" during setup),
  // automatically invoke the Fleet Manager Lambda directly.
  if (explicitDirect || (!explicitProbe && !hasProbeConfigured)) {
    return {
      name: fleetManagerLambdaName,
      isDirectFleetManager: true,
    };
  }

  return {
    name: probeLambdaName,
    isDirectFleetManager: false,
  };
}

export function buildAwsCliArgs(
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

  const region = resolveAwsRegion(options);
  const profile = resolveAwsProfile(options);
  const endpointUrl =
    process.env.AWS_ENDPOINT_URL || process.env.LOCALSTACK_ENDPOINT;
  const { name: lambdaName, isDirectFleetManager } =
    resolveTargetLambda(options);

  const rawArgs = [...process.argv.slice(2), ...(options.rawArgs ?? [])];
  const fleetMode = (process.env.FLEET_MODE || "").toLowerCase().trim();
  const isServerful = fleetMode === "serverful";
  const hasExplicitLambda = rawArgs.some(
    (a) =>
      a.startsWith("--lambda") ||
      a.startsWith("--function-name") ||
      a === "--probe" ||
      a === "--target=probe" ||
      a === "--fleet-manager" ||
      a === "--target=fleet-manager",
  );

  const videoKey = options.videoKey || "raw/video.mp4";
  const videoId = options.videoId;
  const filename = videoKey.split(/[/\\]/).pop() || "video.mp4";
  const cleanFilename = filename.replace(/\.[^/.]+$/, "");
  const outputPrefix = options.outputPrefix || `transcoded/${cleanFilename}/`;
  const videoSize = options.videoSize ?? 1024 * 1024;
  const qualities: readonly VideoQualityLevel[] =
    options.qualities && options.qualities.length > 0
      ? options.qualities.map((q) => videoQualityLevelSchema.parse(q))
      : ["240p"];

  const hardwareProfile = estimateJobHardware(videoSize, qualities).profile;

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
  if (isServerful && !hasExplicitLambda) {
    console.info(`Execution Mode: Serverful Daemon (polling database)`);
  } else {
    console.info(
      `Target Lambda:  ${lambdaName} (${isDirectFleetManager ? "direct" : "probe"})`,
    );
  }
  console.info(`AWS Region:     ${region}`);
  console.info(`Video Key:      ${videoKey}`);
  console.info(`Video Size:     ${videoSize} bytes`);
  console.info(`Hardware:       ${hardwareProfile}`);
  console.info(`Qualities:      ${qualities.join(", ")}`);
  console.info(`Job ID:         ${jobId}`);
  console.info(
    "---------------------------------------------------------------\n",
  );

  try {
    if (isServerful && !hasExplicitLambda) {
      console.info(
        cyan(
          "ℹ Serverful mode active (FLEET_MODE=serverful). Skipping Lambda invocation;\nthe running fleet-manager daemon will process the queued job from PostgreSQL.\n",
        ),
      );
    } else {
      // 1. Invoke AWS Lambda
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
              ...(options.originalFileKey
                ? { originalFileKey: options.originalFileKey }
                : {}),
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
          console.info(`✔ Lambda Invocation Response:\n  ${responseRaw}`);
        }
      } catch (invokeErr: unknown) {
        const msg =
          invokeErr instanceof Error ? invokeErr.message : String(invokeErr);
        console.warn(yellow(`⚠ Lambda invoke warning: ${msg}`));
        if (
          msg.includes("ResourceNotFoundException") ||
          msg.includes("Function not found")
        ) {
          console.warn(
            yellow(
              `\n  Note: Lambda function "${lambdaName}" was not found on AWS.\n` +
                `  If you opted to skip deploying this Lambda or are using serverful mode,\n` +
                `  ensure the fleet manager daemon is running (pnpm fleet:start)\n` +
                `  or run "pnpm fleet:infra" to deploy serverless infrastructure.\n`,
            ),
          );
        }
      } finally {
        if (existsSync(outFile)) {
          try {
            unlinkSync(outFile);
          } catch {
            // Ignore cleanup failure
          }
        }
      }
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
