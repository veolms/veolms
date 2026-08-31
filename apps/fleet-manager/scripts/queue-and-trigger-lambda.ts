/**
 * Queues one transcode job into PostgreSQL and invokes the serverless
 * Fleet Manager Lambda once to claim it — nothing else. No infra
 * provisioning here; run `pnpm fleet:infra` first (against real AWS or
 * LocalStack, per its own target-environment prompt).
 *
 * Meant to be run multiple times in a row to queue several jobs and
 * verify the fleet provisions one worker per job (e.g. run twice, then
 * check `aws ec2 describe-instances` shows two running instances).
 *
 * Respects whatever AWS target the current apps/fleet-manager/.env points
 * at (AWS_ENDPOINT_URL for LocalStack, or real AWS if unset) — same as
 * every other AWS-facing script in this package.
 *
 * Usage:
 *   pnpm fleet:queue:trigger
 *   VIDEO_KEY=raw/other.mp4 QUALITIES=240p,360p pnpm fleet:queue:trigger
 *
 * If VIDEO_KEY and/or QUALITIES aren't passed as env vars, it prompts for
 * them interactively instead of silently defaulting.
 */
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { stdin as input, stdout as output } from "node:process";
import * as readline from "node:readline/promises";
import { createDatabase } from "@veolms/database";
import { loadServerConfig } from "@veolms/config";
import {
  videoQualityLevelSchema,
  type VideoQualityLevel,
} from "@veolms/fleet-types";

function resolveAwsRegion(): string {
  if (process.env.AWS_REGION) {
    return process.env.AWS_REGION;
  }
  if (process.env.AWS_DEFAULT_REGION) {
    return process.env.AWS_DEFAULT_REGION;
  }
  if (process.env.FLEET_MANAGER_LAMBDA_REGION) {
    return process.env.FLEET_MANAGER_LAMBDA_REGION;
  }
  if (process.env.LAMBDA_FUNCTION_ARN) {
    const match = /^arn:aws:lambda:([^:]+):/i.exec(
      process.env.LAMBDA_FUNCTION_ARN,
    );
    if (match?.[1]) {
      return match[1];
    }
  }
  return "us-east-1";
}

function resolveLambdaName(): string {
  if (process.env.LAMBDA_FUNCTION_NAME) {
    return process.env.LAMBDA_FUNCTION_NAME;
  }
  if (process.env.FLEET_MANAGER_LAMBDA_NAME) {
    return process.env.FLEET_MANAGER_LAMBDA_NAME;
  }
  if (process.env.LAMBDA_FUNCTION_ARN) {
    const match = /:function:([^:]+)$/i.exec(process.env.LAMBDA_FUNCTION_ARN);
    if (match?.[1]) {
      return match[1];
    }
  }
  return "veolms-fleet-manager";
}

const REGION = resolveAwsRegion();
const LAMBDA_NAME = resolveLambdaName();
const PROFILE = process.env.AWS_PROFILE;
const ENDPOINT_URL =
  process.env.AWS_ENDPOINT_URL || process.env.LOCALSTACK_ENDPOINT;
const DEFAULT_VIDEO_KEY = "raw/video.mp4";
const DEFAULT_QUALITIES: readonly VideoQualityLevel[] = ["240p"];

