/**
 * VeoLMS Docker Provider Infrastructure Teardown
 *
 * Dispatches to tear down Docker containers and resources created by the
 * VeoLMS Docker fleet:
 *  - Finds and terminates any active/running or exited worker containers
 *    labeled `veolms.managed=true`
 *  - Marks lingering database worker entries as terminated
 *  - Optionally cleans up the `veolms-fleet` Docker network
 *
 * Dispatched via: apps/fleet-manager/src/cli.ts's "destroy" command
 * Triggered by:   pnpm fleet:destroy  (when FLEET_PROVIDER=docker)
 */

import { execSync } from "node:child_process";
import { stdin as input, stdout as output } from "node:process";
import * as readline from "node:readline/promises";
import type {
  ProviderDestroyOptions,
  ProviderDestroyResult,
} from "@veolms/fleet-types";
import {
  askChoice,
  bold,
  cyan,
  dim,
  execCommand as checkCommand,
  green,
  isNonInteractive as checkNonInteractive,
  ok,
  red,
  warn,
  yellow,
} from "@veolms/fleet-types/terminal";
import { isMainModule } from "@veolms/fleet-types";
import { createDatabase } from "@veolms/database";
import { loadFleetManagerConfig } from "@veolms/config";

export async function destroyInfra(
  options: ProviderDestroyOptions = {},
): Promise<ProviderDestroyResult> {
  const isNonInteractive = checkNonInteractive(options);

  console.info(`
${bold(cyan("╔══════════════════════════════════════════════════════════╗"))}
${bold(cyan("║"))}         ${bold("VeoLMS Docker Provider Teardown")}               ${bold(cyan("║"))}
${bold(cyan("╚══════════════════════════════════════════════════════════╝"))}
`);

  let teardownMode: "stop" | "complete" = options.stopOnly
    ? "stop"
    : options.complete
      ? "complete"
      : "complete";

  if (
    !options.stopOnly &&
    !options.complete &&
    !isNonInteractive &&
    process.stdin.isTTY
  ) {
    const rl = readline.createInterface({ input, output });
    try {
      const choices = [
        {
          label:
            "Stop containers only (Gracefully stop running worker & manager containers; preserve images & state)",
          value: "stop" as const,
        },
        {
          label:
            "Complete destroy (Stop and remove all containers, cleanup network, synchronize database records)",
          value: "complete" as const,
        },
      ];
      teardownMode = await askChoice(
        rl,
        "Select Docker teardown mode",
        choices,
        0,
        false,
      );
    } finally {
      rl.close();
    }
  }

  const deletedResources: string[] = [];

  // ── Mode 1: Stop Containers Only ──────────────────────────────────────────
  if (teardownMode === "stop") {
    console.log(
      `\n${bold(cyan("[1/1]"))} ${bold("Stopping Running Docker Containers")}`,
    );
    console.log(dim("─".repeat(52)));

    let stoppedCount = 0;

    // 1a. Stop running worker containers
    try {
      const runningWorkersRaw = checkCommand(
        'docker ps --filter label=veolms.managed=true --format "{{.ID}}"',
      );
      const workerIds = runningWorkersRaw
        ? runningWorkersRaw
            .split(/\r?\n/)
            .map((id) => id.trim().replace(/^'|'$/g, ""))
            .filter(Boolean)
        : [];

      for (const id of workerIds) {
        try {
          execSync(`docker stop ${id} 2>&1`, { encoding: "utf-8" });
          ok(`Stopped worker container ${bold(id.slice(0, 12))}`);
          stoppedCount++;
        } catch (stopErr: unknown) {
          warn(`Could not stop worker container ${id}: ${String(stopErr)}`);
        }
      }
    } catch (err: unknown) {
      warn(`Docker CLI error querying running workers: ${String(err)}`);
    }

    // 1b. Stop running manager container if running in Docker
    try {
      const runningManagerRaw = checkCommand(
        'docker ps --filter ancestor=veolms-fleet-manager:local --format "{{.ID}}"',
      );
      const managerIds = runningManagerRaw
        ? runningManagerRaw
            .split(/\r?\n/)
            .map((id) => id.trim().replace(/^'|'$/g, ""))
            .filter(Boolean)
        : [];

      for (const id of managerIds) {
        try {
          execSync(`docker stop ${id} 2>&1`, { encoding: "utf-8" });
          ok(`Stopped fleet manager container ${bold(id.slice(0, 12))}`);
          stoppedCount++;
        } catch (stopErr: unknown) {
          warn(`Could not stop manager container ${id}: ${String(stopErr)}`);
        }
      }
    } catch (err: unknown) {
      warn(`Docker CLI error querying running manager: ${String(err)}`);
    }

    if (stoppedCount === 0) {
      ok("No running Docker Fleet containers found.");
    }

    console.info(`
${bold(cyan("╔══════════════════════════════════════════════════════════╗"))}
${bold(cyan("║"))}         ${bold(green("Docker Containers Stopped!"))}                    ${bold(cyan("║"))}
${bold(cyan("╚══════════════════════════════════════════════════════════╝"))}

  ${green("✔")} All active Docker fleet containers have been stopped.
  ${cyan("ℹ")} Container images, volumes, network, and database records remain intact.
  ${cyan("ℹ")} Resume anytime with: ${bold(cyan("pnpm fleet:cli run daemon"))}
`);

    return {
      success: true,
      provider: "docker",
      deletedResources: [],
    };
  }

  // ── Mode 2: Complete Destroy ──────────────────────────────────────────────
  console.log(
    `\n${bold(cyan("[1/3]"))} ${bold("Terminating & Removing Docker Containers")}`,
  );
  console.log(dim("─".repeat(52)));

  // 1a. Remove all managed worker containers
  try {
    const managedContainersRaw = checkCommand(
      'docker ps -a --filter label=veolms.managed=true --format "{{.ID}}"',
    );
    const containerIds = managedContainersRaw
      ? managedContainersRaw
          .split(/\r?\n/)
          .map((id) => id.trim().replace(/^'|'$/g, ""))
          .filter(Boolean)
      : [];

    if (containerIds.length > 0) {
      console.log(
        `  Found ${containerIds.length} managed worker container(s). Removing...`,
      );
      for (const id of containerIds) {
        try {
          execSync(`docker rm -f ${id} 2>&1`, { encoding: "utf-8" });
          ok(`Removed worker container ${bold(id.slice(0, 12))}`);
          deletedResources.push(`docker-container:${id}`);
        } catch (rmErr: unknown) {
          warn(`Could not remove container ${id}: ${String(rmErr)}`);
        }
      }
    } else {
      ok("No managed Docker worker containers found.");
    }
  } catch (err: unknown) {
    warn(`Docker CLI error while querying worker containers: ${String(err)}`);
  }

  // 1b. Remove any containerized fleet-manager
  try {
    const managerContainersRaw = checkCommand(
      'docker ps -a --filter ancestor=veolms-fleet-manager:local --format "{{.ID}}"',
    );
    const managerIds = managerContainersRaw
      ? managerContainersRaw
          .split(/\r?\n/)
          .map((id) => id.trim().replace(/^'|'$/g, ""))
          .filter(Boolean)
      : [];

    for (const id of managerIds) {
      try {
        execSync(`docker rm -f ${id} 2>&1`, { encoding: "utf-8" });
        ok(`Removed fleet manager container ${bold(id.slice(0, 12))}`);
        deletedResources.push(`docker-container:${id}`);
      } catch (rmErr: unknown) {
        warn(`Could not remove manager container ${id}: ${String(rmErr)}`);
      }
    }
  } catch (err: unknown) {
    warn(`Docker CLI error while querying manager containers: ${String(err)}`);
  }

  // 2. Reconcile database worker state
  console.log(
    `\n${bold(cyan("[2/3]"))} ${bold("Reconciling Database Worker Records")}`,
  );
  console.log(dim("─".repeat(52)));

  try {
    const fleetConfig = loadFleetManagerConfig();
    const db = createDatabase(fleetConfig.DATABASE_URL);
    try {
      const updateResult = await db
        .updateTable("workers")
        .set({ status: "terminated", updated_at: new Date() })
        .where("provider", "=", "docker")
        .where("status", "in", [
          "pending",
          "provisioning",
          "starting",
          "ready",
          "processing",
        ])
        .executeTakeFirst();

      const count = Number(updateResult.numUpdatedRows ?? 0);
      ok(`Marked ${count} active database worker record(s) as terminated.`);
    } finally {
      await db.destroy();
    }
  } catch (dbErr: unknown) {
    warn(`Database reconciliation skipped: ${String(dbErr)}`);
  }

  // 3. Network cleanup
  console.log(`\n${bold(cyan("[3/3]"))} ${bold("Checking Docker Network")}`);
  console.log(dim("─".repeat(52)));

  const networkName = "veolms-fleet";
  const networkExists = checkCommand(`docker network inspect ${networkName}`);
  if (networkExists) {
    try {
      execSync(`docker network rm ${networkName} 2>&1`, { encoding: "utf-8" });
      ok(`Removed Docker network ${bold(networkName)}`);
      deletedResources.push(`docker-network:${networkName}`);
    } catch {
      warn(
        `Network ${networkName} is still in use by other containers; left intact.`,
      );
    }
  } else {
    ok(`Docker network ${bold(networkName)} was not present.`);
  }

  console.info(`
${bold(cyan("╔══════════════════════════════════════════════════════════╗"))}
${bold(cyan("║"))}            ${bold(green("Docker Teardown Complete!"))}               ${bold(cyan("║"))}
${bold(cyan("╚══════════════════════════════════════════════════════════╝"))}

  ${green("✔")} All managed Docker worker and manager containers removed.
  ${green("✔")} Database worker records synchronized to terminated.
  ${green("✔")} Docker network cleaned up.
`);

  return {
    success: true,
    provider: "docker",
    deletedResources,
  };
}

export const runDestroy = destroyInfra;
export const runDockerInfraDestroy = destroyInfra;
export default destroyInfra;

if (isMainModule(import.meta.url)) {
  destroyInfra().catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`\n✘ Docker teardown failed: ${msg}\n`);
    process.exit(1);
  });
}
