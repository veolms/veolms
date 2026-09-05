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
  PROVIDER: z.enum(["LOCAL", "AWS"]).default("LOCAL"),
  POLL_INTERVAL_MS: z.coerce.number().int().min(500).default(2000),
  HEARTBEAT_TIMEOUT_SECONDS: z.coerce.number().int().min(10).default(90),
  PROVISIONING_TIMEOUT_SECONDS: z.coerce.number().int().min(30).default(600),
  MIN_CHECK_INTERVAL_SECONDS: z.coerce.number().int().min(5).default(15),
  MAX_CHECK_INTERVAL_SECONDS: z.coerce.number().int().min(30).default(300),
  DEFAULT_CHECK_INTERVAL_SECONDS: z.coerce.number().int().min(10).default(30),
  MAX_RETRIES: z.coerce.number().int().min(0).default(3),
  MAX_WORKERS: z.coerce.number().int().min(1).default(8),
  MEDIA_WORKER_SCRIPT_PATH: z.string().optional(),
  S3_BUILD_BUCKET: z.string().optional(),
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
