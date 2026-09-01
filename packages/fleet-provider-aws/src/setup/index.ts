/**
 * VeoLMS AWS Infrastructure Setup
 *
 * Interactive CLI that provisions all required AWS resources for the
 * Fleet Manager and Media Worker pipeline. Lives inside
 * @veolms/fleet-provider-aws so all AWS-specific concerns stay
 * isolated in one package.
 *
 * Dispatched via: apps/fleet-manager/src/infra.ts
 * Triggered by:   pnpm fleet:infra  (when FLEET_PROVIDER=aws)
 *
 * Resources created:
 *  - IAM Role + Instance Profile for EC2 workers
 *  - (Optional) Lambda function + CloudWatch log group (serverless mode)
 *  - (Optional) S3 bucket permission on EC2 role
 *  - CloudWatch log groups for worker and fleet logs
 *  - Per-app .env files: apps/fleet-manager/.env + apps/media-worker/.env
 */

import * as readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import * as fs from "node:fs/promises";
import * as fsSync from "node:fs";
import * as path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";
import { resolveS3BucketName } from "../config.ts";

import {
  IAMClient,
  CreateRoleCommand,
  AttachRolePolicyCommand,
  CreateInstanceProfileCommand,
  AddRoleToInstanceProfileCommand,
  PutRolePolicyCommand,
  GetRoleCommand,
  UpdateAssumeRolePolicyCommand,
} from "@aws-sdk/client-iam";
import {
  EC2Client,
  CreateSecurityGroupCommand,
  DescribeSecurityGroupsCommand,
  AuthorizeSecurityGroupIngressCommand,
  DescribeKeyPairsCommand,
} from "@aws-sdk/client-ec2";
import {
  LambdaClient,
  CreateFunctionCommand,
  GetFunctionCommand,
  Runtime,
  PackageType,
  Architecture,
  UpdateFunctionCodeCommand,
  UpdateFunctionConfigurationCommand,
} from "@aws-sdk/client-lambda";
import {
  CloudWatchLogsClient,
  CreateLogGroupCommand,
  DescribeLogGroupsCommand,
  PutRetentionPolicyCommand,
} from "@aws-sdk/client-cloudwatch-logs";
import {
  S3Client,
  HeadBucketCommand,
  GetBucketLocationCommand,
  PutObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import {
  bold,
  cyan,
  dim,
  green,
  red,
  yellow,
} from "@veolms/fleet-types/terminal";

import { checkAwsCredentials } from "./aws-cli-check.ts";
import { runAwsInfraDestroy } from "./destroy.ts";
import {
  isDockerRunning,
  buildFfprobeLayer,
  publishFfprobeLayer,
  resolveRepoRoot,
  type LambdaArchitecture,
} from "./layer-builder.ts";

// ─── Constants ────────────────────────────────────────────────────────────────

const ROLE_NAME = "VeoLMSWorkerRole";
const INSTANCE_PROFILE_NAME = "VeoLMSWorkerInstanceProfile";
const SECURITY_GROUP_NAME = "VeoLMSWorkerSecurityGroup";
const LAMBDA_FUNCTION_NAME = "veolms-fleet-manager";
const PROBE_LAMBDA_FUNCTION_NAME = "veolms-video-metadata-probe";
const LOG_GROUP_WORKERS = "/veolms/workers";
const LOG_GROUP_FLEET = "/veolms/fleet-manager";
const LOG_GROUP_PROBE = "/aws/lambda/veolms-video-metadata-probe";
const LOG_RETENTION_DAYS = 30;
const LOCALSTACK_DOCKER_AMI_ID = "ami-df5de72bdb3b3";

// ─── Types ────────────────────────────────────────────────────────────────────

type TargetEnv = "aws" | "localstack";
type FleetMode = "serverless" | "serverful";
type StorageProvider = "s3" | "other";
type CredentialMode = "automatic" | "manual";
type BootMode = "fresh" | "ami";
type PricingModel = "spot" | "on-demand";

const DEFAULT_LOCALSTACK_ENDPOINT = "http://localhost.localstack.cloud:4566";

interface SetupAnswers {
  readonly targetEnv: TargetEnv;
  readonly endpointUrl: string | null;
  readonly region: string;
  readonly accountId: string;
  readonly databaseUrl: string;
  readonly fleetMode: FleetMode;
  readonly lambdaArch?: LambdaArchitecture;
  readonly setupProbeLambda?: boolean;
  readonly storageProvider: StorageProvider;
  readonly s3BucketName: string | null;
  readonly s3CredentialMode: CredentialMode | null;
  readonly allowedInstanceTypes: readonly string[];
  readonly bootMode: BootMode;
  readonly amiId: string | null;
  readonly maxWorkers: number;
  readonly workerIdlePollSeconds: number;
  readonly useSpot: boolean;
  readonly allowSsh: boolean;
  readonly keyName: string | null;
  readonly securityGroupId: string | null;
}

interface SetupResult {
  readonly workerRoleArn: string;
  readonly instanceProfileArn: string;
  readonly lambdaFunctionArn: string | null;
  readonly probeLambdaArn?: string | null;
  readonly ffprobeLayerArn?: string | null;
  readonly logGroupWorkers: string;
  readonly logGroupFleet: string;
  readonly s3BucketName: string | null;
  readonly securityGroupId: string | null;
  readonly keyName: string | null;
}

// ─── Terminal Helpers ─────────────────────────────────────────────────────────

function banner(): void {
  console.log(`
${bold(cyan("╔══════════════════════════════════════════════════════╗"))}
${bold(cyan("║"))}        ${bold("VeoLMS AWS Infrastructure Setup")}             ${bold(cyan("║"))}
${bold(cyan("║"))}   Fleet Manager + Media Worker EC2 Transcoding Fleet ${bold(cyan("║"))}
${bold(cyan("╚══════════════════════════════════════════════════════╝"))}
`);
}

function step(n: number, total: number, title: string): void {
  console.log(`\n${bold(cyan(`[${n}/${total}]`))} ${bold(title)}`);
  console.log(dim("─".repeat(52)));
}

function ok(msg: string): void {
  console.log(`  ${green("✔")} ${msg}`);
}
function info(msg: string): void {
  console.log(`  ${cyan("ℹ")} ${msg}`);
}
function warn(msg: string): void {
  console.log(`  ${yellow("⚠")} ${msg}`);
}

// S3 bucket names can't contain characters that matter to a shell (quotes,
// `$`, backticks, etc.), so validating the format up front — before the
// name is ever interpolated into an `aws s3api ...` command below — turns
// a confusing raw shell/AWS-CLI failure into a clear re-prompt.
const S3_BUCKET_NAME_PATTERN = /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/;

function isValidS3BucketName(name: string): boolean {
  return (
    S3_BUCKET_NAME_PATTERN.test(name) &&
    !name.includes("..") &&
    !/^\d+\.\d+\.\d+\.\d+$/.test(name)
  );
}

function isNonInteractive(): boolean {
  return (
    process.argv.includes("--yes") ||
    process.argv.includes("-y") ||
    process.argv.includes("--non-interactive") ||
    process.env["NON_INTERACTIVE"] === "true" ||
    process.env["SETUP_NON_INTERACTIVE"] === "true"
  );
}

async function ask(
  rl: readline.Interface,
  question: string,
  defaultVal?: string,
): Promise<string> {
  const hint = defaultVal !== undefined ? dim(` (default: ${defaultVal})`) : "";
  if (isNonInteractive()) {
    console.log(
      `  ${bold("?")} ${question}${hint}: ${green(defaultVal ?? "")}`,
    );
    return defaultVal ?? "";
  }
  const answer = await rl.question(`  ${bold("?")} ${question}${hint}: `);
  const trimmed = answer.trim();
  return trimmed === "" && defaultVal !== undefined ? defaultVal : trimmed;
}

async function askChoice<T extends string>(
  rl: readline.Interface,
  question: string,
  choices: ReadonlyArray<{ readonly label: string; readonly value: T }>,
  defaultIndex = 0,
): Promise<T> {
  console.log(`  ${bold("?")} ${question}`);
  choices.forEach((c, i) => {
    const marker = i === defaultIndex ? green("→") : " ";
    console.log(`    ${marker} ${bold(`${i + 1}.`)} ${c.label}`);
  });
  if (isNonInteractive()) {
    const chosen = choices[defaultIndex]!.value;
    console.log(`  Auto-selected: ${green(choices[defaultIndex]!.label)}`);
    return chosen;
  }
  const answer = await rl.question(
    `  Enter number ${dim(`(default: ${defaultIndex + 1})`)}: `,
  );
  const trimmed = answer.trim();
  const num = trimmed === "" ? defaultIndex + 1 : parseInt(trimmed, 10);
  const choice = choices[num - 1];
  if (!choice) {
    warn(`Invalid choice. Using default: ${choices[defaultIndex]!.label}`);
    return choices[defaultIndex]!.value;
  }
  return choice.value;
}

// ─── AWS Resource Provisioners ────────────────────────────────────────────────

const TRUST_POLICY = JSON.stringify({
  Version: "2012-10-17",
  Statement: [
    {
      Effect: "Allow",
      Principal: {
        Service: [
          "ec2.amazonaws.com",
          "lambda.amazonaws.com",
          "scheduler.amazonaws.com",
        ],
      },
      Action: "sts:AssumeRole",
    },
  ],
});

async function createRole(iam: IAMClient): Promise<string> {
  info(`Creating IAM role ${bold(ROLE_NAME)}...`);

  const createResult = await iam.send(
    new CreateRoleCommand({
      RoleName: ROLE_NAME,
      AssumeRolePolicyDocument: TRUST_POLICY,
      Description:
        "VeoLMS EC2 Worker Role - CloudWatch Logs, SSM, and optional S3 access.",
      Tags: [
        { Key: "ManagedBy", Value: "veolms-infra-setup" },
        { Key: "Project", Value: "VeoLMS" },
      ],
    }),
  );

  const roleArn = createResult.Role?.Arn;
  if (!roleArn) throw new Error("Failed to get ARN for created IAM role");

  ok(`Created IAM role: ${bold(ROLE_NAME)}`);
  return roleArn;
}

export async function checkOrCreateRole(
  iam: IAMClient,
  useS3: boolean,
  s3BucketName: string | null,
): Promise<string> {
  let roleArn: string;

  try {
    const existing = await iam.send(
      new GetRoleCommand({ RoleName: ROLE_NAME }),
    );
    if (existing.Role?.Arn) {
      ok(`IAM role ${bold(ROLE_NAME)} already exists — reusing.`);
      roleArn = existing.Role.Arn;
      await iam.send(
        new UpdateAssumeRolePolicyCommand({
          RoleName: ROLE_NAME,
          PolicyDocument: TRUST_POLICY,
        }),
      );
    } else {
      roleArn = await createRole(iam);
    }
  } catch {
    roleArn = await createRole(iam);
  }

  // Policies are re-applied on every run (not just at creation) so a
  // reused role from an earlier setup still picks up permission changes
  // — e.g. a new inline statement added since that role was first created.
  // Attach/PutRolePolicy calls are idempotent upserts, safe to repeat.

  // Always attach: CloudWatch Logs + SSM + Lambda basic execution managed
  // policies. These are independent, so run them concurrently.
  await Promise.all([
    iam.send(
      new AttachRolePolicyCommand({
        RoleName: ROLE_NAME,
        PolicyArn: "arn:aws:iam::aws:policy/CloudWatchAgentServerPolicy",
      }),
    ),
    iam.send(
      new AttachRolePolicyCommand({
        RoleName: ROLE_NAME,
        PolicyArn: "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore",
      }),
    ),
    iam.send(
      new AttachRolePolicyCommand({
        RoleName: ROLE_NAME,
        PolicyArn:
          "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole",
      }),
    ),
  ]);
  ok("Attached CloudWatch + SSM + Lambda managed policies");

  // Conditionally add S3 access
  if (useS3 && s3BucketName) {
    const s3Policy = JSON.stringify({
      Version: "2012-10-17",
      Statement: [
        {
          Sid: "VeoLMSS3Access",
          Effect: "Allow",
          Action: [
            "s3:GetObject",
            "s3:PutObject",
            "s3:DeleteObject",
            "s3:ListBucket",
          ],
          Resource: [
            `arn:aws:s3:::${s3BucketName}`,
            `arn:aws:s3:::${s3BucketName}/*`,
          ],
        },
      ],
    });

    await iam.send(
      new PutRolePolicyCommand({
        RoleName: ROLE_NAME,
        PolicyName: "VeoLMSS3BucketAccess",
        PolicyDocument: s3Policy,
      }),
    );
    ok(`Attached S3 inline policy for bucket ${bold(s3BucketName)}`);
  } else {
    info("Skipping S3 policy — storage provider is not S3.");
  }

  // Always attach EC2 worker provisioning and IAM PassRole permissions
  const ec2ControlPolicy = JSON.stringify({
    Version: "2012-10-17",
    Statement: [
      {
        Sid: "EC2WorkerControl",
        Effect: "Allow",
        Action: [
          "ec2:RunInstances",
          "ec2:TerminateInstances",
          "ec2:DescribeInstances",
          "ec2:DescribeInstanceStatus",
          "ec2:DescribeImages",
          "ec2:CreateTags",
          "ec2:RequestSpotInstances",
        ],
        Resource: "*",
      },
      {
        Sid: "PassWorkerRole",
        Effect: "Allow",
        Action: "iam:PassRole",
        Resource: roleArn,
      },
      {
        // Read-only access to AWS's public Debian AMI parameters, so the
        // provider can resolve the current Debian AMI ID at launch time
        // instead of a hardcoded one. These parameters live under an
        // AWS-managed account, hence the account-less resource ARN.
        Sid: "ResolveDebianAmi",
        Effect: "Allow",
        Action: "ssm:GetParameter",
        Resource: "arn:aws:ssm:*::parameter/aws/service/debian/*",
      },
      {
        Sid: "EventBridgeSchedulerControl",
        Effect: "Allow",
        Action: [
          "scheduler:CreateSchedule",
          "scheduler:UpdateSchedule",
          "scheduler:DeleteSchedule",
          "scheduler:GetSchedule",
        ],
        Resource: "*",
      },
      {
        Sid: "EventBridgeLambdaInvoke",
        Effect: "Allow",
        Action: "lambda:InvokeFunction",
        Resource: "*",
      },
      {
        Sid: "CloudWatchLogsFullAccess",
        Effect: "Allow",
        Action: [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents",
          "logs:DescribeLogGroups",
          "logs:DescribeLogStreams",
          "logs:GetLogEvents",
          "logs:FilterLogEvents",
        ],
        Resource: "*",
      },
    ],
  });

  await iam.send(
    new PutRolePolicyCommand({
      RoleName: ROLE_NAME,
      PolicyName: "VeoLMSEC2WorkerManagement",
      PolicyDocument: ec2ControlPolicy,
    }),
  );
  ok("Attached EC2 worker control + PassRole inline policy");

  return roleArn;
}

export async function createInstanceProfile(
  iam: IAMClient,
  roleArn: string,
): Promise<string> {
  try {
    const createProfile = await iam.send(
      new CreateInstanceProfileCommand({
        InstanceProfileName: INSTANCE_PROFILE_NAME,
        Tags: [{ Key: "ManagedBy", Value: "veolms-infra-setup" }],
      }),
    );
    const profileArn =
      createProfile.InstanceProfile?.Arn ??
      `arn:aws:iam::unknown:instance-profile/${INSTANCE_PROFILE_NAME}`;

    await iam.send(
      new AddRoleToInstanceProfileCommand({
        InstanceProfileName: INSTANCE_PROFILE_NAME,
        RoleName: ROLE_NAME,
      }),
    );
    ok(`Created instance profile ${bold(INSTANCE_PROFILE_NAME)}`);
    return profileArn;
  } catch (err: unknown) {
    // AWS SDK v3 puts the exception type on `.name`
    // ("EntityAlreadyExistsException"); LocalStack's message text for this
    // case doesn't contain "EntityAlreadyExists" at all ("Instance Profile
    // ... already exists."), so a message-substring check alone misses it
    // there while still matching real AWS.
    const name = err instanceof Error ? err.name : "";
    const msg = err instanceof Error ? err.message : String(err);
    if (
      name === "EntityAlreadyExistsException" ||
      /already exists/i.test(msg)
    ) {
      ok(
        `Instance profile ${bold(INSTANCE_PROFILE_NAME)} already exists — reusing.`,
      );
      const accountId = roleArn.split(":")[4] ?? "unknown";
      return `arn:aws:iam::${accountId}:instance-profile/${INSTANCE_PROFILE_NAME}`;
    }
    throw err;
  }
}

async function ensureLogGroup(
  cw: CloudWatchLogsClient,
  logGroupName: string,
): Promise<void> {
  const existing = await cw.send(
    new DescribeLogGroupsCommand({ logGroupNamePrefix: logGroupName }),
  );
  const found = existing.logGroups?.find(
    (g) => g.logGroupName === logGroupName,
  );

  if (found) {
    ok(`Log group ${bold(logGroupName)} already exists — reusing.`);
    return;
  }

  await cw.send(new CreateLogGroupCommand({ logGroupName }));
  await cw.send(
    new PutRetentionPolicyCommand({
      logGroupName,
      retentionInDays: LOG_RETENTION_DAYS,
    }),
  );
  ok(
    `Created log group ${bold(logGroupName)} (${LOG_RETENTION_DAYS}d retention)`,
  );
}

async function checkS3Bucket(
  region: string,
  bucketName: string,
): Promise<"exists" | "not-found" | "no-access"> {
  const s3 = new S3Client({ region });
  try {
    await s3.send(new HeadBucketCommand({ Bucket: bucketName }));
    const loc = await s3.send(
      new GetBucketLocationCommand({ Bucket: bucketName }),
    );
    const bucketRegion = loc.LocationConstraint ?? "us-east-1";
    if (bucketRegion !== region) {
      warn(
        `Bucket ${bold(bucketName)} is in region ${bold(bucketRegion)}, you selected ${bold(region)}.`,
      );
      warn(
        "Workers will cross-region to access S3 — consider moving the bucket.",
      );
    }
    return "exists";
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("NoSuchBucket") || msg.includes("404")) return "not-found";
    if (msg.includes("403") || msg.includes("Forbidden")) return "no-access";
    return "not-found";
  }
}

