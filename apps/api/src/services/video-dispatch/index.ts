import { InvokeCommand } from "@aws-sdk/client-lambda";
import type { FastifyBaseLogger } from "fastify";

import { getLambdaClient } from "../../lib/lambda.ts";

export interface VideoJobDispatchPayload {
  jobId: string;
  videoId: string;
  inputPath: string;
  quality: number[];
}

export interface VideoDispatchService {
  dispatch(payload: VideoJobDispatchPayload): Promise<void>;
}

export interface FleetManagerTriggerOptions {
  triggerUrl?: string;
  lambdaName?: string;
  logger: FastifyBaseLogger;
}

/**
 * Builds the service responsible for triggering Fleet Manager (Serverless Mode).
 * In serverless mode, notifies Fleet Manager Lambda via HTTP Function URL or AWS SDK Invoke.
 * In serverful mode or local dev with no lambda configured, Fleet Manager polls DB directly.
 */
export function createVideoDispatchService(
  options: FleetManagerTriggerOptions,
): VideoDispatchService {
  async function triggerViaHttp(
    url: string,
    payload: VideoJobDispatchPayload,
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
          `Fleet Manager trigger returned HTTP status ${response.status}: ${response.statusText}`,
        );
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  async function triggerViaLambdaSdk(
    functionName: string,
    payload: VideoJobDispatchPayload,
  ): Promise<void> {
    const client = getLambdaClient();
    const command = new InvokeCommand({
      FunctionName: functionName,
      InvocationType: "Event", // Asynchronous fire-and-forget
      Payload: Buffer.from(JSON.stringify(payload)),
    });

    const response = await client.send(command);
    if (response.StatusCode && (response.StatusCode < 200 || response.StatusCode >= 300)) {
      throw new Error(
        `Lambda invocation returned status code ${response.StatusCode}: ${response.FunctionError ?? "unknown error"}`,
      );
    }
  }

  async function dispatch(payload: VideoJobDispatchPayload): Promise<void> {
    options.logger.info(
      { jobId: payload.jobId, videoId: payload.videoId },
      "Triggering Fleet Manager for video job",
    );

    if (options.triggerUrl) {
      try {
        await triggerViaHttp(options.triggerUrl, payload);
        options.logger.info(
          { jobId: payload.jobId, triggerUrl: options.triggerUrl },
          "Successfully triggered Fleet Manager via HTTP trigger URL",
        );
      } catch (err) {
        options.logger.error(
          { err, jobId: payload.jobId },
          "Failed to trigger Fleet Manager via HTTP trigger URL",
        );
        throw err;
      }
    } else if (options.lambdaName) {
      try {
        await triggerViaLambdaSdk(options.lambdaName, payload);
        options.logger.info(
          { jobId: payload.jobId, lambdaName: options.lambdaName },
          "Successfully triggered Fleet Manager Lambda via AWS SDK",
        );
      } catch (err) {
        options.logger.error(
          { err, jobId: payload.jobId },
          "Failed to trigger Fleet Manager Lambda via AWS SDK",
        );
        throw err;
      }
    } else {
      options.logger.info(
        { jobId: payload.jobId },
        "Fleet Manager trigger not configured (serverful or local mode); Fleet Manager will reconcile directly from database",
      );
    }
  }

  return { dispatch };
}