function buildAwsCliArgs(subcommandArgs: string[]): string[] {
  const args = [...subcommandArgs];
  if (REGION) {
    args.push("--region", REGION);
  }
  if (PROFILE) {
    args.push("--profile", PROFILE);
  }
  if (ENDPOINT_URL) {
    args.push("--endpoint-url", ENDPOINT_URL);
  }
  return args;
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function parseQualities(raw: string): VideoQualityLevel[] {
  return raw.split(",").map((q) => videoQualityLevelSchema.parse(q.trim()));
}

// Only prompts for whichever of VIDEO_KEY/QUALITIES wasn't passed as an env
// var, so `VIDEO_KEY=... QUALITIES=... pnpm fleet:queue:trigger` still runs
// fully non-interactively for repeated/scripted use.
async function resolveVideoKeyAndQualities(): Promise<{
  videoKey: string;
  qualities: VideoQualityLevel[];
}> {
  const envVideoKey = process.env.VIDEO_KEY;
  const envQualities = process.env.QUALITIES;

  if (envVideoKey && envQualities) {
    return { videoKey: envVideoKey, qualities: parseQualities(envQualities) };
  }

  const rl = readline.createInterface({ input, output });
  try {
    let videoKey = envVideoKey;
    if (!videoKey) {
      const answer = (
        await rl.question(`Video key or URL [${DEFAULT_VIDEO_KEY}]: `)
      ).trim();
      videoKey = answer || DEFAULT_VIDEO_KEY;
    }

    let qualities: VideoQualityLevel[];
    if (envQualities) {
      qualities = parseQualities(envQualities);
    } else {
      qualities = [];
      while (qualities.length === 0) {
        const answer = (
          await rl.question(
            `Target qualities, comma-separated [${DEFAULT_QUALITIES.join(",")}]: `,
          )
        ).trim();
        try {
          qualities = parseQualities(answer || DEFAULT_QUALITIES.join(","));
        } catch {
          console.error(
            `  Invalid quality. Allowed: 2160p, 1440p, 1080p, 720p, 480p, 360p, 240p, 144p`,
          );
        }
      }
    }

    return { videoKey, qualities };
  } finally {
    rl.close();
  }
}

async function resolveVideoSize(videoKey: string): Promise<number> {
  if (process.env.VIDEO_SIZE) {
    return Number(process.env.VIDEO_SIZE);
  }
  if (/^https?:\/\//i.test(videoKey)) {
    try {
      const res = await fetch(videoKey, { method: "HEAD" });
      const contentLength = res.headers.get("content-length");
      if (contentLength) {
        return Number(contentLength);
      }
    } catch {
      // Fall through to the 0 baseline below.
    }
  }
  return 0;
}

async function main(): Promise<void> {
  const config = loadServerConfig(process.env);
  const db = createDatabase(config.DATABASE_URL);

  try {
    const { videoKey: VIDEO_KEY, qualities: QUALITIES } =
      await resolveVideoKeyAndQualities();
    const jobId = randomUUID();
    const outputPrefix = `hls/test-${jobId.slice(0, 8)}/`;
    const videoSize = await resolveVideoSize(VIDEO_KEY);

    console.info(
      `\n╔══════════════════════════════════════════════════════════════╗`,
    );
    console.info(
      `║     VeoLMS AWS Queue & Trigger (Serverless Fleet Manager)    ║`,
    );
    console.info(
      `╚══════════════════════════════════════════════════════════════╝\n`,
    );

    console.info(`[1/3] Adding job to PostgreSQL database...`);
    console.info(`  Job ID:        ${jobId}`);
    console.info(`  Video Key:     ${VIDEO_KEY}`);
    console.info(`  Output Prefix: ${outputPrefix}`);
    console.info(`  Qualities:     ${QUALITIES.join(", ")}`);
    console.info(`  Video Size:    ${videoSize} bytes`);

    // Ensure a media_assets record exists so foreign key video_jobs.video_id -> media_assets.id is satisfied
    const existingMedia = await db
      .selectFrom("media_assets")
      .selectAll()
      .where("storage_key", "=", VIDEO_KEY)
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

      const filename = VIDEO_KEY.split("/").pop() || "video.mp4";
      await db
        .insertInto("media_assets")
        .values({
          id: videoId,
          owner_id: ownerId,
          type: "video",
          storage_provider: process.env.STORAGE_PROVIDER || "s3",
          storage_key: VIDEO_KEY,
          original_filename: filename,
          mime_type: "video/mp4",
          size_bytes: videoSize,
          status: "ready",
        })
        .execute();
    }

    // Check if an active job already exists for this video
    const existingActiveJob = await db
      .selectFrom("video_jobs")
      .selectAll()
      .where("video_id", "=", videoId)
      .where("status", "in", ["queued", "provisioning", "processing"])
      .orderBy("created_at", "desc")
      .executeTakeFirst();

    let actualJobId = jobId;
    let actualOutputPrefix = outputPrefix;

    if (existingActiveJob) {
      actualJobId = existingActiveJob.id;
      actualOutputPrefix = existingActiveJob.output_prefix;
      console.info(
        `✔ Found existing active job [${actualJobId}] in status "${existingActiveJob.status}". Reusing it.\n`,
      );
    } else {
      await db
        .insertInto("video_jobs")
        .values({
          id: jobId,
          video_id: videoId,
          status: "queued",
          video_key: VIDEO_KEY,
          output_prefix: outputPrefix,
          video_size: videoSize,
          qualities: QUALITIES,
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

      console.info(`✔ Job [${jobId}] queued.\n`);
    }

    console.info(
      `[2/3] Invoking Lambda "${LAMBDA_NAME}" (region: ${REGION}${PROFILE ? `, profile: ${PROFILE}` : ""}) to claim and launch EC2 worker...`,
    );
    const outFile = join(
      tmpdir(),
      `lambda-invoke-${actualJobId.slice(0, 8)}.json`,
    );
    const invokeArgs = [
      ...buildAwsCliArgs([
        "lambda",
        "invoke",
        "--function-name",
        LAMBDA_NAME,
        "--payload",
        JSON.stringify({
          action: "claim",
          jobId: actualJobId,
          videoId,
          videoKey: VIDEO_KEY,
          outputPrefix: actualOutputPrefix,
          qualities: QUALITIES,
          videoSize,
        }),
        "--cli-binary-format",
        "raw-in-base64-out",
      ]),
      outFile,
    ];

    try {
      // aws lambda invoke's own stdout JSON carries FunctionError when the
      // function threw unhandled — that's distinct from (and checked
      // before) the payload written to outFile, since a crash produces an
      // {errorMessage, errorType, trace} envelope there, not the
      // {success, ...} shape a normal response has.
      const invokeResultRaw = execFileSync("aws", invokeArgs, {
        stdio: "pipe",
      }).toString();
      const responseRaw = readFileSync(outFile, "utf-8").trim();
      unlinkSync(outFile);

      let invokeResult: Record<string, unknown> = {};
      try {
        invokeResult = JSON.parse(invokeResultRaw);
      } catch {
        // Non-JSON CLI output; fall through to inspecting the payload below.
      }

      let parsedPayload: Record<string, unknown> = {};
      try {
        const topLevel = JSON.parse(responseRaw);
        parsedPayload =
          typeof topLevel.body === "string"
            ? JSON.parse(topLevel.body)
            : topLevel;
      } catch {
        parsedPayload = { raw: responseRaw };
      }

      const crashed =
        Boolean(invokeResult["FunctionError"]) ||
        typeof parsedPayload["errorMessage"] === "string";

      if (crashed) {
        console.error(
          `✘ Lambda function crashed (FunctionError: ${invokeResult["FunctionError"] ?? "unknown"}): ${
            parsedPayload["errorMessage"] ?? responseRaw
          }`,
        );
        process.exitCode = 1;
        return;
      }

      if (parsedPayload.success === false) {
        console.error(`✘ Lambda returned an error: ${parsedPayload.error}`);
        process.exitCode = 1;
        return;
      }

      console.info(`✔ Lambda executed successfully.`);
      console.info(
        `  Claim Result: ${parsedPayload.jobClaimed ? "Job Claimed & EC2 Worker Launched" : "No job claimed (at worker capacity or queue empty)"}`,
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`✘ Lambda invoke failed: ${msg}`);
      if (
        msg.includes("CreateOAuth2Token") ||
        msg.includes("InvalidClientTokenId") ||
        msg.includes("ExpiredToken") ||
        msg.includes("AuthFailure") ||
        msg.includes("UnrecognizedClientException")
      ) {
        console.error(`\n  💡 AWS Authentication Hint:`);
        console.error(
          `     Your AWS session or SSO credentials have expired or are not configured.`,
        );
        console.error(
          `     Run: aws sso login${PROFILE ? ` --profile ${PROFILE}` : ""} (or set AWS_ACCESS_KEY_ID & AWS_SECRET_ACCESS_KEY)`,
        );
      } else if (msg.includes("ResourceNotFoundException")) {
        console.error(`\n  💡 Lambda Not Found Hint:`);
        console.error(
          `     Function "${LAMBDA_NAME}" was not found in region "${REGION}".`,
        );
        console.error(
          `     Run "pnpm fleet:infra --provider=aws" to deploy the infrastructure.`,
        );
      }
      process.exitCode = 1;
      return;
    }

    console.info(`\n[3/3] Checking worker and EC2 instance status...`);
    // Poll for the worker_id to land instead of a single fixed-delay check
    // — Lambda's EC2 launch (spot capacity lookup, IAM propagation) can
    // take longer than a couple seconds to persist the workers row.
    let updatedJob:
      | {
          id: string;
          status: string;
          worker_id: string | null;
          error_message: string | null;
        }
      | undefined;
    const maxPollAttempts = 15;
    for (let attempt = 0; attempt < maxPollAttempts; attempt++) {
      updatedJob = await db
        .selectFrom("video_jobs")
        .select(["id", "status", "worker_id", "error_message"])
        .where("id", "=", actualJobId)
        .executeTakeFirst();
      if (updatedJob?.worker_id) break;
      await new Promise((r) => setTimeout(r, 1000));
    }

    if (updatedJob?.worker_id) {
      const worker = await db
        .selectFrom("workers")
        .selectAll()
        .where("id", "=", updatedJob.worker_id)
        .executeTakeFirst();

      if (worker) {
        console.info(`✔ Worker record created in PostgreSQL:`);
        console.info(`  Worker ID:           ${worker.id}`);
        console.info(`  Provider Worker ID:  ${worker.provider_worker_id}`);
        console.info(`  Worker Status:       ${worker.status}`);

        const ec2InstanceId = worker.provider_worker_id;
        if (ec2InstanceId && ec2InstanceId.startsWith("i-")) {
          try {
            const descArgs = buildAwsCliArgs([
              "ec2",
              "describe-instances",
              "--instance-ids",
              ec2InstanceId,
              "--output",
              "json",
            ]);
            const descOut = JSON.parse(
              execFileSync("aws", descArgs, { stdio: "pipe" }).toString(),
            );
            const instance = descOut.Reservations?.[0]?.Instances?.[0];
            if (instance) {
              const state = instance.State?.Name ?? "unknown";
              const publicIp = instance.PublicIpAddress;
              const privateIp = instance.PrivateIpAddress;
              const keyName =
                instance.KeyName || process.env.KEY_NAME || "mykey";

              console.info(`\n  EC2 Instance Details:`);
              console.info(`    Instance ID:       ${ec2InstanceId}`);
              console.info(`    State:             ${state}`);
              console.info(`    Instance Type:     ${instance.InstanceType}`);
              console.info(
                `    Public IP:         ${publicIp || "(assigning...)"}`,
              );
              console.info(
                `    Private IP:        ${privateIp || "(assigning...)"}`,
              );
              console.info(`    Key Pair:          ${keyName}`);

              if (publicIp) {
                // Find the matching .pem key file, checked only once we
                // actually need it (the common case right after launch is
                // "IP still being allocated," which never reaches here).
                // The instance's real key name is checked before the
                // generic "mykey.pem" fallback, so a stale/unrelated
                // mykey.pem left over from another instance is never
                // picked over the key that actually matches this one.
                const repoRoot = resolve(process.cwd(), "../..");
                const possibleKeys = [
                  join(process.cwd(), `${keyName}.pem`),
                  join(repoRoot, `${keyName}.pem`),
                  join(process.cwd(), "mykey.pem"),
                  join(repoRoot, "mykey.pem"),
                ];
                const foundKey = possibleKeys.find((k) => existsSync(k));
                const keyPath = foundKey ?? `${keyName}.pem`;
                const keyArg = `-i ${shellQuote(keyPath)}`;
                const target = `admin@${shellQuote(publicIp)}`;

                console.info(`\n  SSH Access to Worker:`);
                console.info(`    ssh ${keyArg} ${target}`);
                console.info(`\n  Live Worker Logs:`);
                console.info(
                  `    ssh ${keyArg} ${target} ${shellQuote("tail -f /var/log/veolms-bootstrap.log /var/log/veolms-worker.log")}`,
                );
              } else {
                console.info(
                  `\n  Note: Public IP is being allocated. You can check again in a few seconds:`,
                );
                console.info(
                  `    aws ec2 describe-instances --instance-ids ${ec2InstanceId} --region ${REGION} --query "Reservations[0].Instances[0].PublicIpAddress" --output text`,
                );
              }
            }
          } catch (descErr: unknown) {
            const descMsg =
              descErr instanceof Error ? descErr.message : String(descErr);
            console.info(`  (Could not fetch EC2 details yet: ${descMsg})`);
          }
        }
      }
    } else {
      console.info(`  Job status in database: ${updatedJob?.status}`);
      if (updatedJob?.error_message) {
        console.error(`  Error message: ${updatedJob.error_message}`);
      }
    }

    console.info(`\nTo monitor jobs & workers continuously:`);
    console.info(`  pnpm fleet:cli status ${actualJobId}`);
    console.info(
      `  aws logs tail /veolms/workers --follow --region ${REGION}\n`,
    );
  } finally {
    await db.destroy();
  }
}

main().catch((err: unknown) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