function crc32(buf: Uint8Array): number {
  let crc = -1;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i]!;
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ -1) >>> 0;
}

// Minimal "store" (uncompressed) multi-entry ZIP writer — fallback for
// when the system `zip` CLI isn't available.
function createZipFromBuffers(
  entries: readonly { name: string; content: Uint8Array }[],
): Uint8Array {
  const encoder = new TextEncoder();
  const now = new Date();
  const dosDate =
    (((now.getFullYear() - 1980) << 9) |
      ((now.getMonth() + 1) << 5) |
      now.getDate()) >>>
    0;
  const dosTime = ((now.getHours() << 11) | (now.getMinutes() << 5)) >>> 0;

  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let localSectionLength = 0;

  for (const { name, content } of entries) {
    const fileBytes = encoder.encode(name);
    const fileCrc = crc32(content);
    const localHeaderOffset = localSectionLength;

    const localHeader = new Uint8Array(30 + fileBytes.length);
    const lhView = new DataView(localHeader.buffer);
    lhView.setUint32(0, 0x04034b50, true);
    lhView.setUint16(4, 20, true);
    lhView.setUint16(6, 0, true);
    lhView.setUint16(8, 0, true); // store (no compression)
    lhView.setUint16(10, dosTime, true);
    lhView.setUint16(12, dosDate, true);
    lhView.setUint32(14, fileCrc, true);
    lhView.setUint32(18, content.length, true);
    lhView.setUint32(22, content.length, true);
    lhView.setUint16(26, fileBytes.length, true);
    lhView.setUint16(28, 0, true);
    localHeader.set(fileBytes, 30);

    localParts.push(localHeader, content);
    localSectionLength += localHeader.length + content.length;

    const centralDir = new Uint8Array(46 + fileBytes.length);
    const cdView = new DataView(centralDir.buffer);
    cdView.setUint32(0, 0x02014b50, true);
    cdView.setUint16(4, 20, true);
    cdView.setUint16(6, 20, true);
    cdView.setUint16(8, 0, true);
    cdView.setUint16(10, 0, true);
    cdView.setUint16(12, dosTime, true);
    cdView.setUint16(14, dosDate, true);
    cdView.setUint32(16, fileCrc, true);
    cdView.setUint32(20, content.length, true);
    cdView.setUint32(24, content.length, true);
    cdView.setUint16(28, fileBytes.length, true);
    cdView.setUint32(42, localHeaderOffset, true);
    centralDir.set(fileBytes, 46);
    centralParts.push(centralDir);
  }

  const centralDirLength = centralParts.reduce((sum, p) => sum + p.length, 0);
  const eocd = new Uint8Array(22);
  const eocdView = new DataView(eocd.buffer);
  eocdView.setUint32(0, 0x06054b50, true);
  eocdView.setUint16(8, entries.length, true);
  eocdView.setUint16(10, entries.length, true);
  eocdView.setUint32(12, centralDirLength, true);
  eocdView.setUint32(16, localSectionLength, true);

  const total = new Uint8Array(
    localSectionLength + centralDirLength + eocd.length,
  );
  let offset = 0;
  for (const part of [...localParts, ...centralParts, eocd]) {
    total.set(part, offset);
    offset += part.length;
  }
  return total;
}

export const AWS_RESERVED_ENV_KEYS = new Set([
  "AWS_REGION",
  "AWS_DEFAULT_REGION",
  "_HANDLER",
  "_X_AMZN_TRACE_ID",
  "AWS_LAMBDA_FUNCTION_NAME",
  "AWS_LAMBDA_FUNCTION_VERSION",
  "AWS_LAMBDA_LOG_GROUP_NAME",
  "AWS_LAMBDA_LOG_STREAM_NAME",
  "AWS_LAMBDA_RUNTIME_API",
  "AWS_EXECUTION_ENV",
  "LAMBDA_TASK_ROOT",
  "LAMBDA_RUNTIME_DIR",
]);

/**
 * Filters out AWS Lambda reserved environment variables that cannot be modified via the API.
 */
export function sanitizeLambdaEnvVars(
  vars: Readonly<Record<string, string>>,
): Record<string, string> {
  const sanitized: Record<string, string> = {};
  for (const [key, value] of Object.entries(vars)) {
    if (
      !AWS_RESERVED_ENV_KEYS.has(key) &&
      value !== undefined &&
      value !== null
    ) {
      sanitized[key] = String(value);
    }
  }
  return sanitized;
}

function buildLambdaBundleZip(): Uint8Array {
  const repoRoot = resolveRepoRoot();
  const universalSource = path.join(
    repoRoot,
    "apps/fleet-manager/src/entrypoints/serverless.ts",
  );
  const lambdaSource = fsSync.existsSync(universalSource)
    ? universalSource
    : path.join(repoRoot, "packages/fleet-provider-aws/src/lambda.ts");
  const distDir = path.join(repoRoot, "dist/lambda");
  if (!fsSync.existsSync(distDir)) {
    fsSync.mkdirSync(distDir, { recursive: true });
  }
  const outfile = path.join(distDir, "index.js");
  esbuild.buildSync({
    entryPoints: [lambdaSource],
    bundle: true,
    platform: "node",
    target: "node22",
    format: "cjs",
    outfile,
    logLevel: "silent",
  });

  const jsContent = fsSync.readFileSync(outfile);

  // Attempt to use system zip CLI if available
  try {
    const zipPath = path.join(distDir, "function.zip");
    execSync(`cd "${distDir}" && zip -q -9 function.zip index.js`, {
      stdio: "pipe",
    });
    if (fsSync.existsSync(zipPath)) {
      return fsSync.readFileSync(zipPath);
    }
  } catch {
    // Fall back to pure JS zip generator with valid CRC32
  }

  return createZipFromBuffers([{ name: "index.js", content: jsContent }]);
}

