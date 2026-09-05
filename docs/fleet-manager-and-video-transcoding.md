# Fleet Manager & Video Transcoding Pipeline Documentation

This directory provides the complete documentation suite for the **VeoLMS Ephemeral Video Transcoding Fleet** and **Autonomous Media Worker Engine**.

To ensure accuracy and avoid duplication, each architectural component, lifecycle phase, and operational workflow is documented in its dedicated canonical guide below:

---

## 🧭 Documentation Directory

| Topic                                    | Description                                                                                                                      | Authoritative Document                                                                                      |
| :--------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------- |
| **Fleet Architecture & Control Plane**   | Control Plane design, 2-Lambda pipeline (Probe + Fleet Manager), provider boundary, dynamic loader                               | [`docs/fleet/architecture.md`](./fleet/architecture.md)                                                     |
| **Hardware Sizing & Machine Tiers**      | Probed video metadata analysis, compute tiers (`NANO` → `LARGE`), EC2 Graviton selection                                         | [`docs/fleet/hardware-sizing-and-instance-selection.md`](./fleet/hardware-sizing-and-instance-selection.md) |
| **Job Lifecycle & State Reconciliation** | PostgreSQL ACID state machine (`FOR UPDATE SKIP LOCKED`), heartbeat checks, spot interruption, zombie instance cleanup           | [`docs/fleet/job-lifecycle-and-reconciliation.md`](./fleet/job-lifecycle-and-reconciliation.md)             |
| **Dynamic Scheduling & EventBridge**     | Dynamic check intervals ($50\% \rightarrow 75\% \rightarrow 90\%$), serverless one-shot wakeups, scale-to-zero                   | [`docs/fleet/dynamic-scheduling.md`](./fleet/dynamic-scheduling.md)                                         |
| **Environment Configuration**            | Full reference for all Fleet Manager and AWS provider environment variables and defaults                                         | [`docs/fleet/configuration-and-cli.md`](./fleet/configuration-and-cli.md)                                   |
| **Media Worker Engine**                  | Standalone worker plane, FFmpeg multi-rendition HLS encoding, progress parser, incremental S3 streaming                          | [`docs/media-worker/index.md`](./media-worker/index.md)                                                     |
| **Pluggable Provider Architecture**      | Golden rules, lifecycle contracts (`configureEnv`, `provisionInfra`, `destroyInfra`, `triggerTest`), step-by-step provider guide | [`packages/fleet-types/AGENTS.md`](../packages/fleet-types/AGENTS.md)                                       |
| **Complete CLI Command Reference**       | Command matrix and detailed usage for `pnpm fleet:provider`, `fleet:infra`, `fleet:destroy`, `fleet:queue:trigger`, `fleet:cli`  | [`docs/fleet-commands-and-operations.md`](./fleet-commands-and-operations.md)                               |
| **AWS Infrastructure & CI/CD Guide**     | End-to-end setup guide, least-privilege IAM deployer user, and GitHub Actions automation                                         | [`docs/video-fleet-infrastructure-and-cicd-guide.md`](./video-fleet-infrastructure-and-cicd-guide.md)       |
| **Manual Verification Runbook**          | Interactive CLI prompt transcript and real AWS verification walkthrough                                                          | [`docs/fleet-manual-verification.md`](./fleet-manual-verification.md)                                       |
