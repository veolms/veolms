import type { VideoJobEvent } from "@veolms/contracts";
import type { ServerConfig } from "@veolms/config";
import type { FastifyBaseLogger } from "fastify";

/**
 * Three Supported Video Dispatch Strategies:
 * 1. "mediaconvert" (inbuilt): Direct AWS MediaConvert SDK client integration (AWS or MediaConvert-compatible endpoint).
 * 2. "direct" (api-server): In-process direct HLS transcoding on the API server instance.
 * 3. "distributed" (worker-vm / lambda): Managed on API server with worker running on external VM or Lambda.
 */
export type VideoDispatchStrategy =
  | "mediaconvert"
  | "inbuilt"
  | "direct"
  | "api-server"
  | "distributed"
  | "worker-vm"
  | "lambda"
  | "fleet";

export interface VideoDispatchService {
  dispatch(payload: VideoJobEvent): Promise<void>;
}

export interface VideoDispatchOptions {
  strategy?: VideoDispatchStrategy;
  config: ServerConfig;
  logger: FastifyBaseLogger;
  triggerUrl?: string;
  lambdaName?: string;
}