export async function ensureSecurityGroup(
  ec2: EC2Client,
  allowSsh: boolean,
): Promise<string | null> {
  if (!allowSsh) return null;

  try {
    const existing = await ec2.send(
      new DescribeSecurityGroupsCommand({
        GroupNames: [SECURITY_GROUP_NAME],
      }),
    );
    const sgId = existing.SecurityGroups?.[0]?.GroupId;
    if (sgId) {
      ok(
        `Security group ${bold(SECURITY_GROUP_NAME)} (${bold(sgId)}) already exists — reusing.`,
      );
      return sgId;
    }
  } catch {
    // Doesn't exist, proceed to create
  }

  try {
    info(
      `Creating EC2 Security Group ${bold(SECURITY_GROUP_NAME)} with SSH (port 22) enabled...`,
    );
    const createRes = await ec2.send(
      new CreateSecurityGroupCommand({
        GroupName: SECURITY_GROUP_NAME,
        Description:
          "VeoLMS EC2 Worker Security Group - allows SSH and outbound traffic",
        TagSpecifications: [
          {
            ResourceType: "security-group",
            Tags: [
              { Key: "ManagedBy", Value: "veolms-infra-setup" },
              { Key: "Project", Value: "VeoLMS" },
              { Key: "Name", Value: SECURITY_GROUP_NAME },
            ],
          },
        ],
      }),
    );

    const sgId = createRes.GroupId;
    if (!sgId) {
      throw new Error("Failed to get GroupId for created Security Group");
    }

    // Authorize SSH ingress (port 22)
    try {
      await ec2.send(
        new AuthorizeSecurityGroupIngressCommand({
          GroupId: sgId,
          IpPermissions: [
            {
              IpProtocol: "tcp",
              FromPort: 22,
              ToPort: 22,
              IpRanges: [
                { CidrIp: "0.0.0.0/0", Description: "Allow SSH inbound" },
              ],
            },
          ],
        }),
      );
    } catch {
      // Ignore if rule already exists
    }

    ok(
      `Created Security Group: ${bold(SECURITY_GROUP_NAME)} (${bold(sgId)}) with SSH port 22 open.`,
    );
    return sgId;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    warn(`Could not create Security Group automatically: ${msg}`);
    return null;
  }
}

export async function checkKeyPair(
  ec2: EC2Client,
  keyName: string,
): Promise<boolean> {
  if (!keyName) return false;
  try {
    const isId = keyName.startsWith("key-");
    const res = await ec2.send(
      isId
        ? new DescribeKeyPairsCommand({ KeyPairIds: [keyName] })
        : new DescribeKeyPairsCommand({ KeyNames: [keyName] }),
    );
    return Boolean(res.KeyPairs && res.KeyPairs.length > 0);
  } catch {
    return false;
  }
}

export async function buildAndUploadWorkerBundle(
  s3BucketName: string,
  region: string,
): Promise<boolean> {
  try {
    const repoRoot = resolveRepoRoot();
    const workerSource = path.join(repoRoot, "apps/media-worker/src/index.ts");
    if (!fsSync.existsSync(workerSource)) {
      warn(
        `Media worker source not found at ${workerSource} — skipping bundle upload.`,
      );
      return false;
    }

    const distDir = path.join(repoRoot, "dist/worker");
    if (!fsSync.existsSync(distDir)) {
      fsSync.mkdirSync(distDir, { recursive: true });
    }
    const outfile = path.join(distDir, "media-worker.js");
    esbuild.buildSync({
      entryPoints: [workerSource],
      bundle: true,
      platform: "node",
      target: "node22",
      format: "cjs",
      outfile,
      logLevel: "silent",
    });

    const fileContent = fsSync.readFileSync(outfile);
    const sizeKb = (fileContent.length / 1024).toFixed(1);

    // Also write to apps/media-worker/dist for local availability
    const appDistDir = path.join(repoRoot, "apps/media-worker/dist");
    if (!fsSync.existsSync(appDistDir)) {
      fsSync.mkdirSync(appDistDir, { recursive: true });
    }
    fsSync.writeFileSync(path.join(appDistDir, "media-worker.js"), fileContent);

    // 1. Upload via AWS SDK v3 S3Client
    let uploaded = false;
    try {
      const s3 = new S3Client({ region });
      await s3.send(
        new PutObjectCommand({
          Bucket: s3BucketName,
          Key: "bundles/media-worker.js",
          Body: fileContent,
          ContentType: "application/javascript",
        }),
      );

      // Verify upload exists on S3
      await s3.send(
        new HeadObjectCommand({
          Bucket: s3BucketName,
          Key: "bundles/media-worker.js",
        }),
      );
      uploaded = true;
    } catch (sdkErr: unknown) {
      const sdkMsg = sdkErr instanceof Error ? sdkErr.message : String(sdkErr);
      warn(`S3 SDK upload attempt notice: ${sdkMsg}`);
    }

    // 2. Fallback via aws s3 cp if SDK upload didn't succeed
    if (!uploaded) {
      execSync(
        `aws s3 cp "${outfile}" "s3://${s3BucketName}/bundles/media-worker.js" --region "${region}"`,
        { stdio: "pipe" },
      );
      uploaded = true;
    }

    if (uploaded) {
      ok(
        `Bundled and uploaded media worker (${sizeKb} KB) to ${bold(`s3://${s3BucketName}/bundles/media-worker.js`)}`,
      );
      return true;
    }
    return false;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    warn(`Could not upload worker bundle to S3: ${msg}`);
    return false;
  }
}

async function updateExistingLambda(
  lambda: LambdaClient,
  roleArn: string,
  envVars: Readonly<Record<string, string>>,
  functionArn: string,
): Promise<string> {
  ok(
    `Lambda function ${bold(LAMBDA_FUNCTION_NAME)} already exists — updating.`,
  );

  const lambdaZip = buildLambdaBundleZip();
  await lambda.send(
    new UpdateFunctionCodeCommand({
      FunctionName: LAMBDA_FUNCTION_NAME,
      ZipFile: lambdaZip,
    }),
  );
  await waitUntilFunctionUpdated(lambda, LAMBDA_FUNCTION_NAME);

  await lambda.send(
    new UpdateFunctionConfigurationCommand({
      FunctionName: LAMBDA_FUNCTION_NAME,
      Role: roleArn,
      Environment: {
        Variables: sanitizeLambdaEnvVars({
          LOG_LEVEL: "info",
          FLEET_MODE: "serverless",
          ...envVars,
        }),
      },
    }),
  );
  ok(`Updated code + configuration for ${bold(LAMBDA_FUNCTION_NAME)}`);
  return functionArn;
}

async function waitUntilFunctionUpdated(
  lambda: LambdaClient,
  functionName: string = LAMBDA_FUNCTION_NAME,
): Promise<void> {
  for (let attempt = 0; attempt < 15; attempt++) {
    const res = await lambda.send(
      new GetFunctionCommand({ FunctionName: functionName }),
    );
    if (res.Configuration?.LastUpdateStatus !== "InProgress") return;
    await new Promise((r) => setTimeout(r, 2000));
  }
}

async function setupLambda(
  region: string,
  roleArn: string,
  envVars: Readonly<Record<string, string>>,
  arch: "arm64" | "x86_64" = "arm64",
): Promise<string | null> {
  const lambda = new LambdaClient({ region });
  const architecture =
    arch === "x86_64" ? Architecture.x86_64 : Architecture.arm64;

  try {
    const existing = await lambda.send(
      new GetFunctionCommand({ FunctionName: LAMBDA_FUNCTION_NAME }),
    );
    if (existing.Configuration?.FunctionArn) {
      return await updateExistingLambda(
        lambda,
        roleArn,
        envVars,
        existing.Configuration.FunctionArn,
      );
    }
  } catch {
    // Doesn't exist — create it
  }

  info(
    `Building and creating Lambda function ${bold(LAMBDA_FUNCTION_NAME)} (${arch})...`,
  );
  const lambdaZip = buildLambdaBundleZip();

  const maxRetries = 5;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const created = await lambda.send(
        new CreateFunctionCommand({
          FunctionName: LAMBDA_FUNCTION_NAME,
          Runtime: Runtime.nodejs22x,
          Role: roleArn,
          Handler: "index.handler",
          Code: { ZipFile: lambdaZip },
          PackageType: PackageType.Zip,
          Architectures: [architecture],
          Description:
            "VeoLMS Fleet Manager - serverless control plane for video transcoding jobs",
          Timeout: 900,
          MemorySize: 512,
          Environment: {
            Variables: sanitizeLambdaEnvVars({
              LOG_LEVEL: "info",
              FLEET_MODE: "serverless",
              ...envVars,
            }),
          },
          Tags: {
            ManagedBy: "veolms-infra-setup",
            Project: "VeoLMS",
          },
          LoggingConfig: {
            LogFormat: "JSON",
            LogGroup: LOG_GROUP_FLEET,
          },
        }),
      );
      const fnArn = created.FunctionArn ?? null;
      if (fnArn) ok(`Created Lambda function ${bold(LAMBDA_FUNCTION_NAME)}`);
      return fnArn;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const name = err instanceof Error ? err.name : "";
      if (
        (msg.includes("cannot be assumed by Lambda") ||
          name === "InvalidParameterValueException") &&
        attempt < maxRetries
      ) {
        info(
          `Waiting for IAM role propagation (attempt ${attempt}/${maxRetries})...`,
        );
        await new Promise((r) => setTimeout(r, 4000));
        continue;
      }
      warn(`Could not create Lambda function: ${msg}`);
      warn(
        "Deploy the fleet-manager Lambda manually after building the bundle.",
      );
      return null;
    }
  }
  return null;
}

export function buildProbeLambdaBundleZip(): Uint8Array {
  const repoRoot = resolveRepoRoot();
  const probeSource = path.join(
    repoRoot,
    "packages/fleet-provider-aws/src/probe-lambda.ts",
  );
  const distDir = path.join(repoRoot, "dist/probe-lambda");
  if (!fsSync.existsSync(distDir)) {
    fsSync.mkdirSync(distDir, { recursive: true });
  }
  const outfile = path.join(distDir, "index.js");
  esbuild.buildSync({
    entryPoints: [probeSource],
    bundle: true,
    platform: "node",
    target: "node22",
    format: "cjs",
    outfile,
    logLevel: "silent",
  });

  const jsContent = fsSync.readFileSync(outfile);

  try {
    const zipPath = path.join(distDir, "function.zip");
    execSync(`cd "${distDir}" && zip -q -9 function.zip index.js`, {
      stdio: "pipe",
    });
    if (fsSync.existsSync(zipPath)) {
      return fsSync.readFileSync(zipPath);
    }
  } catch {
    // Fall back to pure JS zip generator with valid CRC32
  }

  return createZipFromBuffers([{ name: "index.js", content: jsContent }]);
}

async function updateExistingProbeLambda(
  lambda: LambdaClient,
  roleArn: string,
  layerArn: string | null,
  envVars: Readonly<Record<string, string>>,
  functionArn: string,
): Promise<string> {
  ok(
    `Lambda function ${bold(PROBE_LAMBDA_FUNCTION_NAME)} already exists — updating.`,
  );

  const lambdaZip = buildProbeLambdaBundleZip();
  await lambda.send(
    new UpdateFunctionCodeCommand({
      FunctionName: PROBE_LAMBDA_FUNCTION_NAME,
      ZipFile: lambdaZip,
    }),
  );
  await waitUntilFunctionUpdated(lambda, PROBE_LAMBDA_FUNCTION_NAME);

  await lambda.send(
    new UpdateFunctionConfigurationCommand({
      FunctionName: PROBE_LAMBDA_FUNCTION_NAME,
      Role: roleArn,
      Layers: layerArn ? [layerArn] : undefined,
      Environment: {
        Variables: sanitizeLambdaEnvVars({
          LOG_LEVEL: "info",
          FFPROBE_PATH: "/opt/bin/ffprobe",
          ...envVars,
        }),
      },
    }),
  );
  ok(`Updated code + configuration for ${bold(PROBE_LAMBDA_FUNCTION_NAME)}`);
  return functionArn;
}

