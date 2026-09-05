import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createDatabase, type Database } from "@veolms/database";
import type { Kysely } from "kysely";
import type {
  LambdaResponse,
  VideoJobEvent,
  VideoQualityLevel,
} from "@veolms/contracts";
import { LAMBDA_ACTIONS, videoJobEventSchema } from "@veolms/contracts";
import {
  loadFleetManagerConfig,
  resolveProviderName,
  type FleetManagerConfig,
} from "@veolms/config";
import type { FleetProvider } from "@veolms/fleet-types";
import {
  createFleetManager,
  type FleetManager,
  type MonitorCycleResult,
} from "../core/fleet-manager.ts";
import { resolveFleetProvider } from "../core/provider-resolver.ts";

export interface ServerlessFleetOptions {
  readonly configOverride?: Partial<FleetManagerConfig>;
  readonly provider?: FleetProvider;
  readonly providerName?: string;
  readonly providerOptions?: unknown;
  readonly db?: Kysely<Database>;
}

export interface ServerlessExecutionResult {
  readonly success: boolean;
  readonly status?: string;
  readonly cancelled?: boolean;
  readonly filesDeleted?: boolean;
  readonly jobId?: string;
  readonly deletedKeys?: readonly string[];
  readonly deletedPrefix?: string;
  readonly jobClaimed?: boolean;
  readonly monitorResult?: MonitorCycleResult;
  readonly nextWakeupScheduledAt?: string | null;
  readonly timestamp: string;
  readonly error?: string;
}

/**
 * Extracts and normalizes a VideoJobEvent payload from various serverless
 * invocation structures:
 * - Direct invocation payload (e.g. AWS Lambda SDK invoke, CloudEvent data)
 * - HTTP proxy payload (AWS Lambda Function URL, API Gateway, GCP HTTP function)
 */
export function extractVideoJobEvent(rawEvent: unknown): VideoJobEvent {
  if (!rawEvent || typeof rawEvent !== "object") {
    return {};
  }

  const record = rawEvent as Record<string, unknown>;
  let candidate: Record<string, unknown> = record;

  // Handle HTTP proxy integration format: event.body can be JSON string or base64
  if ("body" in record && record.body !== undefined && record.body !== null) {
    if (typeof record.body === "string") {
      try {
        const rawString =
          record.isBase64Encoded === true
            ? Buffer.from(record.body, "base64").toString("utf-8")
            : record.body;
        candidate = JSON.parse(rawString);
      } catch {
        candidate = {};
      }
    } else if (typeof record.body === "object" && record.body !== null) {
      candidate = record.body as Record<string, unknown>;
    }
  }

  // Safe parse against schema
  const parsed = videoJobEventSchema.safeParse(candidate);
  if (parsed.success) {
    return parsed.data;
  }

  // Fallback extraction for loose / non-UUID or partial payloads
  const result: Record<string, unknown> = {};
  if (typeof candidate.action === "string") {
    const action = candidate.action.toLowerCase();
    if (LAMBDA_ACTIONS.includes(action as (typeof LAMBDA_ACTIONS)[number])) {
      result.action = action;
    }
  }
  if (typeof candidate.status === "string") {
    result.status = candidate.status.toLowerCase();
  }
  if (typeof candidate.jobId === "string") result.jobId = candidate.jobId;
  if (typeof candidate.videoId === "string") result.videoId = candidate.videoId;
  if (typeof candidate.videoKey === "string")
    result.videoKey = candidate.videoKey;
  if (typeof candidate.outputPrefix === "string")
    result.outputPrefix = candidate.outputPrefix;
  if (Array.isArray(candidate.qualities))
    result.qualities = candidate.qualities;
  if (
    candidate.videoSize !== undefined &&
    !Number.isNaN(Number(candidate.videoSize))
  ) {
    result.videoSize = Number(candidate.videoSize);
  }
  if (candidate.videoMetadata && typeof candidate.videoMetadata === "object") {
    result.videoMetadata = candidate.videoMetadata as Record<string, unknown>;
  }
  const parseBool = (val: unknown): boolean | undefined => {
    if (typeof val === "boolean") return val;
    if (typeof val === "string") {
      const lower = val.trim().toLowerCase();
      if (lower === "true") return true;
      if (lower === "false") return false;
    }
    return undefined;
  };

  const parsedDeleteFiles = parseBool(candidate.deleteFiles);
  if (parsedDeleteFiles !== undefined) {
    result.deleteFiles = parsedDeleteFiles;
  }
  const parsedDeleteMedia = parseBool(candidate.deleteMedia);
  if (parsedDeleteMedia !== undefined) {
    result.deleteMedia = parsedDeleteMedia;
  }

  return result as VideoJobEvent;
}

