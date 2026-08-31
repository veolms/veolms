# Fleet Manager

The **VeoLMS Fleet Manager** is the autonomous control plane responsible for orchestrating, sizing, provisioning, and reconciling the ephemeral compute fleet that executes video transcoding jobs.

It operates in two interchangeable runtimes:

- **Serverless Mode** (AWS Lambda / Cloud Functions): Event-driven, fully autonomous, scales to zero between jobs, self-schedules dynamic wakeups using EventBridge Scheduler.
- **Serverful Mode** (Persistent Daemon): Long-running polling loop for on-premise servers, local development, or dedicated management nodes.

---

## Documentation Map

- [Architecture & Control Plane Design](./architecture.md) — System boundaries, pluggable provider architecture, 2-Lambda pipeline (Probe Lambda + Control Plane Lambda), and database-driven coordination.
- [Hardware Sizing & EC2 Instance Selection](./hardware-sizing-and-instance-selection.md) — Probed metadata analysis (resolution, fps, codec, duration), 5 machine tiers (`NANO` $\rightarrow$ `LARGE`), and multi-candidate compute-optimized Graviton instance selection (`c7g`, `c8g`, `c6g`).
- [Job Lifecycle & Cluster Reconciliation](./job-lifecycle-and-reconciliation.md) — State transitions (`queued` $\rightarrow$ `provisioning` $\rightarrow$ `processing` $\rightarrow$ `completed`/`failed`), atomic locking (`SKIP LOCKED`), heartbeat monitoring, spot termination recovery, and output verification.
- [Dynamic Wakeup Scheduling](./dynamic-scheduling.md) — Serverless self-pacing using Amazon EventBridge Scheduler, progress-based adaptive polling intervals, and scale-to-zero lifecycle.
- [Configuration & CLI Reference](./configuration-and-cli.md) — Environment variables, provider selection, infra provisioning, fast bundling (`UPDATE_MODE=bundles`), CLI diagnostic commands, and health metrics.

---

## Quick Architecture Overview

```text
               Video Upload / API Trigger
                           │
                           ▼
          ┌──────────────────────────────────┐
          │  Video Metadata Probe Lambda     │  ◄── Attached with static ffprobe layer
          │  (veolms-video-metadata-probe)   │
          └────────────────┬─────────────────┘
                           │ Probes resolution, fps, codec, duration
                           ▼
          ┌──────────────────────────────────┐
          │  Fleet Manager Lambda / Daemon   │  ◄── Decides machine tier (NANO -> LARGE)
          │  (veolms-fleet-manager)          │      Calculates required hardware specs
          └────────────────┬─────────────────┘
                           │
               implements FleetProvider
                           │
            ┌──────────────┴──────────────┐
            ▼                             ▼
  ┌───────────────────┐         ┌───────────────────┐
  │   AWS Provider    │         │  Local Provider   │
  │  (EC2 Graviton)   │         │ (Child Processes) │
  └─────────┬─────────┘         └───────────────────┘
            │ Launches worker (c7g/c8g/c6g)
            ▼
  ┌───────────────────┐
  │   Media Worker    │ ◄── Transcodes to adaptive multi-bitrate HLS
  │   (media-worker)  │     Streams segments to S3 incrementally
  └───────────────────┘
```
