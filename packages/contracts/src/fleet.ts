import { z } from "zod";

export const fleetTestFaultSchema = z.enum([
  "interrupt",
  "heartbeat-loss",
  "progress-stall",
  "worker-failure",
  "storage-failure",
]);

export type FleetTestFault = z.infer<typeof fleetTestFaultSchema>;
