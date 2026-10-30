import type { VideoJobEvent } from "@veolms/contracts";
import type { ServerConfig } from "@veolms/config";
import type { FastifyBaseLogger } from "fastify";
import type { VideoDispatchService } from "./types.ts";

/**
 * Strategy 2: Direct API Server Transcoding (stubbed/placeholder)
 */
export function createDirectDispatcher(options: {
  config: ServerConfig;
  logger: FastifyBaseLogger;
}): VideoDispatchService {
  const { logger } = options;

  async function dispatch(payload: VideoJobEvent): Promise<void> {
    logger.info(
      { jobId: payload.jobId, videoId: payload.videoId },
      "[video-dispatch:direct] Registered job for direct API server transcoding (stubbed for future extension)",
    );
  }

  return { dispatch };
}
