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

## State Reconciliation & Dynamic Scheduling

- **Two-Way Reconciliation**: Actively reconciles PostgreSQL DB state against cloud provider instances (auto-recovering Spot interruptions, terminating orphaned EC2 instances, and verifying S3 output playlists). For detailed state transitions and recovery flows, see **[`docs/fleet/job-lifecycle-and-reconciliation.md`](../../docs/fleet/job-lifecycle-and-reconciliation.md)**.
- **Dynamic EventBridge Scheduling**: In serverless mode, calculates `min(next_check_at)` across active workers, schedules one-shot `at(timestamp)` wakeups via EventBridge Scheduler, and deletes the schedule when idle (zero idle cost). For mathematical details and formulas, see **[`docs/fleet/dynamic-scheduling.md`](../../docs/fleet/dynamic-scheduling.md)**.
- **Job Cancellation**: Marks jobs as `cancelled`, unassigns workers, trips worker abort signals, and purges S3 artifacts.

---

## CLI & Operations

Run commands using `pnpm` from the monorepo root:

```bash
# Start long-running serverful daemon
pnpm fleet:cli run

# Queue a transcoding job
pnpm fleet:cli queue my-video.mp4 --qualities=1080p,720p,480p --prefix=transcoded/my-video/

# Queue & trigger video task (interactive or with flags)
pnpm fleet:queue:trigger

# Queue & trigger with specific video key and qualities
pnpm fleet:queue:trigger --key=raw/video.mp4 --qty=720p,360p

# Cancel an active/queued job and purge its S3 files
pnpm fleet:queue:trigger --cancel --job-id=<job-uuid>

# View job status, worker handle, and diagnostic events
pnpm fleet:cli status <job-id>

# View cluster health metrics (queued, processing, stalled count)
pnpm fleet:cli health

# List active and recent workers
pnpm fleet:cli workers

# Terminate stalled zombie workers manually
pnpm fleet:cli prune

# Select active provider (AWS / Local)
pnpm fleet:provider

# Provision infrastructure (IAM roles, Lambda, S3 bundle, log groups, or local storage)
pnpm fleet:infra

# Tear down infrastructure
pnpm fleet:destroy
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

All providers are pluggable packages and follow the specification defined in [`packages/fleet-types/AGENTS.md`](../../packages/fleet-types/AGENTS.md).

To add a new cloud or local provider (e.g. `@veolms/fleet-provider-gcp` or `@veolms/fleet-provider-kubernetes`):

1. Follow the step-by-step checklist in [`packages/fleet-types/AGENTS.md`](../../packages/fleet-types/AGENTS.md).
2. Create `packages/fleet-provider-<name>`.
3. Implement `FleetProvider` in `src/index.ts` and the standard lifecycle exports:
   - `./setup`: `configureEnv`, `provisionInfra`, `runInfraSetup`
   - `./destroy`: `destroyInfra`, `runDestroy`
   - `./trigger`: `triggerTest`, `runTrigger`
4. Providers are dynamically discovered—`apps/fleet-manager` requires zero vendor code!
