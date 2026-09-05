# Docker Fleet Fault-Test Report

Date: 2026-08-30  
Target: configured remote Neon PostgreSQL database, local Docker Engine  
Profile: `serverful`, `FLEET_PROVIDER=docker`, one worker container per job

## Test configuration

The fault runs used an isolated local video source mounted from `s3-bucket/`.
The manager was temporarily run with a 10-second heartbeat timeout and a
2-second worker heartbeat so timeout behavior could be observed quickly. Jobs
were created with the normal three-attempt limit unless otherwise stated.

Every test used the Docker provider. The worker mount was read/write at
`/app/s3-bucket`, and terminal containers were reconciled and removed.

## Results

| Scenario        | Evidence                                   | Observed result                                                                                                             | Retry / cleanup                                                                                |
| --------------- | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Interrupt       | Job `dc7d0fe0-7bca-457a-8332-5e03173a79d1` | `test_fault_requested`, `test_fault_applied`, then `heartbeat_timeout`                                                      | The manager terminated the stopped worker, retried once, and completed the job (`attempts=1`). |
| Heartbeat loss  | Job `9a22838a-849a-401f-91b6-c260407629d3` | Both fault audit events were recorded; `fleet_test_controls.applied_at` was set before timeout.                             | Timed out after 10 seconds, terminated, retried, then completed (`attempts=1`).                |
| Worker failure  | Job `b7ee5bdc-88b7-466f-88ac-726b2e9307c9` | Three requested/applied worker-failure controls; each worker exited and was recovered.                                      | Exhausted all three attempts and reached `failed` with no fourth worker.                       |
| Storage failure | Job `0e5d8823-6b94-4369-b6ed-5f4355c63d41` | Worker raised `Test fault: storage-failure` before copying final HLS files; `job_failed` recorded `willRetry=true`.         | First attempt failed, replacement completed and output was verified (`attempts=1`).            |
| Progress stall  | Job `7bc1776b-cbf4-46de-87a8-9243ad31bded` | While active: job and worker were `processing`, heartbeat continued, `progress_percent=0`, and `last_progress_at` was null. | The job completed normally with no retry. See the limitation below.                            |

The successful scenario outputs include non-empty `master.m3u8` files under
`s3-bucket/output/fault-matrix/`.

## What the Fleet does after a failure

1. It writes `test_fault_requested`; software faults write
   `test_fault_applied` when the worker observes the control. Interrupt leaves
   worker/job state unchanged before termination and writes both events after
   Docker termination succeeds.
2. Heartbeat loss, interruption, and abrupt worker exit are recovered by the
   heartbeat/reconciliation path. The worker is marked failed, the Docker
   container is terminated, and the job is returned to `queued` while
   `attempts < max_attempts`.
3. A worker-side storage error records `job_failed` directly, then follows the
   same retry rule.
4. At the retry limit the job becomes `failed`, has no assigned worker, and no
   replacement container is created.
5. A completed job whose `master.m3u8` later disappears is now re-queued or
   failed through the same retry logic. This fixes the previous repeated
   verification-warning loop.

## Current limitation: progress stalls

`progress-stall` intentionally suppresses FFmpeg progress writes while keeping
the worker alive. The current monitor schedules checks but does not enforce a
maximum age for `last_progress_at`, so this fault is visible in the timeline
but does not yet cause a retry. Add a progress-stall timeout if stalled
progress should be treated as a failure in production.

## Commands

```bash
pnpm fleet:provider docker
pnpm fleet:images:build
pnpm fleet:db:migrate
pnpm fleet:local:up

pnpm fleet:cli test fault interrupt --worker <worker-id>
pnpm fleet:cli test fault heartbeat-loss --worker <worker-id>
pnpm fleet:cli test fault progress-stall --worker <worker-id>
pnpm fleet:cli test fault worker-failure --worker <worker-id>
pnpm fleet:cli test fault storage-failure --worker <worker-id>
pnpm fleet:cli test watch --job <job-id>
```