/**
 * Executes a single serverless cycle for the Fleet Manager.
 *
 * Programmatic interface suitable for any cloud serverless function or container runtime.
 */
export async function runServerlessFleetCycle(
  rawEvent: unknown = {},
  options: ServerlessFleetOptions = {},
): Promise<ServerlessExecutionResult> {
  const event = extractVideoJobEvent(rawEvent);
  const config = {
    ...loadFleetManagerConfig(),
    ...options.configOverride,
  };

  const db = options.db ?? createDatabase(config.DATABASE_URL);
  const shouldCloseDb = !options.db;

  try {
    let provider = options.provider;
    if (!provider) {
      let repoRoot = process.cwd();
      try {
        if (typeof __dirname !== "undefined") {
          repoRoot = join(__dirname, "../../../..");
        } else if (
          typeof import.meta !== "undefined" &&
          typeof import.meta.url === "string" &&
          import.meta.url
        ) {
          repoRoot = join(
            dirname(fileURLToPath(import.meta.url)),
            "../../../..",
          );
        }
      } catch {
        // Fall back to process.cwd()
      }
      const defaultWorkerScript = join(
        repoRoot,
        "apps/media-worker/src/index.ts",
      );
      const workerScript =
        config.MEDIA_WORKER_SCRIPT_PATH ??
        (existsSync(defaultWorkerScript) ? defaultWorkerScript : undefined);

      const targetProviderName =
        resolveProviderName(options.providerName, process.env) ??
        config.PROVIDER ??
        "AWS";

      const providerOpts = options.providerOptions ?? {
        workerScriptPath: workerScript,
      };

      provider = await resolveFleetProvider(targetProviderName, providerOpts);
    }

    const fleet: FleetManager = createFleetManager({
      provider,
      db,
      config,
    });

    // 1. If status is CANCELLED:
    if (event.status === "cancelled") {
      let targetJobId = event.jobId;

      if (!targetJobId && (event.videoId || event.videoKey)) {
        const foundJob = await db
          .selectFrom("video_jobs")
          .select("id")
          .where((eb) =>
            eb.or([
              ...(event.videoId ? [eb("video_id", "=", event.videoId)] : []),
              ...(event.videoKey ? [eb("video_key", "=", event.videoKey)] : []),
            ]),
          )
          .orderBy("created_at", "desc")
          .executeTakeFirst();
        targetJobId = foundJob?.id;
      }

      if (targetJobId) {
        const shouldDeleteFiles =
          event.deleteFiles !== false && event.deleteMedia !== false;
        console.info(
          `[serverless-fleet] Processing cancellation for job ${targetJobId} (deleteFiles: ${shouldDeleteFiles})...`,
        );

        const cancelResult = await fleet.cancelJob({
          jobId: targetJobId,
          deleteFiles: shouldDeleteFiles,
        });

        // Run monitoring cycle to reconcile cluster state and sync schedule
        const monitorResult = await fleet.runMonitoringCycle();
        const nextWakeup = await fleet.syncWakeupSchedule();

        return {
          success: true,
          status: "cancelled",
          cancelled: cancelResult.cancelled,
          filesDeleted: cancelResult.filesDeleted,
          jobId: targetJobId,
          deletedKeys: cancelResult.deletedKeys,
          deletedPrefix: cancelResult.deletedPrefix,
          monitorResult,
          nextWakeupScheduledAt: nextWakeup ? nextWakeup.toISOString() : null,
          timestamp: new Date().toISOString(),
        };
      }

      return {
        success: false,
        status: "cancelled",
        cancelled: false,
        error: "Job ID not found for cancellation",
        timestamp: new Date().toISOString(),
      };
    }

    // 2. If action is QUEUE and video parameters are provided, ensure job is queued (idempotent)
    if (event.action === "queue" && event.videoKey) {
      const videoKey = event.videoKey;
      const isUuid = (val: string) =>
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          val,
        );

      const videoId =
        event.videoId && isUuid(event.videoId)
          ? event.videoId
          : event.jobId && isUuid(event.jobId)
            ? event.jobId
            : undefined;

      const jobId =
        event.jobId && isUuid(event.jobId) ? event.jobId : undefined;

      const filename = videoKey.split(/[/\\]/).pop() || "video.mp4";
      const cleanFilename = filename.replace(/\.[^/.]+$/, "");
      const outputPrefix = event.outputPrefix ?? `transcoded/${cleanFilename}/`;

      const qualities: readonly VideoQualityLevel[] = event.qualities ?? [
        "1080p",
        "720p",
        "480p",
        "360p",
      ];

      await fleet.queueJob({
        jobId,
        videoId,
        videoKey,
        outputPrefix,
        qualities,
        videoSize: event.videoSize ? Number(event.videoSize) : undefined,
        videoMetadata: event.videoMetadata,
      });
    }

    // 3. Run monitoring cycle first to clean up stale/timed-out workers and free capacity
    const monitorResult = await fleet.runMonitoringCycle();

    if (event.action === "monitor") {
      const nextWakeup = await fleet.syncWakeupSchedule();
      return {
        success: true,
        monitorResult,
        nextWakeupScheduledAt: nextWakeup ? nextWakeup.toISOString() : null,
        timestamp: new Date().toISOString(),
      };
    }

    // 4. Claim and provision next queued job
    const jobClaimed = await fleet.processNextJob();

    // 5. Synchronize dynamic EventBridge wakeup schedule
    const nextWakeup = await fleet.syncWakeupSchedule();

    return {
      success: true,
      jobClaimed,
      monitorResult,
      nextWakeupScheduledAt: nextWakeup ? nextWakeup.toISOString() : null,
      timestamp: new Date().toISOString(),
    };
  } finally {
    if (shouldCloseDb) {
      try {
        await db.destroy();
      } catch (destroyErr: unknown) {
        console.error(
          "[serverless-fleet] Error closing database connection:",
          destroyErr,
        );
      }
    }
  }
}

