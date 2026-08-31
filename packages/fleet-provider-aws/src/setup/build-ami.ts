/**
 * VeoLMS Pre-baked AMI Builder
 *
 * Automatically launches a temporary EC2 worker, pre-installs Node.js 24 + FFmpeg + AWS CLI v2,
 * creates a pre-baked AMI for instant (<30s) worker boot times, and saves the AMI_ID
 * to .env files.
 */

import { execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SSMClient } from "@aws-sdk/client-ssm";
import { bold, cyan, dim, green, yellow } from "@veolms/fleet-types/terminal";
import { resolveDebianAmiId } from "../debian-ami.ts";

const REGION = process.env.AWS_REGION || "us-east-1";
const ARCHITECTURE = (process.env.ARCHITECTURE || "arm64").toLowerCase();
const DEBIAN_RELEASE = "13";

function exec(cmd: string): string {
  try {
    return execSync(cmd, { encoding: "utf-8", stdio: "pipe" }).trim();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Command failed: ${cmd}\n${msg}`);
  }
}

export async function runBuildAmi(): Promise<void> {
  console.info(`
╔══════════════════════════════════════════════════════╗
║          VeoLMS Pre-Baked Worker AMI Builder         ║
╚══════════════════════════════════════════════════════╝
`);

  console.info(
    `Resolving latest Debian ${DEBIAN_RELEASE} AMI for ${bold(ARCHITECTURE)} in ${bold(REGION)}...`,
  );
  const ssm = new SSMClient({ region: REGION });
  const baseAmi = await resolveDebianAmiId(
    ssm,
    REGION,
    ARCHITECTURE === "arm64" ? "arm64" : "x86_64",
  );
  const instanceType = ARCHITECTURE === "arm64" ? "c7g.large" : "c6i.large";
  const amiName = `veolms-worker-ami-${ARCHITECTURE}-${Date.now()}`;

  console.info(`Architecture:    ${bold(ARCHITECTURE)}`);
  console.info(
    `Base AMI:        ${bold(baseAmi)} ${dim(`(Debian ${DEBIAN_RELEASE})`)}`,
  );
  console.info(`Builder Type:    ${bold(instanceType)}`);
  console.info(`Target AMI Name: ${bold(amiName)}`);
  console.info(`Region:          ${bold(REGION)}\n`);

  const awsCliUrl =
    ARCHITECTURE === "arm64"
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

  const runRes = JSON.parse(
    exec(
      `aws ec2 run-instances --image-id ${baseAmi} --instance-type ${instanceType} --user-data "${userDataBase64}" --iam-instance-profile Name=VeoLMSWorkerInstanceProfile --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=veolms-ami-builder},{Key=ManagedBy,Value=veolms-infra-setup}]' --output json --region ${REGION}`,
    ),
  );

  const instanceId = runRes.Instances[0].InstanceId;
  console.info(`✔ Launched builder instance: ${bold(cyan(instanceId))}\n`);

  // Steps 2-4 run against the builder instance — if any of them fail, the
  // instance must still be terminated so a failed build doesn't leave a
  // billed, orphaned EC2 instance behind (it previously just leaked).
  let amiId: string;
  try {
    // Step 2: Wait for instance to finish installation and stop
    console.info(
      "[2/5] Installing Node.js 24 + FFmpeg + AWS CLI (waiting for auto-shutdown ~1-2 min)...",
    );
    let isStopped = false;
    let elapsed = 0;
    while (!isStopped && elapsed < 300) {
      await new Promise((r) => setTimeout(r, 5000));
      elapsed += 5;
      const state = exec(
        `aws ec2 describe-instances --instance-ids ${instanceId} --query 'Reservations[0].Instances[0].State.Name' --output text --region ${REGION}`,
      );
      process.stdout.write(
        `\r  [${elapsed}s] Instance State: ${bold(state)} (waiting for auto-shutdown)...   `,
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
        `Builder instance timed out after ${elapsed}s (still not stopped — the install script likely failed before reaching shutdown; check with: aws ec2 get-console-output --instance-id ${instanceId} --region ${REGION}).`,
      );
    }

    // Step 3: Create AMI from stopped instance
    console.info("\n[3/5] Creating pre-baked AMI from stopped instance...");
    const createAmiRes = JSON.parse(
      exec(
        `aws ec2 create-image --instance-id ${instanceId} --name "${amiName}" --description "VeoLMS Pre-baked Worker AMI with Node.js 24 + FFmpeg + AWS CLI" --output json --region ${REGION}`,
      ),
    );
    amiId = createAmiRes.ImageId;
    console.info(`✔ AMI Creation initiated: ${bold(green(amiId))}`);

    // Step 4: Wait for AMI to be available
    console.info("\n[4/5] Waiting for AMI to become available...");
    exec(
      `aws ec2 wait image-available --image-ids ${amiId} --region ${REGION}`,
    );
    console.info(
      `✔ Pre-baked AMI is now ${bold(green("AVAILABLE"))}: ${bold(amiId)}`,
    );
  } catch (err: unknown) {
    console.error(
      `\n✘ Build step failed — terminating builder instance ${instanceId} before exiting...`,
    );
    try {
      exec(
        `aws ec2 terminate-instances --instance-ids ${instanceId} --region ${REGION}`,
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
    `aws ec2 terminate-instances --instance-ids ${instanceId} --region ${REGION}`,
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
  Architecture: ${bold(ARCHITECTURE)}
  Region:       ${bold(REGION)}

Workers booted with this AMI will now start transcoding in <30 seconds!
`);
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1])) {
  runBuildAmi().catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`\n✘ AMI build failed: ${msg}\n`);
    process.exit(1);
  });
}
