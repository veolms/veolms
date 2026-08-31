/**
 * AWS Lambda entrypoint for VeoLMS Fleet Manager.
 *
 * Delegates to the universal serverless handler in apps/fleet-manager.
 */
import type { VideoJobEvent, LambdaResponse } from "@veolms/contracts";
import {
  handler as universalHandler,
  runServerlessFleetCycle,
  extractVideoJobEvent,
} from "../../../apps/fleet-manager/src/entrypoints/serverless.ts";

export { runServerlessFleetCycle, extractVideoJobEvent };

export async function handler(
  event: VideoJobEvent = {},
  context?: unknown,
): Promise<LambdaResponse> {
  return universalHandler(event, context);
}

export default handler;