async function setupProbeLambda(
  region: string,
  roleArn: string,
  layerArn: string | null,
  arch: "arm64" | "x86_64",
  envVars: Readonly<Record<string, string>>,
): Promise<string | null> {
  const lambda = new LambdaClient({ region });
  const architecture =
    arch === "x86_64" ? Architecture.x86_64 : Architecture.arm64;

  try {
    const existing = await lambda.send(
      new GetFunctionCommand({ FunctionName: PROBE_LAMBDA_FUNCTION_NAME }),
    );
    if (existing.Configuration?.FunctionArn) {
      return await updateExistingProbeLambda(
        lambda,
        roleArn,
        layerArn,
        envVars,
        existing.Configuration.FunctionArn,
      );
    }
  } catch {
    // Doesn't exist — create it
  }

  info(
    `Building and creating Lambda function ${bold(PROBE_LAMBDA_FUNCTION_NAME)} (${arch})...`,
  );
  const lambdaZip = buildProbeLambdaBundleZip();

  const maxRetries = 5;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const created = await lambda.send(
        new CreateFunctionCommand({
          FunctionName: PROBE_LAMBDA_FUNCTION_NAME,
          Runtime: Runtime.nodejs22x,
          Role: roleArn,
          Handler: "index.handler",
          Code: { ZipFile: lambdaZip },
          PackageType: PackageType.Zip,
          Architectures: [architecture],
          Layers: layerArn ? [layerArn] : undefined,
          Description:
            "VeoLMS Video Metadata Probe Lambda (extracts metadata via ffprobe layer and invokes fleet manager)",
          Timeout: 60,
          MemorySize: 512,
          Environment: {
            Variables: sanitizeLambdaEnvVars({
              LOG_LEVEL: "info",
              FFPROBE_PATH: "/opt/bin/ffprobe",
              ...envVars,
            }),
          },
          Tags: {
            ManagedBy: "veolms-infra-setup",
            Project: "VeoLMS",
          },
          LoggingConfig: {
            LogFormat: "JSON",
            LogGroup: LOG_GROUP_PROBE,
          },
        }),
      );
      const fnArn = created.FunctionArn ?? null;
      if (fnArn)
        ok(`Created Lambda function ${bold(PROBE_LAMBDA_FUNCTION_NAME)}`);
      return fnArn;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (attempt < maxRetries) {
        info(
          `Waiting for IAM role propagation (attempt ${attempt}/${maxRetries})...`,
        );
        await new Promise((r) => setTimeout(r, 4000));
        continue;
      }
      warn(`Could not create probe Lambda function: ${msg}`);
      return null;
    }
  }
  return null;
}

// ─── Env File Writer ──────────────────────────────────────────────────────────

async function writeEnvFile(
  filePath: string,
  vars: Readonly<Record<string, string>>,
): Promise<void> {
  const lines = [
    "# Generated by VeoLMS AWS Infrastructure Setup",
    `# Run: pnpm fleet:infra  to regenerate`,
    "",
    ...Object.entries(vars).map(([k, v]) => `${k}="${v}"`),
    "",
  ];
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, lines.join("\n"), "utf-8");
  ok(`Written ${bold(path.relative(process.cwd(), filePath))}`);
}

async function generateEnvFiles(
  answers: SetupAnswers,
  result: SetupResult,
  repoRoot: string,
): Promise<void> {
  // apps/fleet-manager/.env
  const fleetEnv: Record<string, string> = {
    DATABASE_URL: answers.databaseUrl,
    AWS_REGION: answers.region,
    FLEET_MODE: answers.fleetMode,
    FLEET_PROVIDER: "aws",
    PROVIDER: "aws",
    EC2_IAM_INSTANCE_PROFILE: INSTANCE_PROFILE_NAME,
    EC2_USE_SPOT: String(answers.useSpot),
    EC2_BOOT_MODE: answers.bootMode,
    MAX_WORKERS: String(answers.maxWorkers),
    EC2_ALLOWED_INSTANCE_TYPES: answers.allowedInstanceTypes.join(","),
    WORKER_LOG_GROUP: result.logGroupWorkers,
    FLEET_LOG_GROUP: result.logGroupFleet,
    STORAGE_PROVIDER: answers.storageProvider,
  };

  if (answers.s3BucketName) {
    fleetEnv["S3_BUCKET_NAME"] = answers.s3BucketName;
    fleetEnv["S3_BUCKET"] = answers.s3BucketName;
  }
  if (result.securityGroupId) {
    fleetEnv["SECURITY_GROUP_IDS"] = result.securityGroupId;
  }
  if (result.keyName) {
    fleetEnv["KEY_NAME"] = result.keyName;
  }
  if (result.lambdaFunctionArn) {
    fleetEnv["LAMBDA_FUNCTION_ARN"] = result.lambdaFunctionArn;
  }
  if (answers.lambdaArch) {
    fleetEnv["LAMBDA_ARCHITECTURE"] = answers.lambdaArch;
  }
  if (result.probeLambdaArn) {
    fleetEnv["PROBE_LAMBDA_ARN"] = result.probeLambdaArn;
    fleetEnv["PROBE_LAMBDA_NAME"] = PROBE_LAMBDA_FUNCTION_NAME;
  }
  if (result.ffprobeLayerArn) {
    fleetEnv["FFPROBE_LAYER_ARN"] = result.ffprobeLayerArn;
  }
  if (answers.targetEnv === "localstack" && answers.endpointUrl) {
    fleetEnv["AWS_ENDPOINT_URL"] = answers.endpointUrl;
    fleetEnv["EC2_VM_MANAGER"] = "docker";
    fleetEnv["AMI_ID"] = LOCALSTACK_DOCKER_AMI_ID;
    fleetEnv["AWS_ACCESS_KEY_ID"] = "test";
    fleetEnv["AWS_SECRET_ACCESS_KEY"] = "test";
  } else if (answers.amiId) {
    // writeEnvFile() below replaces the whole file, not just the keys
    // listed here — without this, re-running the wizard for any reason
    // would silently erase an AMI_ID that `pnpm fleet:build-ami` had
    // already written.
    fleetEnv["AMI_ID"] = answers.amiId;
  }

  await writeEnvFile(
    path.join(repoRoot, "apps", "fleet-manager", ".env"),
    fleetEnv,
  );

  // apps/media-worker/.env
  const workerEnv: Record<string, string> = {
    DATABASE_URL: answers.databaseUrl,
    AWS_REGION: answers.region,
    FLEET_PROVIDER: "aws",
    WORKER_LOG_GROUP: result.logGroupWorkers,
    STORAGE_PROVIDER: answers.storageProvider,
    WORKER_IDLE_POLL_SECONDS: String(answers.workerIdlePollSeconds),
  };

  if (answers.s3BucketName) {
    workerEnv["S3_BUCKET_NAME"] = answers.s3BucketName;
    workerEnv["S3_BUCKET"] = answers.s3BucketName;
    if (answers.s3CredentialMode === "automatic") {
      workerEnv["S3_USE_INSTANCE_ROLE"] = "true";
    }
  }
  if (result.keyName) {
    workerEnv["KEY_NAME"] = result.keyName;
  }
  if (answers.targetEnv === "localstack" && answers.endpointUrl) {
    workerEnv["AWS_ENDPOINT_URL"] = answers.endpointUrl;
    workerEnv["AWS_ACCESS_KEY_ID"] = "test";
    workerEnv["AWS_SECRET_ACCESS_KEY"] = "test";
  }

  await writeEnvFile(
    path.join(repoRoot, "apps", "media-worker", ".env"),
    workerEnv,
  );
}

// ─── Environment Helpers ───────────────────────────────────────────────────────

function parseEnvFile(filePath: string): Record<string, string> {
  if (!fsSync.existsSync(filePath)) return {};
  try {
    const content = fsSync.readFileSync(filePath, "utf-8");
    const result: Record<string, string> = {};
    for (const rawLine of content.split("\n")) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const eqIdx = line.indexOf("=");
      if (eqIdx === -1) continue;
      const key = line.slice(0, eqIdx).trim();
      let value = line.slice(eqIdx + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      result[key] = value;
    }
    return result;
  } catch {
    return {};
  }
}

function parseSetupCliArgs(): Partial<SetupAnswers> & {
  action?: "setup" | "update" | "destroy";
} {
  const result: Record<string, unknown> = {};
  for (const arg of process.argv.slice(2)) {
    const eqIdx = arg.indexOf("=");
    const val = eqIdx >= 0 ? arg.slice(eqIdx + 1).trim() : "";
    if (arg.startsWith("--region=")) {
      result.region = val;
    } else if (arg.startsWith("--bucket=") || arg.startsWith("--s3-bucket=")) {
      result.s3BucketName = val;
      result.storageProvider = "s3";
    } else if (arg.startsWith("--db=") || arg.startsWith("--database-url=")) {
      result.databaseUrl = val;
    } else if (arg.startsWith("--mode=") || arg.startsWith("--fleet-mode=")) {
      result.fleetMode = val as FleetMode;
    } else if (arg === "--update") {
      result.action = "update";
    } else if (arg === "--destroy") {
      result.action = "destroy";
    } else if (arg === "--setup") {
      result.action = "setup";
    }
  }
  return result as Partial<SetupAnswers> & {
    action?: "setup" | "update" | "destroy";
  };
}

function loadExistingConfig(repoRoot: string): Partial<SetupAnswers> {
  const fleetEnvPath = path.join(repoRoot, "apps", "fleet-manager", ".env");
  const workerEnvPath = path.join(repoRoot, "apps", "media-worker", ".env");
  const fleetEnv = parseEnvFile(fleetEnvPath);
  const workerEnv = parseEnvFile(workerEnvPath);
  const cliArgs = parseSetupCliArgs();
  const combined: Record<string, string | undefined> = {
    ...workerEnv,
    ...fleetEnv,
    ...process.env,
  };
  if (cliArgs.region) combined["AWS_REGION"] = cliArgs.region;
  if (cliArgs.s3BucketName) {
    combined["S3_BUCKET"] = cliArgs.s3BucketName;
    combined["S3_BUCKET_NAME"] = cliArgs.s3BucketName;
    combined["STORAGE_PROVIDER"] = "s3";
  }
  if (cliArgs.databaseUrl) combined["DATABASE_URL"] = cliArgs.databaseUrl;
  if (cliArgs.fleetMode) combined["FLEET_MODE"] = cliArgs.fleetMode;

  const targetEnv: TargetEnv = combined["AWS_ENDPOINT_URL"]
    ? "localstack"
    : "aws";
  const endpointUrl = combined["AWS_ENDPOINT_URL"] || null;
  const region = combined["AWS_REGION"] || "us-east-1";
  const fleetMode: FleetMode =
    combined["FLEET_MODE"] === "serverful" ? "serverful" : "serverless";
  const storageProvider: StorageProvider =
    combined["STORAGE_PROVIDER"] === "other" ||
    combined["STORAGE_PROVIDER"] === "local"
      ? "other"
      : "s3";
  const s3BucketName = resolveS3BucketName(combined);
  const s3CredentialMode: CredentialMode =
    combined["S3_USE_INSTANCE_ROLE"] === "true" ? "automatic" : "manual";
  const allowedInstanceTypes = combined["EC2_ALLOWED_INSTANCE_TYPES"]
    ? combined["EC2_ALLOWED_INSTANCE_TYPES"]
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : ["c7g.xlarge", "c7g.2xlarge", "c6i.xlarge"];
  const bootMode: BootMode =
    combined["EC2_BOOT_MODE"] === "ami" || combined["AMI_ID"] ? "ami" : "fresh";
  const amiId = combined["AMI_ID"] || null;
  const maxWorkers = parseInt(combined["MAX_WORKERS"] || "8", 10) || 8;
  const workerIdlePollSeconds =
    parseInt(combined["WORKER_IDLE_POLL_SECONDS"] || "15", 10) || 15;
  const useSpot = combined["EC2_USE_SPOT"] !== "false";
  const databaseUrl =
    combined["DATABASE_URL"] ||
    "postgresql://veolms:veolms@localhost:5433/veolms";
  const allowSsh = combined["ALLOW_SSH"] !== "false";
  const keyName = allowSsh
    ? combined["EC2_KEY_NAME"] || combined["KEY_NAME"] || null
    : null;
  const securityGroupId = allowSsh
    ? combined["EC2_SECURITY_GROUP_IDS"] ||
      combined["SECURITY_GROUP_IDS"] ||
      combined["EC2_SECURITY_GROUP_ID"] ||
      null
    : null;
  const lambdaArch: LambdaArchitecture =
    combined["LAMBDA_ARCHITECTURE"] === "x86_64" ? "x86_64" : "arm64";
  const setupProbeLambda = combined["SETUP_PROBE_LAMBDA"] !== "false";

  return {
    targetEnv,
    endpointUrl,
    region,
    fleetMode,
    lambdaArch,
    setupProbeLambda,
    storageProvider,
    s3BucketName,
    s3CredentialMode,
    allowedInstanceTypes,
    bootMode,
    amiId,
    maxWorkers,
    workerIdlePollSeconds,
    useSpot,
    databaseUrl,
    keyName,
    securityGroupId,
    allowSsh,
  };
}

