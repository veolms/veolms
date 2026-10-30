import type { VideoDispatchOptions, VideoDispatchService } from "./types.ts";
import { createMediaConvertDispatcher } from "./mediaconvert.dispatcher.ts";
import { createDirectDispatcher } from "./direct.dispatcher.ts";
import { createDistributedDispatcher } from "./distributed.dispatcher.ts";

export * from "./types.ts";
export * from "./mediaconvert.dispatcher.ts";
export * from "./direct.dispatcher.ts";
export * from "./distributed.dispatcher.ts";

/**
 * Creates the VideoDispatchService based on configured strategy:
 * 1. "mediaconvert" (inbuilt): Direct AWS MediaConvert SDK client integration.
 * 2. "direct" (api-server): In-process direct HLS on this API server instance (stubbed).
 * 3. "distributed" (worker-vm / lambda): External worker VMs, Lambda, or Fleet Manager trigger.
 */
export function createVideoDispatchService(
  options: VideoDispatchOptions,
): VideoDispatchService {
  const strategyRaw =
    options.strategy ||
    options.config.VIDEO_DISPATCH_STRATEGY ||
    "mediaconvert";

  const strategy = strategyRaw.toLowerCase();

  switch (strategy) {
    case "mediaconvert":
    case "inbuilt": {
      options.logger.info(
        {
          strategy: "mediaconvert",
          endpoint: options.config.MEDIACONVERT_ENDPOINT || "aws-default",
          region:
            options.config.MEDIACONVERT_REGION ||
            options.config.STORAGE_REGION ||
            "us-east-1",
        },
        "Initializing VideoDispatchService with Strategy 1: AWS MediaConvert (inbuilt)",
      );
      return createMediaConvertDispatcher({
        config: options.config,
        logger: options.logger,
      });
    }

    case "direct":
    case "api-server": {
      options.logger.info(
        { strategy: "direct" },
        "Initializing VideoDispatchService with Strategy 2: Direct API Server HLS (stubbed)",
      );
      return createDirectDispatcher({
        config: options.config,
        logger: options.logger,
      });
    }

    case "distributed":
    case "worker-vm":
    case "lambda":
    case "fleet":
    default: {
      options.logger.info(
        { strategy: "distributed" },
        "Initializing VideoDispatchService with Strategy 3: Distributed Worker VM / Lambda",
      );
      return createDistributedDispatcher({
        config: options.config,
        logger: options.logger,
        triggerUrl: options.triggerUrl,
        lambdaName: options.lambdaName,
      });
    }
  }
}
