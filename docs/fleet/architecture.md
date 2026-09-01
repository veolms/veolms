# Fleet Manager Architecture

The Fleet Manager serves as the **Control Plane** for video processing across VeoLMS. It is decoupled from the **Worker Plane** (`media-worker`), communicating through a shared PostgreSQL database and cloud provider APIs.

---

## Core Design Principles

1. **Provider Agnostic Core (`apps/fleet-manager`)**: All business logic, lifecycle transitions, hardware sizing algorithms, and reconciliation routines live in `apps/fleet-manager` without importing any cloud provider SDKs (AWS SDK, GCP SDK, etc.).
2. **Pluggable Provider Boundary (`packages/fleet-types` & `packages/fleet-provider-*`)**: Provider implementations implement the standard `FleetProvider` interface (`createWorker`, `getWorker`, `terminateWorker`, `healthCheck`, `listActiveInstances`, `scheduleNextWakeup`, `verifyJobOutput`).
3. **Database as the Source of Truth**: Coordination between the control plane and workers is state-machine-driven via PostgreSQL, utilizing row-level locks (`SELECT ... FOR UPDATE SKIP LOCKED`) to eliminate distributed locking infrastructure (like Redis or DynamoDB locks).
4. **Scale-to-Zero Serverless Support**: The fleet manager can run entirely as an ephemeral AWS Lambda function that triggers upon job creation, monitors active progress via scheduled one-shot wakeups, and terminates when the queue is idle.

---

## The 2-Lambda Serverless Pipeline

In AWS Serverless mode, the pipeline employs two specialized Lambda functions:

```text
 1. Upload Event / API Call
            │
            ▼
 ┌─────────────────────────────────────────────────────────────┐
 │           veolms-video-metadata-probe (Lambda)              │
 │  - Attached Layer: veolms-ffprobe (static musl build)       │
 │  - Inspects remote video (S3 presigned URL / CloudFront)   │
 │  - Extracts: width, height, durationSeconds, codec, fps     │
 │  - Enriches payload with `videoMetadata` object             │
 └──────────────────────────────┬──────────────────────────────┘
                                │ Invokes RequestResponse
                                ▼
 ┌─────────────────────────────────────────────────────────────┐
 │             veolms-fleet-manager (Lambda)                   │
 │  - Universal Serverless Control Plane Handler               │
 │  - Resolves machine tier (NANO → MICRO → SMALL → MED → LRG) │
 │  - Atomically queues/claims job in PostgreSQL               │
 │  - Sizes & launches optimal EC2 Spot worker (c7g/c8g/c6g)   │
 │  - Schedules next monitoring cycle via EventBridge          │
 └─────────────────────────────────────────────────────────────┘
```

### Direct Trigger Fallback

If the main `veolms-fleet-manager` is invoked directly (bypassing the Probe Lambda), or if metadata probing fails (e.g. invalid format or network timeouts), the control plane automatically falls back to sizing based on requested target qualities and byte size.

---

## Core Internal Modules

| Module Path                     | Responsibility                                                                                                                                                                |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/core/fleet-manager.ts`     | Orchestrates single execution cycles (`runTick`), monitoring sweeps (`runMonitoringCycle`), and serverful polling loops (`startServerfulLoop`).                               |
| `src/core/video-job-manager.ts` | Manages job queuing, active job deduplication, worker assignment, and completion/failure marking.                                                                             |
| `src/core/worker-manager.ts`    | Calculates required hardware specs (`calculateWorkerSpec`), provisions worker handles via provider, tracks worker count capacity, and records audit events (`worker_events`). |
| `src/core/monitor.ts`           | Reconciles cloud instance state against DB, checks heartbeat timeouts, reclaims stalled jobs, reaps orphaned cloud instances, and verifies S3 outputs.                        |
| `src/core/scheduler.ts`         | Calculates dynamic adaptive check intervals based on job progress and estimated duration.                                                                                     |
| `src/core/provider-resolver.ts` | Dynamically imports the configured `FleetProvider` (e.g. `@veolms/fleet-provider-aws` or `@veolms/fleet-provider-local`) at startup.                                          |

---

## Provider Architecture

```text
                 ┌────────────────────────────────┐
                 │          FleetProvider         │
                 │         (@veolms/fleet-types)  │
                 └───────────────┬────────────────┘
                                 │
                 ┌───────────────┴────────────────┐
                 ▼                                ▼
┌─────────────────────────────────┐ ┌─────────────────────────────────┐
│     @veolms/fleet-provider-aws  │ │   @veolms/fleet-provider-local  │
│ - Launches EC2 Graviton workers │ │ - Spawns local child processes  │
│ - EventBridge wakeup scheduler  │ │ - Uses local filesystem storage │
│ - S3 output verification        │ │ - Ideal for offline development │
│ - Static ffprobe Lambda layer   │ │   and automated CI test runs    │
└─────────────────────────────────┘ └─────────────────────────────────┘
```
