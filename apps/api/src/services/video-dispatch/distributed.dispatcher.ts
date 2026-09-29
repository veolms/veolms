import { InvokeCommand } from "@aws-sdk/client-lambda";
import type { VideoJobEvent } from "@veolms/contracts";
import type { ServerConfig } from "@veolms/config";
import type { FastifyBaseLogger } from "fastify";
import { getLambdaClient } from "../../lib/lambda.ts";
import type { VideoDispatchService } from "./types.ts";

/**
 * Strategy 3: Distributed Execution
 * Video transcoding managed on API server with workers running on external VMs, Lambda, or Fleet Manager.
 */
export function createDistributedDispatcher(options: {
  config: ServerConfig;
  logger: FastifyBaseLogger;
  triggerUrl?: string;
  lambdaName?: string;
}): VideoDispatchService {
  const { logger } = options;
  const triggerUrl =
    options.triggerUrl || options.config.FLEET_MANAGER_TRIGGER_URL;
  const lambdaName =
    options.lambdaName ||
    options.config.PROBE_LAMBDA_NAME ||
    options.config.FLEET_MANAGER_LAMBDA_NAME;

  async function triggerViaHttp(
    url: string,
    payload: VideoJobEvent,
  ): Promise<void> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(
          `External worker trigger returned HTTP status ${response.status}: ${response.statusText}`,
        );
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  async function triggerViaLambdaSdk(
    funcName: string,
    payload: VideoJobEvent,
  ): Promise<void> {
    const client = getLambdaClient();
    const command = new InvokeCommand({
      FunctionName: funcName,
      InvocationType: "Event",
      Payload: Buffer.from(JSON.stringify(payload)),
    });

    const response = await client.send(command);
    if (
      response.StatusCode &&
      (response.StatusCode < 200 || response.StatusCode >= 300)
    ) {
      throw new Error(
        `Lambda invocation returned status code ${response.StatusCode}: ${response.FunctionError ?? "unknown error"}`,
      );
    }
  }

  async function dispatch(payload: VideoJobEvent): Promise<void> {
    logger.info(
      { jobId: payload.jobId, videoId: payload.videoId },
      "[video-dispatch:distributed] Triggering external worker for video job",
    );

    if (triggerUrl) {
      try {
        await triggerViaHttp(triggerUrl, payload);
        logger.info(
          { jobId: payload.jobId, triggerUrl },
          "[video-dispatch:distributed] Successfully triggered external worker via HTTP trigger URL",
        );
      } catch (err) {
        logger.error(
          { err, jobId: payload.jobId },
          "[video-dispatch:distributed] Failed to trigger external worker via HTTP trigger URL",
        );
        throw err;
      }
    } else if (lambdaName) {
      try {
        await triggerViaLambdaSdk(lambdaName, payload);
        logger.info(
          { jobId: payload.jobId, lambdaName },
          "[video-dispatch:distributed] Successfully triggered external worker via Lambda SDK",
        );
      } catch (err) {
        logger.error(
          { err, jobId: payload.jobId },
          "[video-dispatch:distributed] Failed to trigger external worker Lambda via AWS SDK",
        );
        throw err;
      }
    } else {
      logger.info(
        { jobId: payload.jobId },
        "[video-dispatch:distributed] External worker trigger not configured; worker will reconcile from database",
      );
    }
  }

  return { dispatch };
}
