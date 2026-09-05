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
import { resolveFleetProvider } from "../core/provider-resolver.ts";

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

  const repoRoot = join(
    dirname(fileURLToPath(import.meta.url)),
    "..",
    "..",
    "..",
    "..",
  );
  const defaultWorkerScript = join(repoRoot, "apps/media-worker/src/index.ts");
  const workerScript =
    config.MEDIA_WORKER_SCRIPT_PATH ??
    (existsSync(defaultWorkerScript) ? defaultWorkerScript : undefined);

  const provider: FleetProvider =
    options.provider ??
    (await resolveFleetProvider(config.PROVIDER, {
      workerScriptPath: workerScript,
    }));

  const fleet = createFleetManager({
    provider,
    db,
    config,
  });

  const startPromise = fleet.startServerfulLoop(signal).finally(async () => {
    try {
      await db.destroy();
    } catch (destroyErr: unknown) {
      console.error(
        "[serverful-fleet] Error closing database connection:",
        destroyErr,
      );
    }
  });

  return { fleet, startPromise };
}
