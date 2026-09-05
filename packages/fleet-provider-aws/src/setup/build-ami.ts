/**
 * VeoLMS Pre-baked AMI Builder
 *
 * Automatically launches a temporary EC2 worker, pre-installs Node.js 24 + FFmpeg + AWS CLI v2,
 * creates a pre-baked AMI for instant (<30s) worker boot times, and saves the AMI_ID
 * to .env files.
 */

import { execFileSync, execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SSMClient } from "@aws-sdk/client-ssm";
import { isMainModule } from "@veolms/fleet-types";
import { bold, cyan, dim, green, yellow } from "@veolms/fleet-types/terminal";
import { resolveDebianAmiId } from "../debian-ami.ts";

const DEBIAN_RELEASE = "13";

function exec(cmd: string): string {
  try {
    return execSync(cmd, { encoding: "utf-8", stdio: "pipe" }).trim();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Command failed: ${cmd}\n${msg}`);
  }
}

export interface BuildAmiOptions {
  readonly region?: string;
  readonly architecture?: "arm64" | "x86_64";
  readonly amiName?: string;
}

export async function runBuildAmi(options?: BuildAmiOptions): Promise<string> {
  const rawRegion = options?.region || process.env.AWS_REGION || "us-east-1";
  const rawArchitecture = (
    options?.architecture ||
    process.env.ARCHITECTURE ||
    "arm64"
  ).toLowerCase();

  if (!/^[a-z]{2,}(?:-[a-z0-9]+)+-\d+$/.test(rawRegion)) {
    throw new Error(
      `Invalid AWS region "${rawRegion}". Must match standard AWS region format (e.g., us-east-1).`,
    );
  }

  if (rawArchitecture !== "arm64" && rawArchitecture !== "x86_64") {
    throw new Error(
      `Invalid architecture "${rawArchitecture}". Supported architectures: arm64, x86_64.`,
    );
  }

  const region = rawRegion;
  const architecture: "arm64" | "x86_64" = rawArchitecture;

  console.info(`
╔══════════════════════════════════════════════════════╗
║          VeoLMS Pre-Baked Worker AMI Builder         ║
╚══════════════════════════════════════════════════════╝
`);

  console.info(
    `Resolving latest Debian ${DEBIAN_RELEASE} AMI for ${bold(architecture)} in ${bold(region)}...`,
  );
  const ssm = new SSMClient({ region });
  const baseAmi = await resolveDebianAmiId(
    ssm,
    region,
    architecture === "arm64" ? "arm64" : "x86_64",
  );
  const instanceType = architecture === "arm64" ? "c7g.large" : "c6i.large";
  const defaultAmiName = `veolms-worker-ami-${architecture}-${Date.now()}`;
  const amiName = (
    options?.amiName ||
    process.env.AMI_NAME ||
    defaultAmiName
  ).trim();

  console.info(`Architecture:    ${bold(architecture)}`);
  console.info(
    `Base AMI:        ${bold(baseAmi)} ${dim(`(Debian ${DEBIAN_RELEASE})`)}`,
  );
  console.info(`Builder Type:    ${bold(instanceType)}`);
  console.info(`Target AMI Name: ${bold(cyan(amiName))}`);
  console.info(`Region:          ${bold(region)}\n`);

  console.info(`
${bold(cyan("ℹ Why does building a Pre-baked AMI take ~3 to 5 minutes?"))}
  ${dim("•")} ${bold("1. Launch temporary builder:")} AWS launches a clean EC2 instance (${bold(instanceType)}) (~30s).
  ${dim("•")} ${bold("2. Dependency installation:")} Updates Debian packages and installs Node.js 24, FFmpeg, and AWS CLI v2 (~1.5-2m).
  ${dim("•")} ${bold("3. Clean shutdown:")} The instance stops cleanly to sync filesystems and ensure zero EBS corruption (~15s).
  ${dim("•")} ${bold("4. EBS snapshot & AMI registration:")} AWS creates an EBS snapshot and registers the AMI (~1.5-2m).
  ${green("✔")} ${bold("One-time process:")} Every worker launched in the future will boot in ${bold("<30 seconds")}!
`);

  const awsCliUrl =
    architecture === "arm64"
      ? "https://awscli.amazonaws.com/awscli-exe-linux-aarch64.zip"
      : "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip";

  // Step 1: Launch Builder EC2 Instance
  console.info("[1/5] Launching temporary builder EC2 instance...");
  const installScript = `#!/bin/bash
set -ex

systemctl stop apt-daily.timer apt-daily-upgrade.timer || true
systemctl kill --kill-who=all apt-daily.service apt-daily-upgrade.service || true
systemctl mask apt-daily.timer apt-daily-upgrade.timer apt-daily.service apt-daily-upgrade.service unattended-upgrades.service || true

while fuser /var/lib/dpkg/lock-frontend >/dev/null 2>&1 || fuser /var/lib/apt/lists/lock >/dev/null 2>&1; do
  sleep 1
done

export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y curl ffmpeg unzip

curl -s "${awsCliUrl}" -o "awscliv2.zip"
unzip -q awscliv2.zip
./aws/install
rm -rf awscliv2.zip ./aws

curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
apt-get install -y nodejs

mkdir -p /opt/veolms
echo "SUCCESS" > /opt/veolms/install_status
sync
shutdown -h now
`;
  const userDataBase64 = Buffer.from(installScript).toString("base64");

  let runRes: any = null;
  const maxLaunchRetries = 8;
  for (let attempt = 1; attempt <= maxLaunchRetries; attempt++) {
    try {
      runRes = JSON.parse(
        exec(
          `aws ec2 run-instances --image-id ${baseAmi} --instance-type ${instanceType} --user-data "${userDataBase64}" --iam-instance-profile Name=VeoLMSWorkerInstanceProfile --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=veolms-ami-builder},{Key=ManagedBy,Value=veolms-infra-setup}]' --output json --region ${region}`,
        ),
      );
      break;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (
        (msg.includes("Invalid IAM Instance Profile name") ||
          msg.includes("cannot be assumed") ||
          (msg.includes("InvalidParameterValue") &&
            (msg.includes("Instance Profile") ||
              msg.includes("instance-profile") ||
              msg.includes("IAM")))) &&
        attempt < maxLaunchRetries
      ) {
        console.info(
          `  Waiting for IAM instance profile propagation in EC2 (attempt ${attempt}/${maxLaunchRetries})...`,
        );
        await new Promise((r) => setTimeout(r, 4000));
        continue;
      }
      throw err;
    }
  }

  const instanceId = runRes.Instances[0].InstanceId;
  console.info(`✔ Launched builder instance: ${bold(cyan(instanceId))}\n`);

  let amiId: string;
  try {
    // Step 2: Wait for instance to finish installation and stop
    console.info(
      "[2/5] Installing Node.js 24 + FFmpeg + AWS CLI (waiting for auto-shutdown ~1.5-2 min)...",
    );
    let isStopped = false;
    let elapsed = 0;
    while (!isStopped && elapsed < 360) {
      await new Promise((r) => setTimeout(r, 5000));
      elapsed += 5;
      const state = exec(
        `aws ec2 describe-instances --instance-ids ${instanceId} --query "Reservations[0].Instances[0].State.Name" --output text --region ${region}`,
      );
      process.stdout.write(
        `\r  [${elapsed}s] Instance State: ${bold(cyan(state))} (installing packages & waiting for shutdown)...   `,
      );
      if (state === "stopped") {
        isStopped = true;
        console.info(
          `\n✔ Builder instance stopped. Dependencies successfully installed.`,
        );
      }
    }

    if (!isStopped) {
      throw new Error(
        `Builder instance timed out after ${elapsed}s (still not stopped — check console output with: aws ec2 get-console-output --instance-id ${instanceId} --region ${region}).`,
      );
    }

    // Step 3: Create AMI from stopped instance
    console.info("\n[3/5] Creating pre-baked AMI from stopped instance...");
    const createAmiRes = JSON.parse(
      execFileSync(
        "aws",
        [
          "ec2",
          "create-image",
          "--instance-id",
          instanceId,
          "--name",
          amiName,
          "--description",
          "VeoLMS Pre-baked Worker AMI with Node.js 24 + FFmpeg + AWS CLI",
          "--output",
          "json",
          "--region",
          region,
        ],
        { encoding: "utf-8", stdio: "pipe" },
      ).trim(),
    );
    amiId = createAmiRes.ImageId;
    console.info(`✔ AMI Creation initiated: ${bold(green(amiId))}`);

    // Step 4: Wait for AMI to be available with active progress
    console.info(
      "\n[4/5] Waiting for AWS to snapshot EBS volume and register AMI (takes ~1.5-2 min)...",
    );
    let isAvailable = false;
    let waitElapsed = 0;
    while (!isAvailable && waitElapsed < 600) {
      await new Promise((r) => setTimeout(r, 5000));
      waitElapsed += 5;
      const status = exec(
        `aws ec2 describe-images --image-ids ${amiId} --query "Images[0].State" --output text --region ${region}`,
      );
      process.stdout.write(
        `\r  [${waitElapsed}s] AMI State: ${bold(cyan(status))} (registering in AWS)...   `,
      );
      if (status === "available") {
        isAvailable = true;
        console.info(
          `\n✔ Pre-baked AMI is now ${bold(green("AVAILABLE"))}: ${bold(amiId)}`,
        );
      } else if (status === "failed") {
        throw new Error(`AMI creation failed with state: failed`);
      }
    }

    if (!isAvailable) {
      throw new Error(
        `Timed out waiting for AMI ${amiId} to become available.`,
      );
    }
  } catch (err: unknown) {
    console.error(
      `\n✘ Build step failed — terminating builder instance ${instanceId} before exiting...`,
    );
    try {
      exec(
        `aws ec2 terminate-instances --instance-ids ${instanceId} --region ${region}`,
      );
    } catch {
      console.error(
        `✘ Failed to terminate builder instance ${instanceId} — please terminate it manually to avoid ongoing charges.`,
      );
    }
    throw err;
  }

  // Step 5: Clean up builder instance & update .env files
  console.info(
    "\n[5/5] Terminating builder instance and saving AMI_ID to .env...",
  );
  exec(
    `aws ec2 terminate-instances --instance-ids ${instanceId} --region ${region}`,
  );
  console.info(`✔ Terminated builder instance ${instanceId}`);

  // Update .env files — resolved from this file's own location (always
  // packages/fleet-provider-aws/src/setup/), not process.cwd(), since this
  // script can be invoked from the repo root or from inside any package
  // directory and cwd differs between them.
  const repoRoot = join(
    dirname(fileURLToPath(import.meta.url)),
    "..",
    "..",
    "..",
    "..",
  );
  const envFiles = [
    join(repoRoot, "apps/fleet-manager/.env"),
    join(repoRoot, "apps/media-worker/.env"),
  ];

  for (const envPath of envFiles) {
    if (existsSync(envPath)) {
      let content = readFileSync(envPath, "utf-8");
      if (/^AMI_ID=.*/m.test(content)) {
        content = content.replace(/^AMI_ID=.*/m, `AMI_ID="${amiId}"`);
      } else {
        content += `\nAMI_ID="${amiId}"\n`;
      }
      writeFileSync(envPath, content, "utf-8");
      console.info(`✔ Updated ${bold(envPath)} with AMI_ID="${amiId}"`);
    } else {
      console.warn(
        `${yellow("⚠")} ${envPath} not found — skipped. Add AMI_ID="${amiId}" to it manually.`,
      );
    }
  }

  console.info(`
╔══════════════════════════════════════════════════════╗
║        Pre-Baked Worker AMI Created Successfully!    ║
╚══════════════════════════════════════════════════════╝

  AMI ID:       ${bold(green(amiId))}
  Architecture: ${bold(architecture)}
  Region:       ${bold(region)}

Workers booted with this AMI will now start transcoding in <30 seconds!
`);
  return amiId;
}

