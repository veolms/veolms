import * as os from "node:os";
import { z } from "zod";

export interface DefaultUploadConcurrency {
  maxConcurrency: number;
  minConcurrency: number;
}

/**
 * Sizes upload concurrency to the actual worker instance instead of one
 * fixed number that's oversized for a t4g.small and undersized for a
 * c7g.4xlarge. Each in-flight upload buffers its whole file into memory
 * before sending (see uploadFiles in s3.ts), so both CPU count and total
 * memory bound how many can safely run at once — whichever resource is
 * more constrained wins, then clamped to a sane floor/ceiling so neither
 * a single-core nor a huge box produces a degenerate value.
 */
export function resolveDefaultUploadConcurrency(): DefaultUploadConcurrency {
  const cpuCount = os.cpus().length || 1;
  const totalMemGb = os.totalmem() / 1024 ** 3;

  const cpuBasedMax = cpuCount * 4;
  const memoryBasedMax = Math.floor(totalMemGb * 4);

  const maxConcurrency = Math.max(4, Math.min(cpuBasedMax, memoryBasedMax, 32));
  const minConcurrency = Math.max(2, Math.floor(maxConcurrency / 4));

  return { maxConcurrency, minConcurrency };
}

const baseMediaWorkerConfigSchema = z.object({
  WORKER_ID: z.string().uuid(),
  JOB_ID: z.string().uuid().optional(),
  DATABASE_URL: z
    .string()
    .default("postgresql://veolms:veolms@localhost:5433/veolms"),
  STORAGE_PROVIDER: z.enum(["local", "s3"]).default("local"),
  LOCAL_STORAGE_ROOT: z.string().default("s3-bucket"),
  WORKER_MAX_JOBS: z.coerce
    .number()
    .int()
    .min(1)
    .default(Number.MAX_SAFE_INTEGER),
  FLEET_TEST_MODE: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  S3_BUCKET: z.string().default("veolms-media"),
  S3_BUCKET_NAME: z.string().optional(),
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().default("us-east-1"),
  AWS_REGION: z.string().optional(),
  S3_FORCE_PATH_STYLE: z
    .enum(["true", "false"])
    .optional()
    .transform((val) => val === "true"),
  SCRATCH_DIR: z.string().default("/tmp/veolms-worker"),
  HEARTBEAT_INTERVAL_MS: z.coerce.number().int().min(1000).default(15000),
  HEARTBEAT_DRAIN_TIMEOUT_MS: z.coerce.number().int().min(0).default(5000),
  PROGRESS_UPDATE_INTERVAL_MS: z.coerce.number().int().min(1000).default(5000),
  WORKER_IDLE_POLL_SECONDS: z.coerce.number().int().min(1).default(15),
  VIDEO_COMPRESSION_CRF: z.coerce.number().int().min(0).max(51).default(22),
  UPLOAD_MAX_CONCURRENCY: z.coerce.number().int().min(1).optional(),
  UPLOAD_MIN_CONCURRENCY: z.coerce.number().int().min(1).optional(),
  UPLOAD_THROTTLE_CPU_PERCENT: z.coerce.number().min(1).max(100).default(80),
  UPLOAD_THROTTLE_MEMORY_PERCENT: z.coerce.number().min(1).max(100).default(80),
  INCREMENTAL_UPLOAD_POLL_MS: z.coerce.number().int().min(500).default(3000),
  INCREMENTAL_UPLOAD_SETTLE_MS: z.coerce.number().int().min(0).default(2000),
  INCREMENTAL_UPLOAD_DRAIN_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(0)
    .default(10000),
  HTTP_DOWNLOAD_TIMEOUT_MS: z.coerce.number().int().min(1000).default(300000),
  HTTP_DOWNLOAD_MAX_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .default(50 * 1024 * 1024 * 1024),
  FFMPEG_PATH: z.string().default("ffmpeg"),
  FFPROBE_PATH: z.string().default("ffprobe"),
});

// Cross-field invariant lives on the schema itself (not just in the loader
// below) so anyone parsing with mediaWorkerConfigSchema directly — docs
// generation, a future validation endpoint, tests — gets the same
// guarantee the loader enforces, instead of a schema that looks valid but
// silently accepts UPLOAD_MIN_CONCURRENCY > UPLOAD_MAX_CONCURRENCY. This
// only catches the case where both are given explicitly; the loader still
// re-checks after filling in host-dependent defaults for whichever one was
// omitted, since a machine's CPU/memory count isn't something a schema can
// know about.
export const mediaWorkerConfigSchema = baseMediaWorkerConfigSchema.refine(
  (val) =>
    val.UPLOAD_MIN_CONCURRENCY === undefined ||
    val.UPLOAD_MAX_CONCURRENCY === undefined ||
    val.UPLOAD_MIN_CONCURRENCY <= val.UPLOAD_MAX_CONCURRENCY,
  {
    message: "UPLOAD_MIN_CONCURRENCY must not exceed UPLOAD_MAX_CONCURRENCY",
    path: ["UPLOAD_MIN_CONCURRENCY"],
  },
);

type ParsedMediaWorkerConfig = z.infer<typeof baseMediaWorkerConfigSchema>;

export type MediaWorkerConfig = Omit<
  ParsedMediaWorkerConfig,
  "UPLOAD_MAX_CONCURRENCY" | "UPLOAD_MIN_CONCURRENCY"
> & {
  UPLOAD_MAX_CONCURRENCY: number;
  UPLOAD_MIN_CONCURRENCY: number;
};

export function loadMediaWorkerConfig(
  env: Readonly<Record<string, string | undefined>> = process.env,
): MediaWorkerConfig {
  const resolvedEnv = {
    ...env,
    S3_BUCKET: env["S3_BUCKET"] || env["S3_BUCKET_NAME"] || "veolms-media",
    S3_REGION: env["S3_REGION"] || env["AWS_REGION"] || "us-east-1",
  };
  const parsed = mediaWorkerConfigSchema.parse(resolvedEnv);
  const defaults = resolveDefaultUploadConcurrency();
  const maxConcurrency =
    parsed.UPLOAD_MAX_CONCURRENCY ?? defaults.maxConcurrency;
  const minConcurrency =
    parsed.UPLOAD_MIN_CONCURRENCY ?? defaults.minConcurrency;

  if (minConcurrency > maxConcurrency) {
    throw new Error(
      "UPLOAD_MIN_CONCURRENCY must not exceed UPLOAD_MAX_CONCURRENCY",
    );
  }

  return {
    ...parsed,
    UPLOAD_MAX_CONCURRENCY: maxConcurrency,
    UPLOAD_MIN_CONCURRENCY: minConcurrency,
  };
}
