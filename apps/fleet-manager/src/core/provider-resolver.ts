import type { FleetProvider } from "@veolms/fleet-types";
import type { FleetManagerConfig } from "@veolms/config";
import { loadModuleFunction } from "./dynamic-module.ts";

const BUILTIN_PROVIDERS: Record<
  string,
  () => Promise<Record<string, unknown>>
> = {
  "@veolms/fleet-provider-aws": () =>
    import("@veolms/fleet-provider-aws") as unknown as Promise<
      Record<string, unknown>
    >,
  "@veolms/fleet-provider-local": () =>
    import("@veolms/fleet-provider-local") as unknown as Promise<
      Record<string, unknown>
    >,
  "@veolms/fleet-provider-docker": () =>
    import("@veolms/fleet-provider-docker") as unknown as Promise<
      Record<string, unknown>
    >,
};

export async function resolveFleetProvider(
  providerName: string,
  options?: unknown,
): Promise<FleetProvider> {
  const normalized = providerName.trim().toLowerCase();
  const packageName = normalized.startsWith("@")
    ? normalized
    : `@veolms/fleet-provider-${normalized}`;

  try {
    const candidateExportNames = [
      "createProvider",
      "createAwsProvider",
      "createLocalProvider",
      "createDockerProvider",
      "default",
    ];

    let factory: ((opts?: unknown) => FleetProvider) | undefined;

    if (BUILTIN_PROVIDERS[packageName]) {
      try {
        const mod = await BUILTIN_PROVIDERS[packageName]();
        for (const name of candidateExportNames) {
          const candidate = mod[name];
          if (typeof candidate === "function") {
            factory = candidate as (opts?: unknown) => FleetProvider;
            break;
          }
        }
      } catch {
        // Fall back to dynamic import
      }
    }

    if (!factory) {
      factory = await loadModuleFunction<(opts?: unknown) => FleetProvider>(
        packageName,
        candidateExportNames,
        `Package "${packageName}" did not export a valid provider factory function.`,
      );
    }

    return factory(options);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(
      `[fleet-manager] Could not load provider "${providerName}" (${packageName}). Run "pnpm fleet:provider" to select and install it. Details: ${message}`,
    );
  }
}

export function resolveFleetProviderOptions(
  config: FleetManagerConfig,
  workerScriptPath?: string,
  providerName: string = config.PROVIDER,
): unknown {
  if (providerName.trim().toUpperCase() === "DOCKER") {
    return {
      image: config.DOCKER_WORKER_IMAGE,
      network: config.DOCKER_NETWORK,
      storageRoot: config.DOCKER_STORAGE_ROOT,
      verificationStorageRoot: config.DOCKER_VERIFICATION_STORAGE_ROOT,
      workerDatabaseUrl: config.DATABASE_URL,
      transport: config.DOCKER_TRANSPORT,
      socketPath: config.DOCKER_SOCKET_PATH,
      defaultEnv: {
        FLEET_TEST_MODE: String(config.FLEET_TEST_MODE),
        // Keep worker heartbeats safely inside the manager's existing timeout;
        // no second heartbeat env setting is needed.
        HEARTBEAT_INTERVAL_MS: String(
          Math.max(
            1000,
            Math.floor((config.HEARTBEAT_TIMEOUT_SECONDS * 1000) / 2),
          ),
        ),
      },
    };
  }
  return { workerScriptPath };
}