// ─── Setup Flow ───────────────────────────────────────────────────────────────

async function runSetupFlow(
  rl: readline.Interface,
  repoRoot: string,
  initialDefaults?: Partial<SetupAnswers>,
): Promise<void> {
  const TOTAL_STEPS = 16;

  // ── Step 1: Target Environment ─────────────────────────────────────────────
  step(1, TOTAL_STEPS, "Target Environment");
  const defaultTargetEnv = initialDefaults?.targetEnv ?? "aws";
  const targetEnv = await askChoice(
    rl,
    "Where should this provision resources?",
    [
      { label: "Real AWS (production, billed)", value: "aws" as TargetEnv },
      {
        label: "LocalStack (local testing, free — requires LocalStack running)",
        value: "localstack" as TargetEnv,
      },
    ],
    defaultTargetEnv === "localstack" ? 1 : 0,
  );

  let endpointUrl: string | null = null;
  if (targetEnv === "aws") {
    delete process.env.AWS_ENDPOINT_URL;
    if (process.env.AWS_ACCESS_KEY_ID === "test") {
      delete process.env.AWS_ACCESS_KEY_ID;
    }
    if (process.env.AWS_SECRET_ACCESS_KEY === "test") {
      delete process.env.AWS_SECRET_ACCESS_KEY;
    }
  } else if (targetEnv === "localstack") {
    const defaultEndpoint =
      initialDefaults?.endpointUrl ?? DEFAULT_LOCALSTACK_ENDPOINT;
    endpointUrl = await ask(rl, "LocalStack endpoint URL", defaultEndpoint);
    process.env.AWS_ENDPOINT_URL = endpointUrl;
    process.env.AWS_ACCESS_KEY_ID ??= "test";
    process.env.AWS_SECRET_ACCESS_KEY ??= "test";
    process.env.EC2_VM_MANAGER = "docker";
    warn(
      "LocalStack Docker VM mode requires EC2_VM_MANAGER=docker and the " +
        "container-runtime socket mounted at /var/run/docker.sock.",
    );
  }

  // ── Step 2: Region ──────────────────────────────────────────────────────────
  step(2, TOTAL_STEPS, "AWS Region");
  const defaultRegion = initialDefaults?.region ?? "us-east-1";
  const region = await ask(rl, "Which AWS region?", defaultRegion);

  // ── AWS Credential Pre-flight Check ────────────────────────────────────────
  info("Checking AWS credentials...");
  const identity = await checkAwsCredentials(region);
  const accountId = identity.accountId;

  // ── Step 3: Fleet Manager Mode ─────────────────────────────────────────────
  step(3, TOTAL_STEPS, "Fleet Manager Mode");
  const defaultFleetMode = initialDefaults?.fleetMode ?? "serverless";
  const fleetMode = await askChoice(
    rl,
    "How should Fleet Manager run?",
    [
      {
        label: "Serverless — AWS Lambda (event-driven, scales to zero)",
        value: "serverless" as FleetMode,
      },
      {
        label: "Serverful — Long-running daemon on EC2 / server (always-on)",
        value: "serverful" as FleetMode,
      },
    ],
    defaultFleetMode === "serverful" ? 1 : 0,
  );
  info(
    fleetMode === "serverless"
      ? "Will set up Lambda function + CloudWatch log group."
      : "Will not set up Lambda — daemon runs as a persistent process.",
  );

  let lambdaArch: LambdaArchitecture = initialDefaults?.lambdaArch ?? "arm64";
  let shouldSetupProbeLambda = initialDefaults?.setupProbeLambda ?? true;

  if (fleetMode === "serverless") {
    // ── Step 4: Lambda CPU Architecture ──────────────────────────────────────
    step(4, TOTAL_STEPS, "Lambda Architecture");
    lambdaArch = await askChoice(
      rl,
      "Which CPU Architecture for Lambda functions?",
      [
        {
          label: "ARM64 (AWS Graviton — faster, cheaper, recommended)",
          value: "arm64" as LambdaArchitecture,
        },
        {
          label: "x86_64 (Standard Intel/AMD 64-bit)",
          value: "x86_64" as LambdaArchitecture,
        },
      ],
      initialDefaults?.lambdaArch === "x86_64" ? 1 : 0,
    );
    ok(
      `Selected Lambda Architecture: ${bold(lambdaArch)} (applied to all Lambdas)`,
    );

    // ── Step 5: Video Metadata Probe Lambda ──────────────────────────────────
    step(5, TOTAL_STEPS, "Video Metadata Probe Lambda");
    info(
      "The Video Metadata Probe Lambda uses a standalone ffprobe layer to probe video " +
        "duration, resolution, and codecs, and forward enriched payloads to the Fleet Manager.",
    );
    const probeChoice = await askChoice(
      rl,
      "Do you also want to setup the Video Metadata Probe Lambda?",
      [
        {
          label:
            "Yes — Build ffprobe layer via Docker and deploy veolms-video-metadata-probe (recommended)",
          value: "yes",
        },
        {
          label: "No — Skip probe Lambda (direct triggers only)",
          value: "no",
        },
      ],
      initialDefaults?.setupProbeLambda === false ? 1 : 0,
    );
    shouldSetupProbeLambda = probeChoice === "yes";
    ok(
      shouldSetupProbeLambda
        ? "Video Metadata Probe Lambda enabled."
        : "Video Metadata Probe Lambda skipped.",
    );
  } else {
    step(4, TOTAL_STEPS, "Lambda Architecture");
    info("Serverful mode selected — skipping Lambda architecture setup.");
    step(5, TOTAL_STEPS, "Video Metadata Probe Lambda");
    info("Serverful mode selected — skipping serverless probe Lambda setup.");
    shouldSetupProbeLambda = false;
  }

  // ── Step 6: Storage Provider ───────────────────────────────────────────────
  step(6, TOTAL_STEPS, "Video Storage Provider");
  const defaultStorageProvider = initialDefaults?.storageProvider ?? "s3";
  const storageProvider = await askChoice(
    rl,
    "Where will transcoded HLS output be stored?",
    [
      { label: "AWS S3 (recommended)", value: "s3" as StorageProvider },
      {
        label: "Other / local (no S3 permission added to EC2 role)",
        value: "other" as StorageProvider,
      },
    ],
    defaultStorageProvider === "other" ? 1 : 0,
  );

  let s3BucketName: string | null = null;
  let s3CredentialMode: CredentialMode | null = null;

  if (storageProvider === "s3") {
    const defaultBucketMode: "existing" | "create" =
      initialDefaults?.s3BucketName ? "existing" : "create";
    const bucketMode = await askChoice<"existing" | "create">(
      rl,
      "S3 bucket for transcoded HLS output?",
      [
        { label: "Use an existing bucket", value: "existing" },
        { label: "Create a new bucket", value: "create" },
      ],
      defaultBucketMode === "existing" ? 0 : 1,
    );

    let defaultBucket = initialDefaults?.s3BucketName ?? "";
    while (true) {
      const bucketInput = await ask(
        rl,
        bucketMode === "create"
          ? "New S3 bucket name (leave empty to skip)"
          : "Existing S3 bucket name (leave empty to skip)",
        defaultBucket || undefined,
      );

      if (!bucketInput) {
        s3BucketName = null;
        break;
      }

      if (!isValidS3BucketName(bucketInput)) {
        warn(
          `"${bucketInput}" is not a valid S3 bucket name — use 3-63 lowercase letters, digits, dots, or hyphens, starting and ending with a letter or digit.`,
        );
        defaultBucket = "";
        continue;
      }

      info(`Checking bucket ${bold(bucketInput)}...`);
      const bucketStatus = await checkS3Bucket(region, bucketInput);

      if (bucketMode === "existing") {
        if (bucketStatus === "exists") {
          s3BucketName = bucketInput;
          ok(
            `Bucket ${bold(s3BucketName)} found and accessible — will grant EC2 role access.`,
          );
          break;
        } else if (bucketStatus === "no-access") {
          warn(
            `Bucket ${bold(bucketInput)} exists but is owned by another AWS account or inaccessible (Access Denied).`,
          );
          defaultBucket = "";
          continue;
        } else {
          warn(
            `Bucket ${bold(bucketInput)} does not exist — nothing was created, since you chose to use an existing bucket.`,
          );
          info(
            "Enter the correct existing bucket name, or leave empty to skip.",
          );
          defaultBucket = "";
          continue;
        }
      }

      // bucketMode === "create" — never silently reuse an existing bucket
      if (bucketStatus === "exists" || bucketStatus === "no-access") {
        warn(
          `Bucket ${bold(bucketInput)} already exists${bucketStatus === "no-access" ? " (owned by another AWS account)" : ""} — S3 bucket names are globally unique across all AWS accounts.`,
        );
        info("Please enter a different name for the new bucket.");
        defaultBucket = "";
        continue;
      }

      info(
        `Bucket ${bold(bucketInput)} does not exist. Creating in ${region}...`,
      );
      try {
        if (region === "us-east-1") {
          execSync(
            `aws s3api create-bucket --bucket "${bucketInput}" --region "${region}"`,
            { stdio: "pipe" },
          );
        } else {
          execSync(
            `aws s3api create-bucket --bucket "${bucketInput}" --region "${region}" --create-bucket-configuration LocationConstraint="${region}"`,
            { stdio: "pipe" },
          );
        }
        execSync(
          `aws s3api put-public-access-block --bucket "${bucketInput}" --public-access-block-configuration "BlockPublicAcls=false,IgnorePublicAcls=false,BlockPublicPolicy=false,RestrictPublicBuckets=false" --region "${region}"`,
          { stdio: "pipe" },
        );
        const pubPolicy = JSON.stringify({
          Version: "2012-10-17",
          Statement: [
            {
              Sid: "PublicReadGetObject",
              Effect: "Allow",
              Principal: "*",
              Action: "s3:GetObject",
              Resource: `arn:aws:s3:::${bucketInput}/*`,
            },
          ],
        });
        execSync(
          `aws s3api put-bucket-policy --bucket "${bucketInput}" --policy '${pubPolicy}' --region "${region}"`,
          { stdio: "pipe" },
        );
        s3BucketName = bucketInput;
        ok(`Created S3 bucket ${bold(s3BucketName)} with public read enabled.`);
        break;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        warn(`Could not create bucket "${bucketInput}": ${msg}`);
        info("Please enter a different S3 bucket name.");
        defaultBucket = "";
        continue;
      }
    }

    if (s3BucketName) {
      const defaultCredMode =
        initialDefaults?.s3CredentialMode === "manual" ? 1 : 0;
      s3CredentialMode = await askChoice(
        rl,
        "How should workers authenticate to S3?",
        [
          {
            label:
              "Automatic — EC2 Instance Role (recommended, no key management)",
            value: "automatic" as CredentialMode,
          },
          {
            label:
              "Manual — Provide AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY yourself",
            value: "manual" as CredentialMode,
          },
        ],
        defaultCredMode,
      );

      if (s3CredentialMode === "manual") {
        warn(
          "Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY in apps/media-worker/.env.",
        );
      }
    }
  }

  // ── Step 7: Database URL ────────────────────────────────────────────────────
  step(7, TOTAL_STEPS, "Database Connection");
  info(
    "The deployed Lambda / EC2 workers need a database URL reachable from " +
      (targetEnv === "localstack" ? "LocalStack" : "AWS") +
      " — not just from this machine.",
  );
  const defaultDbUrl =
    initialDefaults?.databaseUrl ??
    process.env["DATABASE_URL"] ??
    "postgresql://veolms:veolms@localhost:5433/veolms";
  const databaseUrl = await ask(
    rl,
    "PostgreSQL DATABASE_URL for the fleet manager",
    defaultDbUrl,
  );

  // ── Step 8: Allowed EC2 Instance Types ─────────────────────────────────────
  step(8, TOTAL_STEPS, "Allowed EC2 Instance Types");
  console.log(
    dim(
      "  ARM64 Graviton: t4g.small, c7g.large, c7g.xlarge, c7g.2xlarge, c7g.4xlarge",
    ),
  );
  console.log(
    dim("  x86_64:         t3.small,  c6i.large, c6i.xlarge, c6i.2xlarge"),
  );
  const defaultInstanceTypes =
    initialDefaults?.allowedInstanceTypes?.join(",") ??
    "c7g.xlarge,c7g.2xlarge,c6i.xlarge";
  const instanceTypesInput = await ask(
    rl,
    "Allowed instance types (comma separated)",
    defaultInstanceTypes,
  );
  const allowedInstanceTypes = instanceTypesInput
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  ok(`Allowed: ${bold(allowedInstanceTypes.join(", "))}`);

  // ── Step 9: EC2 Boot Mode ──────────────────────────────────────────────────
  step(9, TOTAL_STEPS, "EC2 Worker Boot Mode");
  const defaultBootMode = initialDefaults?.bootMode ?? "fresh";
  const bootMode = await askChoice(
    rl,
    "How should EC2 workers boot?",
    [
      {
        label:
          "Fresh install — Install Node.js + FFmpeg on every boot (~3-5 min)",
        value: "fresh" as BootMode,
      },
      {
        label:
          "Pre-baked AMI — Custom AMI with Node.js + FFmpeg pre-installed (~30s)",
        value: "ami" as BootMode,
      },
    ],
    defaultBootMode === "fresh" ? 0 : 1,
  );

  if (bootMode === "ami") {
    warn("Pre-baked AMI selected.");
    info(`Build the AMI separately: ${cyan("pnpm fleet:build-ami")}`);
  }

  // ── Step 10: EC2 SSH Port / Security Group ──────────────────────────────────
  step(10, TOTAL_STEPS, "EC2 SSH Port / Security Group Access");
  const defaultAllowSsh = initialDefaults?.allowSsh !== false;
  const allowSshChoice = await askChoice(
    rl,
    "Allow SSH access to EC2 worker instances (port 22)?",
    [
      {
        label:
          "Yes — Create / reuse Security Group with SSH port 22 open (recommended for debugging)",
        value: "yes",
      },
      {
        label: "No — Do not create SSH ingress security group",
        value: "no",
      },
    ],
    defaultAllowSsh ? 0 : 1,
  );
  const allowSsh = allowSshChoice === "yes";

  // ── Step 11: EC2 SSH Key Pair ───────────────────────────────────────────────
  let keyName: string | null = null;
  if (allowSsh) {
    step(11, TOTAL_STEPS, "EC2 SSH Key Pair");
    info(
      "Specifying an SSH Key Pair allows you to SSH into EC2 worker instances (e.g. debian@<ip>).",
    );
    const defaultKeyName =
      initialDefaults?.keyName ??
      process.env.EC2_KEY_NAME ??
      process.env.KEY_NAME ??
      "";
    const keyNameInput = await ask(
      rl,
      "EC2 SSH Key Pair Name (leave empty to skip, must be in same region)",
      defaultKeyName || undefined,
    );
    keyName = keyNameInput.trim() || null;

    if (keyName) {
      const ec2 = new EC2Client({ region });
      const keyExists = await checkKeyPair(ec2, keyName);
      if (keyExists) {
        ok(`Found EC2 Key Pair: ${bold(keyName)} in region ${bold(region)}`);
      } else {
        info(
          `EC2 Key Pair configured as ${bold(keyName)} (ensure it exists in AWS).`,
        );
      }
    } else {
      info("No SSH Key Pair configured — skipping key assignment.");
    }
  } else {
    info("SSH access disabled — skipping SSH Key Pair configuration.");
  }

  // ── Step 12: Max Workers ───────────────────────────────────────────────────
  step(12, TOTAL_STEPS, "Maximum Concurrent Workers");
  const defaultMaxWorkers = String(initialDefaults?.maxWorkers ?? 8);
  const maxWorkersInput = await ask(
    rl,
    "Maximum number of concurrent EC2 workers",
    defaultMaxWorkers,
  );
  const maxWorkers = Math.max(1, parseInt(maxWorkersInput, 10) || 8);
  ok(`Max concurrent workers: ${bold(String(maxWorkers))}`);

  // ── Step 13: Worker Idle Poll Interval ─────────────────────────────────────
  step(13, TOTAL_STEPS, "Worker Idle Poll Interval");
  info(
    "After finishing a job, a worker checks the queue for more work " +
      "instead of terminating immediately — reusing an already-booted " +
      "instance skips the next job's fresh-boot cost. If the queue is " +
      "empty, it waits this long for one more check before giving up " +
      "and terminating.",
  );
  const defaultIdlePoll = String(initialDefaults?.workerIdlePollSeconds ?? 15);
  const idlePollInput = await ask(
    rl,
    "Idle poll interval before shutdown (seconds)",
    defaultIdlePoll,
  );
  const workerIdlePollSeconds = Math.max(1, parseInt(idlePollInput, 10) || 15);
  ok(`Idle poll interval: ${bold(`${workerIdlePollSeconds}s`)}`);

  // ── Step 14: Spot vs On-Demand ─────────────────────────────────────────────
  step(14, TOTAL_STEPS, "EC2 Pricing Model");
  const defaultPricingModel =
    initialDefaults?.useSpot === false ? "on-demand" : "spot";
  const pricingModel = await askChoice(
    rl,
    "Which EC2 pricing model?",
    [
      {
        label:
          "Spot Instances — Up to 90% cheaper, can be interrupted (recommended for batch video)",
        value: "spot" as PricingModel,
      },
      {
        label: "On-Demand — Standard pricing, never interrupted",
        value: "on-demand" as PricingModel,
      },
    ],
    defaultPricingModel === "on-demand" ? 1 : 0,
  );
  const useSpot = pricingModel === "spot";
  ok(useSpot ? "Spot Instances selected." : "On-Demand Instances selected.");

  // ── Step 15: Create AWS Resources ─────────────────────────────────────────
  step(15, TOTAL_STEPS, "Creating AWS Resources");

  const iam = new IAMClient({ region });
  const ec2 = new EC2Client({ region });
  const cw = new CloudWatchLogsClient({ region });
  const lambda = new LambdaClient({ region });

  info("Setting up IAM role for EC2 workers and Lambda functions...");
  const workerRoleArn = await checkOrCreateRole(
    iam,
    storageProvider === "s3" && s3BucketName !== null,
    s3BucketName,
  );

  const instanceProfileArn = await createInstanceProfile(iam, workerRoleArn);

  let securityGroupId: string | null = null;
  if (allowSsh) {
    info("Setting up EC2 Security Group with SSH port 22...");
    securityGroupId = await ensureSecurityGroup(ec2, true);
  }

  info("Setting up CloudWatch log groups...");
  await ensureLogGroup(cw, LOG_GROUP_WORKERS);
  await ensureLogGroup(cw, LOG_GROUP_FLEET);

  const amiId = initialDefaults?.amiId ?? process.env["AMI_ID"] ?? null;

  let lambdaFunctionArn: string | null = null;
  let probeLambdaArn: string | null = null;
  let ffprobeLayerArn: string | null = null;

  if (fleetMode === "serverless") {
    info("Setting up Fleet Manager Lambda function...");
    const lambdaArn = `arn:aws:lambda:${region}:${accountId}:function:${LAMBDA_FUNCTION_NAME}`;
    const lambdaEnvVars: Record<string, string> = {
      DATABASE_URL: databaseUrl,
      FLEET_MODE: "serverless",
      FLEET_PROVIDER: "aws",
      PROVIDER: "aws",
      STORAGE_PROVIDER: storageProvider,
      EC2_IAM_INSTANCE_PROFILE: INSTANCE_PROFILE_NAME,
      EC2_USE_SPOT: String(useSpot),
      MAX_WORKERS: String(maxWorkers),
      WORKER_IDLE_POLL_SECONDS: String(workerIdlePollSeconds),
      SCHEDULER_ROLE_ARN: workerRoleArn,
      LAMBDA_FUNCTION_ARN: lambdaArn,
    };
    if (s3BucketName) {
      lambdaEnvVars["S3_BUCKET"] = s3BucketName;
      lambdaEnvVars["S3_BUCKET_NAME"] = s3BucketName;
    }
    if (securityGroupId) {
      lambdaEnvVars["SECURITY_GROUP_IDS"] = securityGroupId;
    }
    if (keyName) {
      lambdaEnvVars["KEY_NAME"] = keyName;
    }
    if (endpointUrl) {
      lambdaEnvVars["AWS_ENDPOINT_URL"] = endpointUrl;
      lambdaEnvVars["AWS_ACCESS_KEY_ID"] = "test";
      lambdaEnvVars["AWS_SECRET_ACCESS_KEY"] = "test";
      lambdaEnvVars["AMI_ID"] = LOCALSTACK_DOCKER_AMI_ID;
      lambdaEnvVars["EC2_VM_MANAGER"] = "docker";
    } else if (amiId) {
      lambdaEnvVars["AMI_ID"] = amiId;
    }
    lambdaFunctionArn = await setupLambda(
      region,
      workerRoleArn,
      lambdaEnvVars,
      lambdaArch,
    );

    // Setup Video Metadata Probe Lambda if enabled
    if (shouldSetupProbeLambda) {
      info("Checking Docker status for building ffprobe Lambda layer...");
      if (!isDockerRunning()) {
        warn(
          "Docker is not running or not installed. Please check that Docker is running to build and publish the ffprobe layer.",
        );
      } else {
        try {
          info(
            `Building ffprobe layer for architecture ${bold(lambdaArch)} using Docker...`,
          );
          const zipPath = buildFfprobeLayer({
            architecture: lambdaArch,
            log: true,
          });

          info("Publishing veolms-ffprobe layer to AWS Lambda...");
          ffprobeLayerArn = await publishFfprobeLayer({
            lambdaClient: lambda,
            zipPath,
            architecture: lambdaArch,
            layerName: "veolms-ffprobe",
          });
          ok(`Published layer: ${bold(ffprobeLayerArn)}`);
        } catch (layerErr: unknown) {
          const msg =
            layerErr instanceof Error ? layerErr.message : String(layerErr);
          warn(`Could not build/publish ffprobe layer: ${msg}`);
        }
      }

      info("Setting up CloudWatch log group for Probe Lambda...");
      await ensureLogGroup(cw, LOG_GROUP_PROBE);

      info("Setting up Video Metadata Probe Lambda function...");
      const probeEnvVars: Record<string, string> = {
        FLEET_MANAGER_LAMBDA_NAME: LAMBDA_FUNCTION_NAME,
      };
      if (s3BucketName) {
        probeEnvVars["S3_BUCKET"] = s3BucketName;
        probeEnvVars["STORAGE_BUCKET"] = s3BucketName;
      }
      if (endpointUrl) {
        probeEnvVars["AWS_ENDPOINT_URL"] = endpointUrl;
      }
      probeLambdaArn = await setupProbeLambda(
        region,
        workerRoleArn, // Same shared IAM role
        ffprobeLayerArn,
        lambdaArch,
        probeEnvVars,
      );
    }
  }

  if (storageProvider === "s3" && s3BucketName) {
    info("Building and uploading media worker bundle to S3...");
    await buildAndUploadWorkerBundle(s3BucketName, region);
  }

  const result: SetupResult = {
    workerRoleArn,
    instanceProfileArn,
    logGroupWorkers: LOG_GROUP_WORKERS,
    logGroupFleet: LOG_GROUP_FLEET,
    lambdaFunctionArn,
    probeLambdaArn,
    ffprobeLayerArn,
    s3BucketName,
    securityGroupId,
    keyName,
  };

  const answers: SetupAnswers = {
    targetEnv,
    endpointUrl,
    region,
    accountId,
    databaseUrl,
    fleetMode,
    lambdaArch,
    setupProbeLambda: shouldSetupProbeLambda,
    storageProvider,
    s3BucketName,
    s3CredentialMode,
    allowedInstanceTypes,
    bootMode,
    amiId,
    maxWorkers,
    workerIdlePollSeconds,
    useSpot,
    allowSsh,
    keyName,
    securityGroupId,
  };

  // ── Step 16: Write .env Files ──────────────────────────────────────────────
  step(16, TOTAL_STEPS, "Writing Per-App .env Files");
  await generateEnvFiles(answers, result, repoRoot);

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log(`
${bold(cyan("╔══════════════════════════════════════════════════════╗"))}
${bold(cyan("║"))}               ${bold(green("AWS Setup Complete!"))}                 ${bold(cyan("║"))}
${bold(cyan("╚══════════════════════════════════════════════════════╝"))}

${bold("Resources:")} ${dim(`(target: ${targetEnv === "localstack" ? `LocalStack @ ${endpointUrl}` : `AWS account ${accountId}`})`)}
  ${green("✔")} IAM Role:             ${bold(ROLE_NAME)} (Shared by Workers & Lambdas)
  ${green("✔")} Instance Profile:     ${bold(INSTANCE_PROFILE_NAME)}${securityGroupId ? `\n  ${green("✔")} Security Group (SSH): ${bold(`${SECURITY_GROUP_NAME} (${securityGroupId}, port 22)`)}` : ""}${keyName ? `\n  ${green("✔")} EC2 SSH Key Pair:    ${bold(keyName)}` : ""}
  ${green("✔")} Log Group (workers):  ${bold(LOG_GROUP_WORKERS)}
  ${green("✔")} Log Group (fleet):    ${bold(LOG_GROUP_FLEET)}${lambdaFunctionArn ? `\n  ${green("✔")} Fleet Lambda:        ${bold(`${LAMBDA_FUNCTION_NAME} (${lambdaArch})`)}` : ""}${probeLambdaArn ? `\n  ${green("✔")} Probe Lambda:        ${bold(`${PROBE_LAMBDA_FUNCTION_NAME} (${lambdaArch})`)}` : ""}${ffprobeLayerArn ? `\n  ${green("✔")} ffprobe Layer:       ${bold(`veolms-ffprobe (${lambdaArch})`)}` : ""}${s3BucketName ? `\n  ${green("✔")} S3 Bucket & Bundle:  ${bold(`s3://${s3BucketName}/bundles/media-worker.js`)}` : ""}

${bold("Generated .env Files:")}
  ${green("✔")} apps/fleet-manager/.env
  ${green("✔")} apps/media-worker/.env

${bold("Next Steps:")}${bootMode === "ami" ? `\n  1. Build the worker AMI:   ${cyan("pnpm fleet:build-ami")}` : ""}
  ${bootMode === "ami" ? "2" : "1"}. Queue & trigger a job:   ${cyan("pnpm fleet:queue:trigger")}
  ${bootMode === "ami" ? "3" : "2"}. Run the fleet daemon:    ${cyan("pnpm fleet:run")}
  ${bootMode === "ami" ? "4" : "3"}. Monitor fleet health:    ${cyan("pnpm fleet:cli health")}
  ${bootMode === "ami" ? "5" : "4"}. Teardown AWS resources:  ${cyan("pnpm fleet:destroy")}
`);
}

