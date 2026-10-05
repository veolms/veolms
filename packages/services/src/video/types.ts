import type { VideoJobEvent } from "@veolms/contracts";
import type { ServerConfig } from "@veolms/config";
import type { FastifyBaseLogger } from "fastify";

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
