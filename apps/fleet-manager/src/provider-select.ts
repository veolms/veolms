import { execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as readline from "node:readline/promises";
import { isMainModule } from "@veolms/fleet-types";
import { bold, cyan, dim, green, yellow } from "@veolms/fleet-types/terminal";

interface ProviderOption {
  id: string;
  name: string;
  pkg: string;
  description: string;
  status: "available" | "planned";
}

const AVAILABLE_PROVIDERS: readonly ProviderOption[] = [
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

export async function runProviderSelection(): Promise<void> {
  console.info(`
╔══════════════════════════════════════════════════════════════╗
║          VeoLMS Fleet Manager — Provider Selection           ║
╚══════════════════════════════════════════════════════════════╝
`);

  console.info("Select a provider package to install for the Fleet Manager:\n");

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

  let selectedIndex = -1;

  // Check CLI arguments for provider selection
  for (const arg of process.argv.slice(2)) {
    const val = arg.startsWith("--provider=")
      ? arg.split("=")[1]?.trim().toLowerCase()
      : arg.trim().toLowerCase();
    const idx = AVAILABLE_PROVIDERS.findIndex(
      (p, i) =>
        p.id === val ||
        p.name.toLowerCase() === val ||
        String(i + 1) === val,
    );
    if (idx >= 0 && AVAILABLE_PROVIDERS[idx]?.status === "available") {
      selectedIndex = idx;
      break;
    }
  }

  if (selectedIndex < 0) {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    while (selectedIndex < 0) {
      const answer = (await rl.question(bold("Select provider [1-4]: "))).trim();
      const parsed = parseInt(answer, 10);
      if (
        !Number.isNaN(parsed) &&
        parsed >= 1 &&
        parsed <= AVAILABLE_PROVIDERS.length
      ) {
        const chosen = AVAILABLE_PROVIDERS[parsed - 1];
        if (!chosen) {
          continue;
        }
        if (chosen.status === "planned") {
          console.warn(
            `\n  ${yellow(`⚠ ${chosen.name} is not yet implemented. Please select an available provider.`)}\n`,
          );
          continue;
        }
        selectedIndex = parsed - 1;
      } else {
        console.warn(
          `  Invalid choice. Please enter a number between 1 and ${AVAILABLE_PROVIDERS.length}.`,
        );
      }
    }

    rl.close();
  }

  const selectedProvider = AVAILABLE_PROVIDERS[selectedIndex];
  if (!selectedProvider) {
    throw new Error("Invalid provider selection.");
  }
  console.info(
    `\n✔ Selected Provider: ${bold(green(selectedProvider.name))} (${cyan(selectedProvider.pkg)})\n`,
  );

  // Step 1: Install the selected provider package in @veolms/fleet-manager
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

  // Step 2: Update apps/fleet-manager/.env
  console.info(
    `[2/3] Configuring FLEET_PROVIDER="${selectedProvider.id}" in apps/fleet-manager/.env...`,
  );

  const envPath = join(dirname(fileURLToPath(import.meta.url)), "..", ".env");
  let envContent = existsSync(envPath) ? readFileSync(envPath, "utf-8") : "";
  if (envContent && !envContent.endsWith("\n")) {
    envContent += "\n";
  }

  if (/^FLEET_PROVIDER=.*/m.test(envContent)) {
    envContent = envContent.replace(
      /^FLEET_PROVIDER=.*/m,
      `FLEET_PROVIDER="${selectedProvider.id}"`,
    );
  } else {
    envContent = `FLEET_PROVIDER="${selectedProvider.id}"\n${envContent}`;
  }

  if (/^PROVIDER=.*/m.test(envContent)) {
    envContent = envContent.replace(
      /^PROVIDER=.*/m,
      `PROVIDER="${selectedProvider.id}"`,
    );
  } else {
    envContent += `PROVIDER="${selectedProvider.id}"\n`;
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
  console.info(`  Run the following command to provision your infrastructure:`);
  console.info(`\n      ${bold(cyan("pnpm fleet:infra"))}\n`);
}

if (isMainModule(import.meta.url)) {
  runProviderSelection().catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`\n✘ Provider selection failed: ${message}\n`);
    process.exit(1);
  });
}
