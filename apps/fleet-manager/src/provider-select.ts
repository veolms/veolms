import { execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as readline from "node:readline/promises";
import { bold, cyan, dim, green, yellow } from "@veolms/fleet-types/terminal";

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

export async function runProviderSelection(
  requestedProviderId?: string,
): Promise<void> {
  console.info(`
╔══════════════════════════════════════════════════════════════╗
║          VeoLMS Fleet Manager — Provider Selection           ║
╚══════════════════════════════════════════════════════════════╝
`);

  let selectedProvider: ProviderOption | undefined;
  if (requestedProviderId) {
    selectedProvider = AVAILABLE_PROVIDERS.find(
      (provider) => provider.id === requestedProviderId.toLowerCase(),
    );
  } else {
    console.info(
      "Select a provider package to install for the Fleet Manager:\n",
    );

    AVAILABLE_PROVIDERS.forEach((prov, index) => {
      const num = bold(`[${index + 1}]`);
      const statusTag =
        prov.status === "available"
          ? green("● Ready")
          : yellow("○ Planned for future release");
      console.info(`  ${num} ${bold(prov.name)} ${statusTag}`);
      console.info(`      Package: ${cyan(prov.pkg)}`);
      console.info(`      ${dim(prov.description)}\n`);
    });

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    while (!selectedProvider) {
      const answer = (
        await rl.question(
          bold(`Select provider [1-${AVAILABLE_PROVIDERS.length}]: `),
        )
      ).trim();
      const parsed = parseInt(answer, 10);
      const chosen =
        Number.isNaN(parsed) ||
        parsed < 1 ||
        parsed > AVAILABLE_PROVIDERS.length
          ? undefined
          : AVAILABLE_PROVIDERS[parsed - 1];
      if (!chosen) {
        console.warn(
          `  Invalid choice. Please enter a number between 1 and ${AVAILABLE_PROVIDERS.length}.`,
        );
      } else if (chosen.status === "planned") {
        console.warn(
          `\n  ${yellow(`⚠ ${chosen.name} is not yet implemented. Please select an available provider.`)}\n`,
        );
      } else {
        selectedProvider = chosen;
      }
    }
    rl.close();
  }

  if (!selectedProvider) {
    throw new Error(
      `Unknown provider "${requestedProviderId}". Use aws, local, or docker.`,
    );
  }
  if (selectedProvider.status === "planned") {
    throw new Error(`${selectedProvider.name} is not implemented yet.`);
  }
  console.info(
    `\n✔ Selected Provider: ${bold(green(selectedProvider.name))} (${cyan(selectedProvider.pkg)})\n`,
  );

  // Step 1: Install the selected provider package in @veolms/fleet-manager
  if (selectedProvider.requiresInstall !== false) {
    console.info(
      `[1/3] Installing ${cyan(selectedProvider.pkg)} into @veolms/fleet-manager...`,
    );
    try {
      execSync(
        `pnpm --filter @veolms/fleet-manager add "${selectedProvider.pkg}@workspace:*"`,
        {
          stdio: "inherit",
          cwd: process.cwd(),
        },
      );
      console.info(
        `✔ Successfully added ${cyan(selectedProvider.pkg)} to dependencies.\n`,
      );
    } catch (err: unknown) {
      console.warn(
        `⚠ Could not run pnpm add (workspace may already resolve package). Continuing...`,
      );
    }
  } else {
    console.info(
      `[1/3] ${cyan(selectedProvider.pkg)} is built in; no package installation is needed.\n`,
    );
  }

  // Step 2: Update apps/fleet-manager/.env
  console.info(
    `[2/3] Configuring FLEET_PROVIDER="${selectedProvider.id}" in apps/fleet-manager/.env...`,
  );

  const envPath = join(dirname(fileURLToPath(import.meta.url)), "..", ".env");
  let envContent = existsSync(envPath) ? readFileSync(envPath, "utf-8") : "";
  if (envContent && !envContent.endsWith("\n")) {
    envContent += "\n";
  }

  envContent = setEnvValue(envContent, "FLEET_PROVIDER", selectedProvider.id);
  envContent = setEnvValue(envContent, "PROVIDER", selectedProvider.id);

  if (selectedProvider.id === "docker") {
    const databaseUrl = getEnvValue(envContent, "DATABASE_URL");
    if (!databaseUrl) {
      throw new Error(
        "DATABASE_URL must be set in apps/fleet-manager/.env before selecting the Docker provider.",
      );
    }
    // Docker workers inherit DATABASE_URL and derive their heartbeat cadence
    // from HEARTBEAT_TIMEOUT_SECONDS; remove obsolete aliases from older setup.
    for (const key of [
      "FLEET_DATABASE_URL",
      "DOCKER_WORKER_DATABASE_URL",
      "DOCKER_WORKER_HEARTBEAT_INTERVAL_MS",
    ]) {
      envContent = removeEnvValue(envContent, key);
    }
    if (!getEnvValue(envContent, "DOCKER_WORKER_IMAGE")) {
      envContent = setEnvValue(
        envContent,
        "DOCKER_WORKER_IMAGE",
        "veolms-media-worker:local",
      );
    }
    if (!getEnvValue(envContent, "DOCKER_NETWORK")) {
      envContent = setEnvValue(envContent, "DOCKER_NETWORK", "veolms-fleet");
    }
    if (!getEnvValue(envContent, "DOCKER_SOCKET_GID")) {
      const socketGid = detectDockerSocketGid();
      if (socketGid) {
        envContent = setEnvValue(envContent, "DOCKER_SOCKET_GID", socketGid);
      }
    }
    if (!getEnvValue(envContent, "FLEET_TEST_MODE")) {
      envContent = setEnvValue(envContent, "FLEET_TEST_MODE", "true");
    }
  }

  writeFileSync(envPath, envContent, "utf-8");
  console.info(`✔ Updated ${dim(envPath)}\n`);

  // Step 3: Next Steps
  console.info(`[3/3] Configuration complete!\n`);
  console.info(
    `╔══════════════════════════════════════════════════════════════╗`,
  );
  console.info(
    `║                       NEXT STEPS                             ║`,
  );
  console.info(
    `╚══════════════════════════════════════════════════════════════╝`,
  );
  if (selectedProvider.id === "docker") {
    console.info(
      "  Docker Fleet uses DATABASE_URL and HEARTBEAT_TIMEOUT_SECONDS; obsolete worker-specific aliases were removed.",
    );
    console.info(`  Build and start the local Docker Fleet with:`);
    console.info(
      `\n      ${bold(cyan("pnpm fleet:images:build && pnpm fleet:local:up"))}\n`,
    );
  } else {
    console.info(
      `  Run the following command to provision your infrastructure:`,
    );
    console.info(`\n      ${bold(cyan("pnpm fleet:infra"))}\n`);
  }
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1])) {
  const providerArgument = process.argv.slice(2).find((argument) => {
    if (argument.startsWith("--provider=")) {
      return true;
    }
    return !argument.startsWith("-");
  });
  const requestedProvider = providerArgument?.startsWith("--provider=")
    ? providerArgument.slice("--provider=".length)
    : providerArgument;
  runProviderSelection(requestedProvider).catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`\n✘ Provider selection failed: ${message}\n`);
    process.exit(1);
  });
}
