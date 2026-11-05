import { z } from "zod";

export const healthResponseSchema = z
  .object({
    status: z.literal("ok"),
  })
  .describe("The API is running and able to serve requests.");

export type HealthResponse = z.output<typeof healthResponseSchema>;

export const capacityResponseSchema = z
  .object({
    status: z.literal("ok"),
    /** The whole machine's CPU in use, 5 s average, in percent. */
    cpuPercent: z.number(),
    /** The machine's memory in use (page cache not counted), in percent. */
    memoryPercent: z.number(),
    /** How late the API's event loop runs, 99th percentile of 1 s, in ms. */
    eventLoopDelayMs: z.number(),
  })
  .describe("This server has room for more requests.");

export type CapacityResponse = z.output<typeof capacityResponseSchema>;
