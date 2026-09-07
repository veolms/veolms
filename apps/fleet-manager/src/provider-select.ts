import { execSync } from "node:child_process";
import { isMainModule } from "@veolms/fleet-types";

export interface ProviderOption {
  id: string;
  name: string;
  pkg: string;
  description: string;
  status: "available" | "planned";
  requiresInstall?: boolean;
}

export const AVAILABLE_PROVIDERS: readonly ProviderOption[] = [
  {
    id: "aws",
    name: "Amazon Web Services (AWS)",
    pkg: "@veolms/fleet-provider-aws",
    description:
      "EC2 Spot/On-Demand ARM64 Graviton & x86 workers + AWS Lambda + S3 + CloudWatch",
    status: "available",
  },
  {
    id: "local",
    name: "Local Machine (Development)",
    pkg: "@veolms/fleet-provider-local",
    description:
      "Local Node.js child processes + local FFmpeg for zero-cost offline development",
    status: "available",
  },
  {
    id: "docker",
    name: "Docker Engine (Local Fleet)",
    pkg: "@veolms/fleet-provider-docker",
    description:
      "One ephemeral media-worker container per job, shared s3-bucket mount, and Docker socket orchestration",
    status: "available",
    requiresInstall: false,
  },
  {
    id: "gcp",
    name: "Google Cloud Platform (GCP)",
    pkg: "@veolms/fleet-provider-gcp",
    description:
      "Google Compute Engine instances + Cloud Functions + Cloud Storage",
    status: "planned",
  },
  {
    id: "azure",
    name: "Microsoft Azure",
    pkg: "@veolms/fleet-provider-azure",
    description:
      "Azure Virtual Machines + Azure Functions + Azure Blob Storage",
    status: "planned",
  },
];

function setEnvValue(content: string, key: string, value: string): string {
  const entry = `${key}=${JSON.stringify(value)}`;
  const pattern = new RegExp(`^${key}=.*$`, "m");
  return pattern.test(content)
    ? content.replace(pattern, entry)
    : `${content}${entry}\n`;
}

function getEnvValue(content: string, key: string): string | undefined {
  const match = content.match(new RegExp(`^${key}=(.*)$`, "m"));
  if (!match?.[1]) {
    return undefined;
  }
  const raw = match[1].trim();
  return raw.replace(/^(["'])(.*)\1$/, "$2");
}

function removeEnvValue(content: string, key: string): string {
  return content.replace(new RegExp(`^${key}=.*\\n?`, "gm"), "");
}

function detectDockerSocketGid(): string | undefined {
  // Docker Desktop bind-mounts the host socket into the Linux VM as root:root,
  // so the container must join group 0 even when the host-side socket has a
  // different GID. Native Linux engines preserve the socket GID.
  try {
    const operatingSystem = execSync(
      "docker info --format '{{.OperatingSystem}}'",
      {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      },
    ).trim();
    if (/docker desktop/i.test(operatingSystem)) {
      return "0";
    }
  } catch {
    // Fall back to the host socket metadata when Docker info is unavailable.
  }

  try {
    const gid = execSync("stat -c %g /var/run/docker.sock", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return /^\d+$/.test(gid) ? gid : undefined;
  } catch {
    return undefined;
  }
}

export async function runProviderSelection(): Promise<void> {
}

if (isMainModule(import.meta.url)) {
  runProviderSelection().catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`\n✘ Provider selection failed: ${message}\n`);
    process.exit(1);
  });
}
