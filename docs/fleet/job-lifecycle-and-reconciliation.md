# Job Lifecycle & Cluster Reconciliation

The Fleet Manager coordinates transcoding jobs through an ACID state machine in PostgreSQL, pairing proactive monitoring with state reconciliation against cloud provider APIs.

---

## Video Job States

```text
       ┌──────────┐
       │  queued  │ ◄── Job created with target qualities & metadata
       └────┬─────┘
            │ Claimed by Control Plane or Idle Worker (SKIP LOCKED)
            ▼
     ┌──────────────┐
     │ provisioning │ ◄── EC2 instance requested; waiting for boot
     └──────┬───────┘
            │ Worker ready & claims job execution
            ▼
     ┌──────────────┐
     │  processing  │ ◄── Transcoding video; emitting periodic heartbeats
     └──────┬───────┘
            │
      ┌─────┴──────────────────┐
      ▼                        ▼
┌───────────┐            ┌───────────┐
│ completed │            │   failed  │ ◄── Failed or retried if attempts < max
└───────────┘            └───────────┘
```

---

## Lifecycle Steps

### 1. Atomic Job Claiming (`SKIP LOCKED`)

When claiming a job, the system runs:

```sql
SELECT * FROM video_jobs
WHERE status = 'queued'
ORDER BY created_at ASC
FOR UPDATE SKIP LOCKED
LIMIT 1;
```

If an idle worker is claiming the job, it joins `workers` to enforce hardware capability matching:

```sql
WHERE worker.cpu >= job_min_cpu
  AND worker.memory_mb >= job_min_memory_mb
  AND worker.storage_gb >= job_min_storage_gb
```

This guarantees that multiple concurrent daemons or workers never double-claim the same job without requiring external distributed locks.

### 2. Worker Heartbeat Lifecycle

While processing, the `media-worker` updates `workers.last_heartbeat_at` and `worker_monitoring.progress_percent` at configurable intervals (default: every 10 seconds).

### 3. Monitoring & Reconciliation Loop (`monitor.ts`)

During every monitoring cycle (`runMonitoringCycle`), four safety checks execute:

1. **Reconcile Cluster State (`reconcileClusterState`)**:
   - Queries the provider's active instance list (`listActiveInstances()`).
   - If an EC2 instance in state `terminated`/`STOPPED` is associated with a job marked `provisioning` or `processing`, the system records a `spot_interrupted` or `worker_terminated` event, resets the worker record, and safely re-queues the job if `attempts < max_attempts`.
   - If an instance is running in AWS with tag `ManagedBy=veolms-fleet-manager` but has no corresponding active DB record (e.g. following a DB rollback or split-brain), it is flagged as an orphan and terminated immediately (`orphan_instance_terminated`).

2. **Heartbeat Timeout Check (`checkHeartbeatTimeouts`)**:
   - Identifies active workers where `last_heartbeat_at < (now - HEARTBEAT_TIMEOUT_SECONDS)`.
   - Flags the worker as `failed`, terminates the underlying instance, and increments `video_jobs.attempts`.

3. **Orphaned Job Recovery (`checkOrphanedJobs`)**:
   - Reclaims jobs that were left in `processing` or `provisioning` but have no active worker record in the database.

4. **Output Verification (`checkDueWorkers`)**:
   - When a job transitions towards completion, the provider checks the destination S3 bucket for the presence of the master playlist (`verifyJobOutput("transcoded/<id>/master.m3u8")`).
   - If verified, it marks the job `completed`. If missing, it marks verification failed and retries.