// ─── Update Flow ──────────────────────────────────────────────────────────────

export async function runAwsInfraUpdate(
  existingRl?: readline.Interface,
): Promise<void> {
  const ownRl = !existingRl;
  const rl = existingRl ?? readline.createInterface({ input, output });

  const repoRoot = resolveRepoRoot();

  try {
    await runUpdateFlow(rl, repoRoot);
  } finally {
    if (ownRl) {
      rl.close();
    }
  }
}

async function runUpdateFlow(
  rl: readline.Interface,
  repoRoot: string,
): Promise<void> {
  const existing = loadExistingConfig(repoRoot);

  step(1, 3, "Detecting Current Configuration");
  if (existing.region) {
    info(
      `Target Environment:   ${bold(existing.targetEnv === "localstack" ? `LocalStack @ ${existing.endpointUrl}` : "Real AWS")}`,
    );
    info(`AWS Region:           ${bold(existing.region)}`);
    info(`Fleet Mode:           ${bold(existing.fleetMode ?? "serverless")}`);
    info(`Storage Provider:     ${bold(existing.storageProvider ?? "s3")}`);
    if (existing.s3BucketName) {
      info(`S3 Bucket:            ${bold(existing.s3BucketName)}`);
    }
    if (existing.keyName) {
      info(`EC2 SSH Key Pair:     ${bold(existing.keyName)}`);
    }
    if (existing.securityGroupId) {
      info(`Security Group:       ${bold(existing.securityGroupId)}`);
    }
  } else {
    info("No previous configuration detected — will use standard defaults.");
  }

  // --bundles-only (or UPDATE_MODE=bundles) skips the prompt and picks
  // "Code & Bundles Only" directly — the fast path that updates Lambda
  // function code (fleet-manager + probe) and the S3 worker bundle
  // without touching IAM/security-group/log-group state or rebuilding
  // and republishing the ffprobe Docker layer.
  const forceBundlesOnly =
    process.argv.includes("--bundles-only") ||
    process.env["UPDATE_MODE"] === "bundles";

  const updateChoice = forceBundlesOnly
    ? "bundles"
    : await askChoice<"full" | "bundles" | "interactive">(
        rl,
        "What would you like to update?",
        [
          {
            label: `Full Infrastructure Update ${dim("— Sync IAM, Security Group, log groups, Lambda, worker bundle, .env")}`,
            value: "full",
          },
          {
            label: `Code & Bundles Only        ${dim("— Fast rebuild and update of Lambda function + S3 worker bundle")}`,
            value: "bundles",
          },
          {
            label: `Interactive Re-configure   ${dim("— Review and change configuration values step-by-step")}`,
            value: "interactive",
          },
        ],
        0,
      );

  if (updateChoice === "interactive") {
    await runSetupFlow(rl, repoRoot, existing);
    return;
  }

  const targetEnv: TargetEnv = existing.targetEnv ?? "aws";
  const endpointUrl: string | null = existing.endpointUrl ?? null;
  const region: string = existing.region ?? "us-east-1";
  const fleetMode: FleetMode = existing.fleetMode ?? "serverless";
  const lambdaArch: LambdaArchitecture = existing.lambdaArch ?? "arm64";
  const shouldSetupProbeLambda: boolean = existing.setupProbeLambda ?? true;
  const storageProvider: StorageProvider = existing.storageProvider ?? "s3";
  const s3BucketName: string | null = existing.s3BucketName ?? null;
  const databaseUrl: string =
    existing.databaseUrl ?? "postgresql://veolms:veolms@localhost:5433/veolms";
  const allowedInstanceTypes: readonly string[] =
    existing.allowedInstanceTypes ?? [
      "c7g.xlarge",
      "c7g.2xlarge",
      "c6i.xlarge",
    ];
  const bootMode: BootMode = existing.bootMode ?? "ami";
  const amiId: string | null = existing.amiId ?? null;
  const maxWorkers: number = existing.maxWorkers ?? 8;
  const workerIdlePollSeconds: number = existing.workerIdlePollSeconds ?? 15;
  const useSpot: boolean = existing.useSpot ?? true;
  const allowSsh: boolean = existing.allowSsh !== false;
  const keyName: string | null = existing.keyName ?? null;
  const s3CredentialMode: CredentialMode | null =
    existing.s3CredentialMode ?? (s3BucketName ? "automatic" : null);

  if (targetEnv === "localstack" && endpointUrl) {
    process.env.AWS_ENDPOINT_URL = endpointUrl;
    process.env.AWS_ACCESS_KEY_ID ??= "test";
    process.env.AWS_SECRET_ACCESS_KEY ??= "test";
    process.env.EC2_VM_MANAGER = "docker";
  }

  step(2, 3, "Checking AWS Credentials");
  const identity = await checkAwsCredentials(region);
  const accountId = identity.accountId;

  step(3, 3, "Applying Infrastructure Updates");

  if (updateChoice === "bundles") {
    let lambdaUpdated = false;
    let probeLambdaUpdated = false;
    if (fleetMode === "serverless") {
      const lambda = new LambdaClient({ region });
      try {
        info(
          `Rebuilding and updating Lambda function ${bold(LAMBDA_FUNCTION_NAME)} code...`,
        );
        const lambdaZip = buildLambdaBundleZip();
        await lambda.send(
          new UpdateFunctionCodeCommand({
            FunctionName: LAMBDA_FUNCTION_NAME,
            ZipFile: lambdaZip,
          }),
        );
        await waitUntilFunctionUpdated(lambda);
        ok(`Updated code for Lambda ${bold(LAMBDA_FUNCTION_NAME)}`);
        lambdaUpdated = true;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        warn(`Could not update Lambda code: ${msg}`);
      }

      if (shouldSetupProbeLambda) {
        try {
          info(
            `Rebuilding and updating Probe Lambda function ${bold(PROBE_LAMBDA_FUNCTION_NAME)} code...`,
          );
          const probeZip = buildProbeLambdaBundleZip();
          await lambda.send(
            new UpdateFunctionCodeCommand({
              FunctionName: PROBE_LAMBDA_FUNCTION_NAME,
              ZipFile: probeZip,
            }),
          );
          await waitUntilFunctionUpdated(lambda, PROBE_LAMBDA_FUNCTION_NAME);
          ok(
            `Updated code for Probe Lambda ${bold(PROBE_LAMBDA_FUNCTION_NAME)}`,
          );
          probeLambdaUpdated = true;
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          warn(`Could not update Probe Lambda code: ${msg}`);
        }
      }
    }

    let bundleUploaded = false;
    if (storageProvider === "s3" && s3BucketName) {
      info(
        `Rebuilding and uploading worker bundle to ${bold(s3BucketName)}...`,
      );
      bundleUploaded = await buildAndUploadWorkerBundle(s3BucketName, region);
    }

    console.log(`
${bold(cyan("╔══════════════════════════════════════════════════════╗"))}
${bold(cyan("║"))}         ${bold(green("Code & Bundles Updated Successfully!"))}        ${bold(cyan("║"))}
${bold(cyan("╚══════════════════════════════════════════════════════╝"))}

  ${lambdaUpdated ? `${green("✔")} Lambda Code:       ${bold(LAMBDA_FUNCTION_NAME)}` : `${dim("—")} Lambda Code:       ${dim("Skipped / Not serverless")}`}
  ${probeLambdaUpdated ? `${green("✔")} Probe Lambda Code: ${bold(PROBE_LAMBDA_FUNCTION_NAME)}` : `${dim("—")} Probe Lambda Code: ${dim("Skipped / Not enabled")}`}
  ${bundleUploaded ? `${green("✔")} S3 Worker Bundle:   ${bold(`s3://${s3BucketName}/bundles/media-worker.js`)}` : `${dim("—")} S3 Worker Bundle:   ${dim("Skipped / No S3 bucket")}`}

${bold("Next Steps:")}
  Queue & trigger a job: ${cyan("pnpm fleet:queue:trigger")}
`);
    return;
  }

  // Full update
  const iam = new IAMClient({ region });
  const ec2 = new EC2Client({ region });
  const cw = new CloudWatchLogsClient({ region });

  info("Updating / verifying IAM role policies for EC2 workers...");
  const workerRoleArn = await checkOrCreateRole(
    iam,
    storageProvider === "s3" && s3BucketName !== null,
    s3BucketName,
  );

  const instanceProfileArn = await createInstanceProfile(iam, workerRoleArn);

  let securityGroupId: string | null = existing.securityGroupId ?? null;
  if (allowSsh) {
    info("Ensuring EC2 Security Group with SSH port 22...");
    securityGroupId = await ensureSecurityGroup(ec2, true);
  }

  info("Ensuring CloudWatch log groups...");
  await ensureLogGroup(cw, LOG_GROUP_WORKERS);
  await ensureLogGroup(cw, LOG_GROUP_FLEET);

  let lambdaFunctionArn: string | null = null;
  let probeLambdaArn: string | null = null;
  let ffprobeLayerArn: string | null = null;
  if (fleetMode === "serverless") {
    info("Updating Lambda function code & configuration...");
    const lambdaEnvVars: Record<string, string> = {
      DATABASE_URL: databaseUrl,
      FLEET_MODE: "serverless",
      FLEET_PROVIDER: "aws",
      PROVIDER: "aws",
      STORAGE_PROVIDER: storageProvider,
      EC2_IAM_INSTANCE_PROFILE: INSTANCE_PROFILE_NAME,
      EC2_USE_SPOT: String(useSpot),
      MAX_WORKERS: String(maxWorkers),
      WORKER_IDLE_POLL_SECONDS: String(workerIdlePollSeconds),
    };
    if (s3BucketName) {
      lambdaEnvVars["S3_BUCKET"] = s3BucketName;
      lambdaEnvVars["S3_BUCKET_NAME"] = s3BucketName;
    }
    if (securityGroupId) {
      lambdaEnvVars["SECURITY_GROUP_IDS"] = securityGroupId;
    }
    if (keyName) {
      lambdaEnvVars["KEY_NAME"] = keyName;
    }
    if (endpointUrl) {
      lambdaEnvVars["AWS_ENDPOINT_URL"] = endpointUrl;
      lambdaEnvVars["AWS_ACCESS_KEY_ID"] = "test";
      lambdaEnvVars["AWS_SECRET_ACCESS_KEY"] = "test";
      lambdaEnvVars["AMI_ID"] = LOCALSTACK_DOCKER_AMI_ID;
      lambdaEnvVars["EC2_VM_MANAGER"] = "docker";
    } else if (amiId) {
      lambdaEnvVars["AMI_ID"] = amiId;
    }
    lambdaFunctionArn = await setupLambda(
      region,
      workerRoleArn,
      lambdaEnvVars,
      lambdaArch,
    );

    if (shouldSetupProbeLambda) {
      info("Checking Docker status for building ffprobe Lambda layer...");
      if (!isDockerRunning()) {
        warn(
          "Docker is not running or not installed. Please check that Docker is running to build and publish the ffprobe layer.",
        );
      } else {
        try {
          info(
            `Building ffprobe layer for architecture ${bold(lambdaArch)} using Docker...`,
          );
          const zipPath = buildFfprobeLayer({
            architecture: lambdaArch,
            log: true,
          });

          const lambdaClient = new LambdaClient({ region });
          info("Publishing veolms-ffprobe layer to AWS Lambda...");
          ffprobeLayerArn = await publishFfprobeLayer({
            lambdaClient,
            zipPath,
            architecture: lambdaArch,
            layerName: "veolms-ffprobe",
          });
          ok(`Published layer: ${bold(ffprobeLayerArn)}`);
        } catch (layerErr: unknown) {
          const msg =
            layerErr instanceof Error ? layerErr.message : String(layerErr);
          warn(`Could not build/publish ffprobe layer: ${msg}`);
        }
      }

      info("Setting up CloudWatch log group for Probe Lambda...");
      await ensureLogGroup(cw, LOG_GROUP_PROBE);

      info("Setting up Video Metadata Probe Lambda function...");
      const probeEnvVars: Record<string, string> = {
        FLEET_MANAGER_LAMBDA_NAME: LAMBDA_FUNCTION_NAME,
      };
      if (s3BucketName) {
        probeEnvVars["S3_BUCKET"] = s3BucketName;
        probeEnvVars["STORAGE_BUCKET"] = s3BucketName;
      }
      if (endpointUrl) {
        probeEnvVars["AWS_ENDPOINT_URL"] = endpointUrl;
      }
      probeLambdaArn = await setupProbeLambda(
        region,
        workerRoleArn, // Same shared IAM role
        ffprobeLayerArn,
        lambdaArch,
        probeEnvVars,
      );
    }
  }

  if (storageProvider === "s3" && s3BucketName) {
    info("Rebuilding and uploading media worker bundle to S3...");
    await buildAndUploadWorkerBundle(s3BucketName, region);
  }

  const answers: SetupAnswers = {
    targetEnv,
    endpointUrl,
    region,
    accountId,
    databaseUrl,
    fleetMode,
    lambdaArch,
    setupProbeLambda: shouldSetupProbeLambda,
    storageProvider,
    s3BucketName,
    s3CredentialMode,
    allowedInstanceTypes,
    bootMode,
    amiId,
    maxWorkers,
    workerIdlePollSeconds,
    useSpot,
    allowSsh,
    keyName,
    securityGroupId,
  };

  const result: SetupResult = {
    workerRoleArn,
    instanceProfileArn,
    logGroupWorkers: LOG_GROUP_WORKERS,
    logGroupFleet: LOG_GROUP_FLEET,
    lambdaFunctionArn,
    probeLambdaArn,
    ffprobeLayerArn,
    s3BucketName,
    securityGroupId,
    keyName,
  };

  info("Refreshing per-app .env files...");
  await generateEnvFiles(answers, result, repoRoot);

  console.log(`
${bold(cyan("╔══════════════════════════════════════════════════════╗"))}
${bold(cyan("║"))}         ${bold(green("AWS Infrastructure Updated Successfully!"))}      ${bold(cyan("║"))}
${bold(cyan("╚══════════════════════════════════════════════════════╝"))}

${bold("Resources Updated:")} ${dim(`(target: ${targetEnv === "localstack" ? `LocalStack @ ${endpointUrl}` : `AWS account ${accountId}`})`)}
  ${green("✔")} IAM Role:             ${bold(ROLE_NAME)}
  ${green("✔")} Instance Profile:     ${bold(INSTANCE_PROFILE_NAME)}${securityGroupId ? `\n  ${green("✔")} Security Group (SSH): ${bold(`${SECURITY_GROUP_NAME} (${securityGroupId}, port 22)`)}` : ""}${keyName ? `\n  ${green("✔")} EC2 SSH Key Pair:    ${bold(keyName)}` : ""}
  ${green("✔")} Log Group (workers):  ${bold(LOG_GROUP_WORKERS)}
  ${green("✔")} Log Group (fleet):    ${bold(LOG_GROUP_FLEET)}${lambdaFunctionArn ? `\n  ${green("✔")} Fleet Lambda:        ${bold(`${LAMBDA_FUNCTION_NAME} (${lambdaArch})`)}` : ""}${probeLambdaArn ? `\n  ${green("✔")} Probe Lambda:        ${bold(`${PROBE_LAMBDA_FUNCTION_NAME} (${lambdaArch})`)}` : ""}${ffprobeLayerArn ? `\n  ${green("✔")} ffprobe Layer:       ${bold(`veolms-ffprobe (${lambdaArch})`)}` : ""}${s3BucketName ? `\n  ${green("✔")} S3 Bucket & Bundle:  ${bold(`s3://${s3BucketName}/bundles/media-worker.js`)}` : ""}

${bold("Generated .env Files:")}
  ${green("✔")} apps/fleet-manager/.env
  ${green("✔")} apps/media-worker/.env

${bold("Next Steps:")}
  Queue & trigger a job: ${cyan("pnpm fleet:queue:trigger")}
`);
}

