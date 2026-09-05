import { InvokeCommand, LambdaClient } from "@aws-sdk/client-lambda";
import { S3Client } from "@aws-sdk/client-s3";
import type {
  LambdaResponse,
  VideoJobEvent,
  VideoMetadata,
} from "@veolms/contracts";
import { videoJobEventSchema } from "@veolms/contracts";
import { probeVideoMetadata, resolveS3VideoUrl } from "./prober.ts";

export interface ProbeLambdaConfig {
  readonly region?: string;
  readonly targetLambdaName?: string;
  readonly s3BucketName?: string;
  readonly lambdaClient?: LambdaClient;
  readonly s3Client?: S3Client;
  readonly ffprobePath?: string;
}

export function extractProbeEvent(rawEvent: unknown): Record<string, unknown> {
  if (!rawEvent || typeof rawEvent !== "object") {
    return {};
  }

  const record = rawEvent as Record<string, unknown>;
  let candidate: Record<string, unknown> = record;

  // Handle HTTP proxy integration format: event.body
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

  // Handle S3 Event Notification format
  if (Array.isArray(candidate.Records) && candidate.Records.length > 0) {
    const firstRecord = candidate.Records[0] as Record<string, unknown>;
    const s3Record = firstRecord?.s3 as Record<string, unknown> | undefined;
    const bucket = (s3Record?.bucket as Record<string, unknown>)?.name as
      string | undefined;
    const objectKey = (s3Record?.object as Record<string, unknown>)?.key as
      string | undefined;
    if (objectKey) {
      const decodedKey = decodeURIComponent(objectKey.replace(/\+/g, " "));
      return {
        action: "queue",
        videoKey: decodedKey,
        bucket,
      };
    }
  }

  return candidate;
}

export interface FleetManagerEvaluationResult {
  readonly success: boolean;
  readonly targetResult: unknown;
}

export function parseFleetManagerResponse(
  invokeResponse: { readonly FunctionError?: string; readonly Payload?: Uint8Array },
  options: { readonly isCancellation?: boolean } = {},
): FleetManagerEvaluationResult {
  let targetResult: unknown = {};
  if (invokeResponse.Payload) {
    try {
      const responseString = Buffer.from(invokeResponse.Payload).toString(
        "utf-8",
      );
      targetResult = JSON.parse(responseString);
    } catch {
      // Non-JSON response
    }
  }

  let bodyData: unknown = targetResult;
  if (
    targetResult &&
    typeof targetResult === "object" &&
    "body" in (targetResult as Record<string, unknown>)
  ) {
    const rawBody = (targetResult as Record<string, unknown>).body;
    if (typeof rawBody === "string") {
      try {
        const parsed = JSON.parse(rawBody);
        (targetResult as Record<string, unknown>).body = parsed;
        bodyData = parsed;
      } catch {
        bodyData = rawBody;
      }
    } else if (rawBody && typeof rawBody === "object") {
      bodyData = rawBody;
    }
  }

  if (invokeResponse.FunctionError) {
    console.error(
      `[probe-lambda] Downstream Lambda error (${invokeResponse.FunctionError}):`,
      targetResult,
    );
    return { success: false, targetResult };
  }

  const checkRecord = (rec: Record<string, unknown>): boolean => {
    // Check statusCode and status when numeric
    if (
      typeof rec.statusCode === "number" &&
      (rec.statusCode < 200 || rec.statusCode >= 300)
    ) {
      return false;
    }
    if (
      typeof rec.status === "number" &&
      (rec.status < 200 || rec.status >= 300)
    ) {
      return false;
    }

    // Explicit success boolean
    if (rec.success === false) {
      return false;
    }

    // Cancellation specific check: failure if cancelled is explicitly false
    if (options.isCancellation || rec.status === "cancelled") {
      if (rec.cancelled === false) {
        return false;
      }
    }

    // Error field presence
    if (rec.error) {
      return false;
    }

    // Status field string values
    if (typeof rec.status === "string") {
      const statusLower = rec.status.trim().toLowerCase();
      if (
        statusLower === "failed" ||
        statusLower === "error" ||
        statusLower === "failure" ||
        statusLower === "rejected"
      ) {
        return false;
      }
    }

    // Result field checks
    if (rec.result !== undefined) {
      if (rec.result === false) {
        return false;
      }
      if (typeof rec.result === "string") {
        const resultLower = rec.result.trim().toLowerCase();
        if (
          resultLower === "failed" ||
          resultLower === "error" ||
          resultLower === "failure" ||
          resultLower === "rejected"
        ) {
          return false;
        }
      }
      if (typeof rec.result === "object" && rec.result !== null) {
        const nested = rec.result as Record<string, unknown>;
        if (nested.success === false) {
          return false;
        }
        if (
          (options.isCancellation || nested.status === "cancelled") &&
          nested.cancelled === false
        ) {
          return false;
        }
        if (nested.error) {
          return false;
        }
        if (typeof nested.status === "string") {
          const nestedStatusLower = nested.status.trim().toLowerCase();
          if (
            nestedStatusLower === "failed" ||
            nestedStatusLower === "error" ||
            nestedStatusLower === "failure" ||
            nestedStatusLower === "rejected"
          ) {
            return false;
          }
        }
      }
    }

    return true;
  };

  if (targetResult && typeof targetResult === "object") {
    if (!checkRecord(targetResult as Record<string, unknown>)) {
      return { success: false, targetResult };
    }
  }

  if (bodyData && typeof bodyData === "object" && bodyData !== targetResult) {
    if (!checkRecord(bodyData as Record<string, unknown>)) {
      return { success: false, targetResult };
    }
  }

  if (bodyData === false) {
    return { success: false, targetResult };
  }

  if (typeof bodyData === "string") {
    const strLower = bodyData.trim().toLowerCase();
    if (
      strLower === "failed" ||
      strLower === "error" ||
      strLower === "failure" ||
      strLower === "rejected"
    ) {
      return { success: false, targetResult };
    }
  }

  return { success: true, targetResult };
}

