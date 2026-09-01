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

  if (invokeResponse.FunctionError) {
    console.error(
      `[probe-lambda] Downstream Lambda error (${invokeResponse.FunctionError}):`,
      targetResult,
    );
  }

  return {
    success: !invokeResponse.FunctionError,
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
