import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createDatabase } from "@veolms/database";
import type { FleetProvider } from "@veolms/fleet-types";
import {
  loadFleetManagerConfig,
  type FleetManagerConfig,
} from "@veolms/config";
import {
  createFleetManager,
  type FleetManager,
} from "../core/fleet-manager.ts";
import {
  resolveFleetProvider,
  resolveFleetProviderOptions,
} from "../core/provider-resolver.ts";

export interface StartServerfulOptions {
  configOverride?: Partial<FleetManagerConfig>;
  provider?: FleetProvider;
  signal?: AbortSignal;
}

export async function startServerfulFleetManager(
  options: StartServerfulOptions = {},
): Promise<{ fleet: FleetManager; startPromise: Promise<void> }> {
  const { configOverride, signal } = options;
  const config = {
    ...loadFleetManagerConfig(),
    ...configOverride,
  };

  const db = createDatabase(config.DATABASE_URL);

  const moduleDirectory =
    typeof import.meta.url === "string" && import.meta.url
      ? dirname(fileURLToPath(import.meta.url))
      : process.cwd();
  const repoRoot = join(moduleDirectory, "..", "..", "..", "..");
  const defaultWorkerScript = join(repoRoot, "apps/media-worker/src/index.ts");
  const workerScript =
    config.MEDIA_WORKER_SCRIPT_PATH ??
    (existsSync(defaultWorkerScript) ? defaultWorkerScript : undefined);

  const provider: FleetProvider =
    options.provider ??
    (await resolveFleetProvider(
      config.PROVIDER,
      resolveFleetProviderOptions(config, workerScript),
    ));

  const fleet = createFleetManager({
    provider,
    db,
    config,
  });

  const startPromise = fleet.startServerfulLoop(signal);

  return { fleet, startPromise };
}
