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

export interface ProviderConfigOptions {
  interactive?: boolean;
  nonInteractive?: boolean;
  force?: boolean;
  cwd?: string;
  env?: Record<string, string | undefined>;
}

export interface ProviderConfigResult {
  envFiles: readonly string[];
  provider: string;
  config?: Record<string, unknown>;
}

export interface ProviderInfraOptions {
  interactive?: boolean;
  nonInteractive?: boolean;
  skipEnvConfig?: boolean;
  cwd?: string;
}

export interface ProviderInfraResult {
  success: boolean;
  provider: string;
  details?: Record<string, unknown>;
}

export interface ProviderDestroyOptions {
  interactive?: boolean;
  nonInteractive?: boolean;
  force?: boolean;
  cwd?: string;
}

export interface ProviderDestroyResult {
  success: boolean;
  provider: string;
  deletedResources?: readonly string[];
}

export interface ProviderTriggerOptions {
  jobId?: string;
  videoId?: string;
  videoKey?: string;
  outputPrefix?: string;
  qualities?: readonly string[];
  videoSize?: number;
  interactive?: boolean;
  nonInteractive?: boolean;
  cwd?: string;
  rawArgs?: readonly string[];
}

export interface ProviderTriggerResult {
  success: boolean;
  jobId?: string;
  workerId?: string;
  details?: Record<string, unknown>;
}

export interface FleetProviderLifecycleModule {
  configureEnv?(options?: ProviderConfigOptions): Promise<ProviderConfigResult>;
  provisionInfra?(options?: ProviderInfraOptions): Promise<ProviderInfraResult>;
  runInfraSetup?(
    options?: ProviderInfraOptions,
  ): Promise<ProviderInfraResult | void>;
  destroyInfra?(
    options?: ProviderDestroyOptions,
  ): Promise<ProviderDestroyResult | void>;
  triggerTest?(
    options?: ProviderTriggerOptions,
  ): Promise<ProviderTriggerResult | void>;
}
