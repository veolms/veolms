import { z } from "zod";

export const healthResponseSchema = z
  .object({
    status: z.literal("ok"),
  })
  .describe("The API is running and able to serve requests.");

export type HealthResponse = z.output<typeof healthResponseSchema>;