export async function processProbeAndForward(
  rawEvent: unknown,
  customConfig: ProbeLambdaConfig = {},
): Promise<{
  success: boolean;
  probed: boolean;
  videoMetadata?: VideoMetadata;
  targetLambdaResponse?: unknown;
  error?: string;
}> {
  const payload = extractProbeEvent(rawEvent);
  const region =
    customConfig.region ??
    process.env["AWS_REGION"] ??
    process.env["AWS_DEFAULT_REGION"] ??
    "us-east-1";

  const targetLambdaName =
    customConfig.targetLambdaName ??
    process.env["FLEET_MANAGER_LAMBDA_NAME"] ??
    process.env["MAIN_LAMBDA_NAME"] ??
    "veolms-fleet-manager";

  const s3Bucket =
    customConfig.s3BucketName ??
    (typeof payload.bucket === "string" ? payload.bucket : undefined) ??
    process.env["S3_BUCKET"] ??
    process.env["S3_BUCKET_NAME"] ??
    process.env["STORAGE_BUCKET"];

  const endpoint =
    process.env["AWS_ENDPOINT_URL"] || process.env["LOCALSTACK_ENDPOINT"];
  const lambda =
    customConfig.lambdaClient ??
    new LambdaClient({
      region,
      ...(endpoint ? { endpoint } : {}),
    });
  const s3 =
    customConfig.s3Client ??
    new S3Client({
      region,
      ...(endpoint ? { endpoint, forcePathStyle: true } : {}),
    });

  if (payload.status === "cancelled") {
    const isExplicitlyFalse = (val: unknown) =>
      val === false ||
      (typeof val === "string" && val.trim().toLowerCase() === "false");
    const cancelPayload = {
      jobId: payload.jobId,
      status: "cancelled",
      deleteFiles:
        !isExplicitlyFalse(payload.deleteFiles) &&
        !isExplicitlyFalse(payload.deleteMedia),
      ...(payload.videoId ? { videoId: payload.videoId } : {}),
      ...(payload.videoKey ? { videoKey: payload.videoKey } : {}),
    };

    console.info(
      `[probe-lambda] Forwarding cancellation request for job ${cancelPayload.jobId ?? "(unknown)"} to Fleet Manager Lambda: ${targetLambdaName}`,
    );

    const invokeResponse = await lambda.send(
      new InvokeCommand({
        FunctionName: targetLambdaName,
        InvocationType: "RequestResponse",
        Payload: Buffer.from(JSON.stringify(cancelPayload)),
      }),
    );

    const { success, targetResult } = parseFleetManagerResponse(
      invokeResponse,
      { isCancellation: true },
    );

    if (!success && !invokeResponse.FunctionError) {
      console.error(
        `[probe-lambda] Fleet Manager cancellation response was unsuccessful:`,
        targetResult,
      );
    }

    return {
      success,
      probed: false,
      targetLambdaResponse: targetResult,
    };
  }

  const videoKey =
    typeof payload.videoKey === "string"
      ? payload.videoKey
      : typeof payload.video_key === "string"
        ? payload.video_key
        : typeof payload.key === "string"
          ? payload.key
          : undefined;

  let videoMetadata: VideoMetadata | undefined = undefined;
  let probed = false;

  if (videoKey) {
    try {
      let videoUrl = videoKey;
      if (!/^https?:\/\//i.test(videoKey)) {
        if (!s3Bucket) {
          throw new Error(
            "S3_BUCKET is required to presign videoKey for ffprobe metadata extraction.",
          );
        }
        videoUrl = await resolveS3VideoUrl(s3, s3Bucket, videoKey);
      }

      console.info(`[probe-lambda] Probing video metadata for: ${videoKey}`);
      videoMetadata = await probeVideoMetadata(videoUrl, {
        ffprobePath: customConfig.ffprobePath,
      });
      probed = true;
      console.info(
        `[probe-lambda] SUCCESS: Video metadata successfully probed. Extracted: ${videoMetadata.width}x${videoMetadata.height}, duration: ${videoMetadata.durationSeconds}s`,
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(
        `[probe-lambda] WARNING: Video metadata probing failed: ${msg}. Falling back to default direct trigger.`,
      );
    }
  }

  // Enrich payload with videoMetadata
  const enrichedPayload: Record<string, unknown> = {
    ...payload,
    ...(videoMetadata ? { videoMetadata } : {}),
  };

  // If videoSize was missing but ffprobe found file size, optionally backfill
  if (
    !enrichedPayload.videoSize &&
    videoMetadata?.bitrate &&
    videoMetadata?.durationSeconds
  ) {
    enrichedPayload.videoSize = Math.round(
      (videoMetadata.bitrate * videoMetadata.durationSeconds) / 8,
    );
  }

  console.info(
    `[probe-lambda] Invoking target Fleet Manager Lambda: ${targetLambdaName}`,
  );
  const invokeResponse = await lambda.send(
    new InvokeCommand({
      FunctionName: targetLambdaName,
      InvocationType: "RequestResponse",
      Payload: Buffer.from(JSON.stringify(enrichedPayload)),
    }),
  );

  const { success, targetResult } = parseFleetManagerResponse(invokeResponse);

  if (!success && !invokeResponse.FunctionError) {
    console.error(
      `[probe-lambda] Fleet Manager invocation response was unsuccessful:`,
      targetResult,
    );
  }

  return {
    success,
    probed,
    videoMetadata,
    targetLambdaResponse: targetResult,
  };
}

export async function handler(
  event: unknown = {},
  _context?: unknown,
): Promise<LambdaResponse> {
  console.info("[probe-lambda] Invoked with event:", JSON.stringify(event));

  try {
    const result = await processProbeAndForward(event);
    console.info(
      `[probe-lambda] Invocation complete. Success: ${result.success}, Video probed: ${result.probed}`,
    );
    return {
      statusCode: result.success ? 200 : 502,
      body: JSON.stringify(result),
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[probe-lambda] Handler fatal error:", message);
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

export default handler;