async function cliMain(): Promise<void> {
  const args = process.argv.slice(2);
  let region = process.env.AWS_REGION || "us-east-1";
  let architecture: "arm64" | "x86_64" =
    (process.env.ARCHITECTURE as "arm64" | "x86_64") || "arm64";
  let amiName = process.env.AMI_NAME;

  for (const arg of args) {
    if (arg.startsWith("--region=")) {
      region = arg.slice(9).trim();
    } else if (arg.startsWith("--arch=") || arg.startsWith("--architecture=")) {
      const a = arg.split("=")[1]?.trim().toLowerCase();
      if (a === "arm64" || a === "x86_64") architecture = a;
    } else if (arg.startsWith("--name=") || arg.startsWith("--ami-name=")) {
      amiName = arg.split("=")[1]?.trim();
    }
  }

  const isNonInteractive =
    process.argv.includes("--yes") ||
    process.argv.includes("-y") ||
    process.argv.includes("--non-interactive") ||
    process.env["NON_INTERACTIVE"] === "true";

  if (!amiName && !isNonInteractive) {
    const defaultAmiName = `veolms-worker-ami-${architecture}-${Date.now()}`;
    const rl = (await import("node:readline/promises")).createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    try {
      const answer = (
        await rl.question(
          `  ${bold("?")} Pre-baked AMI name ${dim(`(default: ${defaultAmiName})`)}: `,
        )
      ).trim();
      amiName = answer || defaultAmiName;
    } finally {
      rl.close();
    }
  }

  await runBuildAmi({ region, architecture, amiName });
}

if (isMainModule(import.meta.url)) {
  cliMain().catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`\n✘ AMI build failed: ${msg}\n`);
    process.exit(1);
  });
}
