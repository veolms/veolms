# Media Worker Architecture

```text
PostgreSQL <----> media-worker <----> FFmpeg / ffprobe
    ^                 |                    |
    |                 v                    v
fleet-manager       S3 or local output   scratch directory
```

## Components

| Component                    | Responsibility                                                                                                               |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Fleet manager                | Queues jobs, provisions workers, initializes monitoring, and terminates inactive workers.                                    |
| Shared database claim helper | Uses `FOR UPDATE SKIP LOCKED` to claim work without double processing; applies compatibility filtering for reusable workers. |
| Media worker entry point     | Creates the DB context, handles signals, drives job reuse, and closes resources.                                             |
| Processor                    | Owns one job's download, probe, FFmpeg execution, persistence, retry, and cleanup.                                           |
| FFmpeg builder               | Produces deterministic compression and multi-output HLS arguments.                                                           |
| Progress parser              | Converts FFmpeg `-progress pipe:1` records to typed progress values.                                                         |
| S3 module                    | Streams downloads/uploads, assigns content types/cache headers, and manages incremental HLS publication.                     |
| Resource monitor             | Samples host CPU/memory to select safe upload concurrency.                                                                   |

## Data ownership

The `jobs` table is the source of truth for job state. `workers` tracks the
active worker and its current `job_id`. `worker_monitoring` stores progress
and schedule data; `worker_events` provides an audit trail.

The processor changes related job and worker state in transactions where it
matters: claim ownership, complete a job, and retry/fail a job. This prevents
the monitor from observing an inconsistent completed job while a worker is
already preparing to claim another one.

## Worker compatibility

Reusable workers do not take arbitrary jobs. The shared claim helper compares
the queued job's `requirements.hardware` values with `workers.cpu`,
`workers.memory_mb`, `workers.storage_gb`, and `workers.architecture` before
claiming it. Jobs that need more resources remain queued for an appropriately
provisioned worker.
