# VeoLMS Fleet Types (`@veolms/fleet-types`)

Shared, zero-`any` TypeScript types, contracts, quality profiles, and hardware estimation algorithms used by `@veolms/fleet-manager`, `@veolms/media-worker`, and all `@veolms/fleet-provider-*` adapter packages.

---

## Core Modules

### 1. Quality Profiles & Video Formats ([`src/quality.ts`](./src/quality.ts))

- Supported Video Codecs: `h264`, `h265`, `av1`.
- Supported Audio Codecs: `aac`, `opus`.
- Standardized `QUALITY_PROFILES` for all 8 resolutions:
  - `2160p` (4K): 3840x2160 @ 60fps, 14 Mbps video, 192 kbps audio
  - `1440p` (2K): 2560x1440 @ 60fps, 8 Mbps video, 192 kbps audio
  - `1080p` (FHD): 1920x1080 @ 30fps, 4.5 Mbps video, 128 kbps audio
  - `720p` (HD): 1280x720 @ 30fps, 2.4 Mbps video, 128 kbps audio
  - `480p` (SD): 854x480 @ 30fps, 1.2 Mbps video, 96 kbps audio
  - `360p`: 640x360 @ 30fps, 800 kbps video, 96 kbps audio
  - `240p`: 426x240 @ 30fps, 400 kbps video, 64 kbps audio
  - `144p`: 256x144 @ 30fps, 200 kbps video, 48 kbps audio
- Default standard qualities array: `["1080p", "720p", "480p", "360p"]`.

---

### 2. Hardware Estimation ([`src/video-job.ts`](./src/video-job.ts))

The `estimateJobHardware(videoSizeBytes, qualities, duration)` function determines exact hardware specifications needed for a job:

- **CPU & RAM**:
  - `2160p` (4K): Min 8 vCPUs / 16 GB RAM.
  - `1440p` or $\ge 5$ renditions: Min 4 vCPUs / 8 GB RAM.
  - Standard (1080p and lower): Min 2 vCPUs / 4 GB RAM.
- **Storage Requirement**:
  $$\text{Storage (GB)} = \left\lceil \text{Source Size (GB)} + \left(\frac{\text{Duration (s)} \times \text{Total Bitrate (bps)}}{8 \times 1024^3}\right) + 10\text{ GB Safety Margin} \right\rceil$$

---

### 3. Provider Interface Contract ([`src/provider.ts`](./src/provider.ts))

Every provider package must implement the `FleetProvider` interface:

```typescript
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

  // Two-way cluster reconciliation & dynamic scheduling hooks
  listActiveInstances?(): Promise<readonly ActiveProviderInstance[]>;
  scheduleNextWakeup?(
    targetTime: Date,
    payload: Readonly<Record<string, unknown>>,
  ): Promise<void>;
  cancelWakeup?(): Promise<void>;
  verifyJobOutput?(outputPrefix: string): Promise<boolean>;
}
```

---

### 4. Worker Specifications & Handles ([`src/worker.ts`](./src/worker.ts))

- `WorkerSpec`: `cpu`, `memoryMb`, `architecture` (`arm64` / `x86_64`), `storageGb`, `region`, `amiId`, `environmentVariables`, `tags`.
- `WorkerHandle`: `id`, `providerWorkerId`, `provider`, `status`, `privateIp`, `publicIp`, `createdAt`.

---

### 5. Monitoring & Progress Update Schemas ([`src/monitoring.ts`](./src/monitoring.ts))

- `ProgressUpdate`: `workerId`, `jobId`, `progressPercent`, `processedSeconds`, `totalDurationSeconds`, `fps`, `speed`, `currentQuality`.
- `MonitoringConfig`: `heartbeatTimeoutSeconds` (90s), `minCheckIntervalSeconds` (15s), `maxCheckIntervalSeconds` (300s).

---

## Running Tests

```bash
pnpm --filter @veolms/fleet-types test
pnpm --filter @veolms/fleet-types typecheck
```
