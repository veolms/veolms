import type {
  ProviderType,
  WorkerHandle,
  WorkerSpec,
  WorkerStatus,
} from "./worker.ts";

export interface ExecutionResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface HealthStatus {
  healthy: boolean;
  state: WorkerStatus;
  message?: string;
}

export interface ActiveProviderInstance {
  readonly providerWorkerId: string;
  readonly status: WorkerStatus;
  readonly launchTime?: Date;
  readonly workerId?: string | null;
}

export interface FleetProvider {
  readonly name: ProviderType;
  createWorker(id: string, spec: WorkerSpec): Promise<WorkerHandle>;
  getWorker(providerWorkerId: string): Promise<WorkerHandle | null>;
  getWorkerStatus(providerWorkerId: string): Promise<WorkerStatus>;
  execute?(
    providerWorkerId: string,
    command: readonly string[],
  ): Promise<ExecutionResult>;
  terminateWorker(providerWorkerId: string): Promise<void>;
  healthCheck(providerWorkerId: string): Promise<HealthStatus>;
  listActiveInstances?(): Promise<readonly ActiveProviderInstance[]>;
  scheduleNextWakeup?(
    targetTime: Date,
    payload: Readonly<Record<string, unknown>>,
  ): Promise<void>;
  cancelWakeup?(): Promise<void>;
  verifyJobOutput?(outputPrefix: string): Promise<boolean>;
}
