import { z } from "zod";
import {
  ARCHITECTURES,
  architectureSchema,
  PROVIDER_TYPES,
  providerTypeSchema,
  WORKER_STATUSES,
  workerStatusSchema,
  type Architecture,
  type ProviderType,
  type WorkerStatus,
} from "@veolms/contracts";

export {
  ARCHITECTURES,
  architectureSchema,
  PROVIDER_TYPES,
  providerTypeSchema,
  WORKER_STATUSES,
  workerStatusSchema,
};
export type { Architecture, ProviderType, WorkerStatus };

export interface WorkerSpec {
  cpu: number;
  memoryMb: number;
  architecture: Architecture;
  storageGb: number;
  region: string;
  amiId?: string;
  environmentVariables: Readonly<Record<string, string>>;
  tags?: Readonly<Record<string, string>>;
}

export const workerSpecSchema = z.object({
  cpu: z.number().int().min(1),
  memoryMb: z.number().int().min(512),
  architecture: architectureSchema,
  storageGb: z.number().int().min(5).default(30),
  region: z.string().default("local"),
  amiId: z.string().optional(),
  environmentVariables: z.record(z.string(), z.string()).default({}),
  tags: z.record(z.string(), z.string()).optional(),
});

export interface WorkerHandle {
  id: string;
  providerWorkerId: string;
  provider: ProviderType;
  status: WorkerStatus;
  privateIp: string | null;
  publicIp: string | null;
  createdAt: Date;
}

export interface WorkerMetrics {
  cpuUsagePercent: number;
  memoryUsageMb: number;
  diskFreeGb: number;
  timestamp: Date;
}
