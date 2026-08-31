# VeoLMS Fleet Manager (`apps/fleet-manager`)

The **Fleet Manager** is the control-plane orchestrator responsible for managing ephemeral video transcoding workers and job lifecycles. It supports both **serverful daemon mode** (long-running polling loop) and **serverless mode** (AWS Lambda / Cloud Functions triggered on-demand and via dynamic AWS EventBridge Scheduler one-shot timers).

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    Triggers & Invocations                   │
│  - API Direct Queue                                         │
│  - EventBridge Scheduler: at(min_next_check_at)             │
│  - Serverful Polling Daemon (every POLL_INTERVAL_MS)        │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                     apps/fleet-manager                      │
│                        Control Plane                        │
│                                                             │
│  1. Reconcile Cluster State:                                │
│     - Detect & recover dead EC2 / Spot-interrupted workers   │
│     - Terminate orphaned zombie EC2 instances               │
│     - Verify S3 master.m3u8 output on completed jobs        │
│                                                             │
│  2. Monitor Workers:                                        │
│     - Heartbeat timeouts (HEARTBEAT_TIMEOUT_SECONDS)        │
│     - Progress monitoring & dynamic check interval scaling  │
│                                                             │
│  3. Claim & Provision Queued Jobs:                          │
│     - SELECT ... FOR UPDATE SKIP LOCKED                     │
│     - Size compute specs from video size & target qualities │
│     - Delegate launch to active FleetProvider               │
│                                                             │
│  4. Dynamic Wakeup Schedule Sync:                           │
│     - Calculate min(next_check_at) across active workers    │
│     - Upsert / Delete 'veolms-fleet-next-check' schedule    │
└──────────────────────────────┬──────────────────────────────┘
                               │
                implements FleetProvider interface
                               │
           ┌───────────────────┴───────────────────┐
           ▼                                       ▼
┌─────────────────────┐                 ┌─────────────────────┐
│ @veolms/             │                 │ @veolms/            │
│ fleet-provider-local│                 │ fleet-provider-aws  │
│ (Node child process)│                 │ (EC2 Spot/On-Demand)│
└─────────────────────┘                 └─────────────────────┘
```

---

## Core Components

| Component              | File                                                               | Description                                                                                                            |
| :--------------------- | :----------------------------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------- |
| **`FleetManager`**     | [`src/core/fleet-manager.ts`](./src/core/fleet-manager.ts)         | Master coordinator; runs ticks, monitoring cycles, job provisioning, and schedule sync.                                |
| **`JobManager`**       | [`src/core/video-job-manager.ts`](./src/core/video-job-manager.ts) | Atomic queue claims with `FOR UPDATE SKIP LOCKED`, status updates, and retry logic.                                    |
| **`WorkerManager`**    | [`src/core/worker-manager.ts`](./src/core/worker-manager.ts)       | Hardware sizing calculation (`cpu`, `memory`, `storage`), active worker tracking, and safe termination ordering.       |
| **`Scheduler`**        | [`src/core/scheduler.ts`](./src/core/scheduler.ts)                 | Dynamic check-in interval calculator based on estimated duration and reported progress percentage.                     |
| **`Monitor`**          | [`src/core/monitor.ts`](./src/core/monitor.ts)                     | Two-way cluster reconciliation, heartbeat timeout detection, orphan recovery, and S3 output verification.              |
| **`ProviderResolver`** | [`src/core/provider-resolver.ts`](./src/core/provider-resolver.ts) | Pluggable dynamic import loader for provider packages (`@veolms/fleet-provider-${name}`).                              |
| **`ServerlessEntry`**  | [`src/entrypoints/serverless.ts`](./src/entrypoints/serverless.ts) | Universal execution cycle for AWS Lambda / Cloud Functions, parsing direct JSON, CloudEvents, base64, or HTTP proxies. |
| **`ServerfulEntry`**   | [`src/entrypoints/serverful.ts`](./src/entrypoints/serverful.ts)   | Continuous background daemon loop with `AbortSignal` shutdown handling.                                                |

---

## Two-Way State Reconciliation

The Fleet Manager actively reconciles state between the PostgreSQL database and real cloud instances:

1. **Spot Interruption & Unexpected Worker Crash**:
   - If a DB worker is in `provisioning`, `starting`, `ready`, or `processing`, but its EC2 instance is terminated/missing in AWS (past a 30s launch grace period):
   - The worker is marked `failed` with event `spot_interrupted`.
   - The associated video job has its `attempts` incremented and is automatically reset to `queued` if `attempts < max_attempts` (or marked `failed` if retries exhausted).

2. **Orphaned Cloud Instances (Zombie Cleanup)**:
   - If an EC2 instance tagged with `ManagedBy: veolms-fleet-manager` is running in AWS but has no matching active worker in the database (and is older than 3 minutes):
   - Fleet Manager terminates the instance via `provider.terminateWorker()` and logs `orphan_instance_terminated` to prevent cost leaks.

3. **Storage Output Verification**:
   - When a job completes, Fleet Manager verifies that the target `master.m3u8` playlist exists in S3 (with non-zero size) before finalizing `completed` status.

---

## Dynamic EventBridge Scheduler Integration

In serverless environments (AWS Lambda), Fleet Manager avoids expensive fixed polling:

- After every tick or job claim, `fleet.syncWakeupSchedule()` computes `min(next_check_at)` across all active workers.
- It upserts a single one-shot schedule named `veolms-fleet-next-check` in AWS EventBridge Scheduler targeting the Lambda ARN at that exact timestamp (`at(YYYY-MM-DDTHH:mm:ss)`).
- When all active jobs complete and no workers remain, `cancelWakeup()` automatically deletes the schedule. **Zero workers = zero Lambda invocations = zero idle cost.**

---

## CLI & Operations

Run commands using `pnpm` from the monorepo root or package directory:

```bash
# Start long-running serverful daemon
pnpm fleet run

# Queue a transcoding job
pnpm fleet queue my-video.mp4 --qualities=1080p,720p,480p --prefix=transcoded/my-video/

# View job status, worker handle, and diagnostic events
pnpm fleet status <job-id>

# View cluster health metrics (queued, processing, stalled count)
pnpm fleet health

# List active and recent workers
pnpm fleet workers

# Terminate stalled zombie workers manually
pnpm fleet prune

# Select active provider (AWS / Local)
pnpm fleet provider

# Provision AWS infrastructure (IAM roles, Lambda, S3 bundle, log groups)
pnpm fleet infra

# Tear down cloud infrastructure
pnpm fleet destroy
```

---

## Running Tests

```bash
# Run unit & integration tests
pnpm --filter @veolms/fleet-manager test

# Run typecheck
pnpm --filter @veolms/fleet-manager typecheck
```

---

## How to Contribute a New Provider

To add a new cloud provider (e.g. `@veolms/fleet-provider-gcp` or `@veolms/fleet-provider-azure`):

1. Create `packages/fleet-provider-<name>`.
2. Implement the `FleetProvider` interface defined in `@veolms/fleet-types`:
   - `createWorker(id, spec)`
   - `getWorker(providerWorkerId)`
   - `getWorkerStatus(providerWorkerId)`
   - `terminateWorker(providerWorkerId)`
   - `healthCheck(providerWorkerId)`
   - `listActiveInstances?()`
   - `scheduleNextWakeup?(targetTime, payload)`
   - `cancelWakeup?()`
   - `verifyJobOutput?(outputPrefix)`
3. Export a factory function named `createProvider` or `create<Name>Provider`.
4. Register the option in [`src/provider-select.ts`](./src/provider-select.ts).
