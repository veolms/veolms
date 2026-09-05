import type { WorkerSpec } from "@veolms/fleet-types";

export interface BootstrapperOptions {
  workerId: string;
  spec: WorkerSpec;
  repoUrl?: string;
  workerBundleS3Url?: string;
  extraEnv?: Readonly<Record<string, string>>;
}

export const DEFAULT_BOOTSTRAP_SCRIPT = `#!/bin/bash
set -uo pipefail
export DEBIAN_FRONTEND=noninteractive

exec > >(tee -a /var/log/veolms-bootstrap.log) 2>&1
echo "[bootstrapper] Initializing VeoLMS Transcoder Worker: __WORKER_ID__ at \$(date)"

cleanup_and_terminate() {
  local exit_code=\$?
  if [ "\$exit_code" -ne 0 ]; then
    echo "[bootstrapper] Bootstrap failed with exit code \$exit_code."
  fi

  if [ -n "\${BUCKET_NAME:-}" ] && command -v aws &> /dev/null; then
    aws s3 cp /var/log/veolms-bootstrap.log \\
      "s3://\$BUCKET_NAME/worker-logs/__WORKER_ID__/bootstrap.log" \\
      --region "\${AWS_REGION:-us-east-2}" 2>/dev/null || true
  fi

  echo "[bootstrapper] Terminating EC2 instance..."
  TOKEN=\$(curl -s -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 60" 2>/dev/null || true)
  if [ -n "\$TOKEN" ]; then
    INSTANCE_ID=\$(curl -s -H "X-aws-ec2-metadata-token: \$TOKEN" http://169.254.169.254/latest/meta-data/instance-id 2>/dev/null || true)
    INSTANCE_REGION=\$(curl -s -H "X-aws-ec2-metadata-token: \$TOKEN" http://169.254.169.254/latest/meta-data/placement/region 2>/dev/null || true)
  else
    INSTANCE_ID=\$(curl -s http://169.254.169.254/latest/meta-data/instance-id 2>/dev/null || true)
    INSTANCE_REGION="\${AWS_REGION:-us-east-2}"
  fi

  if [ -n "\$INSTANCE_ID" ] && command -v aws &> /dev/null; then
    aws ec2 terminate-instances --instance-ids "\$INSTANCE_ID" --region "\${INSTANCE_REGION:-us-east-2}" || shutdown -h now
  else
    shutdown -h now
  fi
}
trap cleanup_and_terminate EXIT

mkdir -p /opt/veolms
cat << 'EOF' > /opt/veolms/worker.env
__ENV_FILE_LINES__
EOF
chmod 600 /opt/veolms/worker.env

# Export environment variables for the current session
set -a
source /opt/veolms/worker.env
set +a

BUCKET_NAME="\${S3_BUCKET:-\${S3_BUCKET_NAME:-}}"

set -e

# Disable automatic background daily upgrades that lock dpkg
systemctl stop apt-daily.timer apt-daily-upgrade.timer apt-daily.service apt-daily-upgrade.service unattended-upgrades.service 2>/dev/null || true
systemctl kill --kill-who=all apt-daily.service apt-daily-upgrade.service 2>/dev/null || true
WAIT_START=\$(date +%s)
while fuser /var/lib/dpkg/lock-frontend >/dev/null 2>&1 || fuser /var/lib/apt/lists/lock >/dev/null 2>&1; do
  if [ \$(( \$(date +%s) - WAIT_START )) -gt 60 ]; then
    echo "[bootstrapper] Timed out waiting for dpkg/apt lock after 60s — continuing anyway."
    break
  fi
  sleep 1
done

# Install base dependencies
echo "[bootstrapper] Installing prerequisites (curl, ca-certificates, awscli, ffmpeg)..."
apt-get update -y
apt-get install -y --no-install-recommends curl ca-certificates gnupg awscli ffmpeg

# Install Node.js 22 LTS if missing
if ! command -v node &> /dev/null; then
  echo "[bootstrapper] Installing Node.js 22 LTS..."
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi

echo "[bootstrapper] System dependencies verified (node \$(node -v), ffmpeg \$(ffmpeg -version | head -n1))"

if [ -z "\$BUCKET_NAME" ]; then
  echo "[bootstrapper] No S3 bucket configured (S3_BUCKET/S3_BUCKET_NAME) — cannot download worker bundle."
  exit 1
fi

echo "[bootstrapper] Downloading worker bundle from s3://\$BUCKET_NAME/bundles/media-worker.js..."
aws s3 cp "s3://\$BUCKET_NAME/bundles/media-worker.js" /opt/veolms/worker.js --region "\${AWS_REGION:-us-east-2}"

echo "[bootstrapper] Launching VeoLMS Media Worker..."
cd /opt/veolms
node worker.js >> /var/log/veolms-worker.log 2>&1
echo "[bootstrapper] Worker run complete."
`;

export function getBootstrapScriptTemplate(): string {
  return DEFAULT_BOOTSTRAP_SCRIPT;
}

function escapeEnvValue(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/`/g, "\\`")
    .replace(/\$/g, "\\$")
    .replace(/\r?\n/g, "\\n");
}

export function generateUserDataScript(options: BootstrapperOptions): string {
  const { workerId, spec, extraEnv } = options;

  const mergedEnv: Record<string, string> = {
    WORKER_ID: workerId,
    PROVIDER: "aws",
    ...spec.environmentVariables,
    ...extraEnv,
  };

  const envFileLines = Object.entries(mergedEnv)
    .map(([k, v]) => `${k}="${escapeEnvValue(v)}"`)
    .join("\n");

  return DEFAULT_BOOTSTRAP_SCRIPT.replaceAll(
    "__WORKER_ID__",
    workerId,
  ).replaceAll("__ENV_FILE_LINES__", envFileLines);
}

/** LocalStack EC2 workers use a prebuilt Docker AMI and stay fully local. */
export function generateLocalStackUserDataScript(
  options: BootstrapperOptions,
): string {
  const mergedEnv: Record<string, string> = {
    WORKER_ID: options.workerId,
    PROVIDER: "aws",
    ...options.spec.environmentVariables,
    ...options.extraEnv,
  };
  const envFileLines = Object.entries(mergedEnv)
    .map(([key, value]) => `${key}="${escapeEnvValue(value)}"`)
    .join("\n");
  return `#!/bin/bash
set -eu
mkdir -p /opt/veolms
cat << 'EOF' > /opt/veolms/worker.env
${envFileLines}
EOF
set -a
source /opt/veolms/worker.env
set +a
cd /opt/veolms
exec node /opt/veolms/worker.js
`;
}

export function encodeUserDataBase64(script: string): string {
  return Buffer.from(script, "utf-8").toString("base64");
}