// ─── Destroy Flow ─────────────────────────────────────────────────────────────

async function runDestroyFlow(
  rl: readline.Interface,
  repoRoot: string,
): Promise<void> {
  const existing = loadExistingConfig(repoRoot);
  const targetEnv =
    existing.targetEnv ?? (process.env.AWS_ENDPOINT_URL ? "localstack" : "aws");
  const endpointUrl =
    existing.endpointUrl ?? process.env.AWS_ENDPOINT_URL ?? null;
  const region = existing.region ?? process.env.AWS_REGION ?? "us-east-1";
  const s3BucketName =
    existing.s3BucketName ?? resolveS3BucketName(process.env);

  console.log(`\n${bold(red("⚠ Teardown Confirmation"))}`);
  console.log(dim("─".repeat(52)));
  console.log(
    `  Target:     ${bold(targetEnv === "localstack" ? `LocalStack @ ${endpointUrl}` : "Real AWS")}`,
  );
  console.log(`  Region:     ${bold(region)}`);
  if (s3BucketName) {
    console.log(`  S3 Bucket:  ${bold(s3BucketName)}`);
  }
  console.log(`
  This will ${bold(red("PERMANENTLY DELETE"))} all AWS infrastructure created by VeoLMS:
    • Terminate all active EC2 worker instances
    • Delete Lambda function (${LAMBDA_FUNCTION_NAME})
    • Delete CloudWatch log groups (${LOG_GROUP_WORKERS}, ${LOG_GROUP_FLEET}, /aws/lambda/${LAMBDA_FUNCTION_NAME})
    • Delete IAM Instance Profile (${INSTANCE_PROFILE_NAME})
    • Delete IAM Role (${ROLE_NAME}) and detached policies
    • Delete EC2 Security Group (${SECURITY_GROUP_NAME})
    ${s3BucketName ? `• Delete S3 Bucket (${s3BucketName}) and all uploaded files` : ""}
`);

  const confirm = await askChoice(
    rl,
    "Are you sure you want to destroy all AWS resources?",
    [
      { label: "Cancel (do not destroy)", value: "no" },
      { label: "Yes, destroy all AWS infrastructure", value: "yes" },
    ],
    0,
  );

  if (confirm !== "yes") {
    info("Teardown cancelled. No resources were deleted.");
    return;
  }

  await runAwsInfraDestroy({
    rl,
    region,
    endpointUrl,
    s3BucketName,
  });
}

