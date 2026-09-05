import { z } from "zod";

/**
 * Single source of truth for "which provider name did the caller mean".
 *
 * Precedence: an explicit override (e.g. a --provider CLI flag) always
 * wins; otherwise PROVIDER, then FLEET_PROVIDER. An empty/whitespace-only
 * string is treated the same as unset at every level, so e.g.
 * `FLEET_PROVIDER=""` can't force an invalid empty PROVIDER downstream.
 */
export function resolveProviderName(
  explicit?: string,
  env: Readonly<Record<string, string | undefined>> = process.env,
): string | undefined {
  if (typeof explicit === "string" && explicit.trim() !== "") {
    return explicit.trim().toUpperCase();
  }
  for (const key of ["PROVIDER", "FLEET_PROVIDER"] as const) {
    const value = env[key];
    if (typeof value === "string" && value.trim() !== "") {
      return value.trim().toUpperCase();
    }
  }
  return undefined;
}

const baseFleetManagerConfigSchema = z.object({
  DATABASE_URL: z
    .string()
    .default("postgresql://veolms:veolms@localhost:5433/veolms"),
  PROVIDER: z.enum(["LOCAL", "DOCKER", "AWS"]).default("LOCAL"),
  POLL_INTERVAL_MS: z.coerce.number().int().min(500).default(2000),
  HEARTBEAT_TIMEOUT_SECONDS: z.coerce.number().int().min(10).default(90),
  MIN_CHECK_INTERVAL_SECONDS: z.coerce.number().int().min(5).default(15),
  MAX_CHECK_INTERVAL_SECONDS: z.coerce.number().int().min(30).default(300),
  DEFAULT_CHECK_INTERVAL_SECONDS: z.coerce.number().int().min(10).default(30),
  MAX_RETRIES: z.coerce.number().int().min(0).default(3),
  MAX_WORKERS: z.coerce.number().int().min(1).default(8),
  MEDIA_WORKER_SCRIPT_PATH: z.string().optional(),
  DOCKER_WORKER_IMAGE: z.string().default("veolms-media-worker:local"),
  DOCKER_NETWORK: z.string().optional(),
  // `socket` lets a LocalStack Lambda create workers without a Docker CLI
  // or LocalStack's paid Docker-backed EC2 emulation.
  DOCKER_TRANSPORT: z.enum(["cli", "socket"]).default("cli"),
  DOCKER_SOCKET_PATH: z.string().default("/var/run/docker.sock"),
  // This must be a host-visible absolute path when the manager itself runs
  // in Compose, because the Docker daemon resolves bind-mount sources.
  DOCKER_STORAGE_ROOT: z.string().optional(),
  // The manager container's corresponding mounted path, used for output
  // verification after the worker exits.
  DOCKER_VERIFICATION_STORAGE_ROOT: z.string().optional(),
  FLEET_TEST_MODE: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
});

export const fleetManagerConfigSchema = z.preprocess((raw) => {
  if (raw && typeof raw === "object") {
    const record = raw as Record<string, string | undefined>;
    const provider = resolveProviderName(undefined, record);
    const { PROVIDER: _rawProvider, ...rest } = record;
    return provider !== undefined ? { ...rest, PROVIDER: provider } : rest;
  }
  return raw;
}, baseFleetManagerConfigSchema);

export type FleetManagerConfig = z.infer<typeof baseFleetManagerConfigSchema>;

export function loadFleetManagerConfig(
  env: Readonly<Record<string, string | undefined>> = process.env,
): FleetManagerConfig {
  return fleetManagerConfigSchema.parse(env);
}