/**
 * Universal AWS Lambda / Function URL / Cloud Function handler.
 *
 * Compatible with:
 * - AWS Lambda Direct Invocations
 * - AWS Lambda Function URLs & API Gateway Proxy
 * - GCP Cloud Functions HTTP / Eventarc
 * - Generic serverless runtimes
 */
export async function handler(
  event: unknown = {},
  _context?: unknown,
): Promise<LambdaResponse> {
  console.info("[serverless-fleet] Invoked with event:", JSON.stringify(event));

  try {
    const result = await runServerlessFleetCycle(event);
    return {
      statusCode: 200,
      body: JSON.stringify(result),
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[serverless-fleet] Execution error:", message);
    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        error: message,
        timestamp: new Date().toISOString(),
      }),
    };
  }
}

/**
 * Creates an HTTP request handler adapter (compatible with Express, Fastify, GCP HTTP Cloud Functions).
 */
export function createHttpHandler(options: ServerlessFleetOptions = {}) {
  return async (
    req: { body?: unknown },
    res: {
      status(code: number): {
        json(data: unknown): void;
        send(data: unknown): void;
      };
    },
  ): Promise<void> => {
    try {
      const result = await runServerlessFleetCycle(req.body ?? {}, options);
      res.status(200).json(result);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({
        success: false,
        error: message,
        timestamp: new Date().toISOString(),
      });
    }
  };
}

export default handler;
