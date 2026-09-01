import type { FleetProvider } from "@veolms/fleet-types";
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
