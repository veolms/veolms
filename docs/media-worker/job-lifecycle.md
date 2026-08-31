# Job Lifecycle and Flow

## 1. Job creation and worker provisioning

The fleet manager creates a `queued` job with its hardware requirements. It
can provision a worker for that job and assigns `JOB_ID` and `WORKER_ID` to the
worker process.

An already-running worker can also look for more work. In that case, the
shared claim query filters queued jobs by the worker's recorded capabilities
and atomically sets both the job and worker to `processing`.

## 2. Worker startup

`index.ts` loads configuration, creates a database connection, registers the
worker as `ready`, starts the heartbeat timer, and installs SIGTERM/SIGINT
handlers.

The worker starts with `JOB_ID` when provisioned for a specific job. Without
one, it polls once immediately and once after `WORKER_IDLE_POLL_SECONDS` for
a compatible queued job.

## 3. Claim and validation

Before source processing, the worker:

1. Reads the job.
2. Validates its requirements using the shared Zod schema.
3. Verifies that the job is runnable and not owned by another worker.
4. Marks the job and worker `processing`.
5. Resets the worker-monitoring progress row.
6. Records `job_started`.

## 4. Source acquisition

The worker creates a scratch directory at:

```text
<SCRATCH_DIR>/<job-id>/
```

It then obtains the source in this order:

1. HTTP(S) URL — streamed with timeout, abort support, and byte limit.
2. Allowed local workspace locations — copied only if the file remains inside
   the configured workspace paths and is within the byte limit.
3. S3 object — streamed with the same byte limit and abort support.

## 5. Probe and transcode

`ffprobe` supplies duration, dimensions, and FPS. FFmpeg then optionally caps
an oversized source, creates HLS renditions, and emits progress records.
Progress writes are serialized so a delayed old update cannot overwrite a
newer percentage.

## 6. Persist output

- With `STORAGE_PROVIDER=local`, the complete HLS directory is copied once to
  the local output prefix.
- With `STORAGE_PROVIDER=s3`, segments and evolving playlists upload during
  the transcode. A final sweep uploads the master playlist and remaining
  files. Any upload failure fails the job; it never reports a false success.

## 7. Completion, retry, and reuse

On success, a transaction marks the job `completed`, sets its completion time,
and returns the worker to `ready` with no current `job_id`. The worker then
looks for another compatible job.

On failure or cancellation, the worker stops incremental uploads without a
final partial-output sweep. It increments `attempts` and:

- requeues the job when `attempts < max_attempts`, returning the worker to
  `ready`; or
- marks the job and worker `failed` when the retry limit is reached.

Every path removes the job scratch directory. When no compatible work remains,
the worker stops its heartbeat, marks itself completed when appropriate, and
closes its database pool.