// ─── Exported Entry Point ─────────────────────────────────────────────────────

type SetupAction = "setup" | "update" | "destroy";

/**
 * Main entry point for AWS infrastructure setup.
 * Interactively prompts user to choose between:
 *  1. Setup Infrastructure
 *  2. Update Infrastructure
 *  3. Destroy Infrastructure
 *
 * Called by apps/fleet-manager/src/infra.ts when FLEET_PROVIDER=aws.
 */
export async function runAwsInfraSetup(): Promise<void> {
  banner();

  // Resolve repo root relative to workspace markers
  const repoRoot = resolveRepoRoot();
  const existingConfig = loadExistingConfig(repoRoot);
  const cliArgs = parseSetupCliArgs();

  const isNonInteractive =
    process.argv.includes("--yes") ||
    process.argv.includes("-y") ||
    process.argv.includes("--non-interactive") ||
    process.env["NON_INTERACTIVE"] === "true" ||
    process.env["SETUP_NON_INTERACTIVE"] === "true";

  const requestedAction =
    cliArgs.action ??
    (process.argv.includes("--update")
      ? "update"
      : process.argv.includes("--destroy")
        ? "destroy"
        : process.argv.includes("--setup")
          ? "setup"
          : undefined);

  const rl = readline.createInterface({ input, output });

  try {
    const action =
      requestedAction ??
      (await askChoice<SetupAction>(
        rl,
        "What infrastructure action would you like to perform?",
        [
          {
            label: `Setup Infrastructure   ${dim("— Provision fresh AWS resources and generate .env")}`,
            value: "setup",
          },
          {
            label: `Update Infrastructure  ${dim("— Sync IAM, update Lambda code/config, worker bundle, .env")}`,
            value: "update",
          },
          {
            label: `Destroy Infrastructure ${dim("— Teardown and delete all AWS resources")}`,
            value: "destroy",
          },
        ],
        0,
      ));

    if (action === "setup") {
      await runSetupFlow(rl, repoRoot, existingConfig);
    } else if (action === "update") {
      await runUpdateFlow(rl, repoRoot);
    } else if (action === "destroy") {
      await runDestroyFlow(rl, repoRoot);
    }
  } finally {
    rl.close();
  }
}

export { runAwsInfraDestroy } from "./destroy.ts";

if (process.argv[1] && import.meta.url.endsWith(process.argv[1])) {
  runAwsInfraSetup().catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`\n✘ Setup failed: ${msg}\n`);
    process.exit(1);
  });
}
