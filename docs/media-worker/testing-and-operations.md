# Testing and Operations

## Checks

From the repository root, run:

```bash
pnpm --filter @veolms/media-worker typecheck
pnpm --filter @veolms/media-worker test
pnpm --filter @veolms/media-worker build:bundle
```

The tests cover FFmpeg argument generation, progress parsing, source extension
handling, resource calculations, and incremental playlist refreshes.

## Useful job states

| Job state    | Meaning                                           |
| ------------ | ------------------------------------------------- |
| `queued`     | Waiting for a compatible worker.                  |
| `processing` | Claimed by a worker and actively being processed. |
| `completed`  | Output persisted successfully.                    |
| `failed`     | Retry limit reached or a final failure occurred.  |
| `cancelled`  | Stopped by an external control-plane action.      |

## Troubleshooting

| Symptom              | Inspect                                                                                                                             |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Job remains `queued` | Compare `requirements.hardware` with available worker records; a reusable worker will not claim an incompatible job.                |
| Job retries or fails | Check `jobs.error_message`, worker logs, and `worker_events`.                                                                       |
| Progress is stale    | Confirm FFmpeg is still running and inspect `worker_monitoring.last_progress_at`.                                                   |
| Missing S3 output    | Check S3 permissions, endpoint/region/bucket values, and upload errors. A job should not be `completed` if the final upload failed. |
| HTTP source fails    | Check URL accessibility, redirect target, `HTTP_DOWNLOAD_TIMEOUT_MS`, and `HTTP_DOWNLOAD_MAX_BYTES`.                                |
| Local output missing | Verify the output prefix is valid and inspect `s3-bucket/<output-prefix>`.                                                          |

## Shutdown behaviour

On SIGTERM or SIGINT, the worker aborts FFmpeg, stops publishing new
incremental output, requeues the job when attempts remain, and closes the
database connection. This makes provider termination and deployment shutdowns
safe to retry.
