# VeoLMS Media Worker (`apps/media-worker`)

The **Media Worker** is an ephemeral compute worker running on an EC2 instance or local process. It claims video transcoding jobs from PostgreSQL, downloads the source video from S3 or HTTP(S), encodes multi-rendition adaptive HLS streams via FFmpeg, uploads segments incrementally, and self-terminates when idle.

---

## Key Features & Lifecycle

1. **Capacity & Hardware Compatibility**:
   - Compares the job's hardware requirement (`cpu`, `memory`, `storage`, `architecture`) against the worker's provisioned specs before claiming.
2. **Dynamic Multi-Quality Transcoding**:
   - Uses `ffprobe` to determine source dimensions, frame rate, and aspect ratio.
   - Automatically avoids upscaling if requested quality exceeds the source video resolution.
   - Supports vertical/portrait video encoding without quality loss.
3. **Incremental S3 Uploads**:
   - Streams `.ts` video segments to S3 as FFmpeg writes them to disk, eliminating post-transcode upload delays.
   - Only writes and uploads `master.m3u8` after FFmpeg successfully completes all renditions.
4. **Real-time Cancellation & Abort**:
   - On every progress update tick (~3-5s), the worker verifies the job's status in PostgreSQL.
   - If `video_jobs.status == 'cancelled'`, it immediately trips its `AbortController`:
     - Sends `SIGTERM` / `SIGKILL` to halt FFmpeg subprocesses.
     - Aborts active incremental S3 multi-part uploads to avoid publishing incomplete playlists.
     - Deletes the local `/tmp/veolms-worker/<job-id>` scratch directory.
     - Resets worker status to `ready` in DB and transitions to idle polling.
5. **Idle Polling & Auto-Termination**:
   - After completing or cancelling a job, the worker checks for the next compatible queued job.
   - If the queue remains empty for `WORKER_IDLE_POLL_SECONDS` (15s), the worker process exits cleanly.
   - On EC2, the shell trap runs `cleanup_and_terminate` to shut down the cloud VM and eliminate idle compute costs.

---

## Configuration Variables

| Variable | Description | Default |
| :--- | :--- | :--- |
| `DATABASE_URL` | PostgreSQL connection string | _Required_ |
| `WORKER_ID` | Unique worker UUID | Auto-generated UUID |
| `JOB_ID` | Optional job UUID assigned at launch | _Optional_ |
| `STORAGE_PROVIDER` | Storage provider (`s3` or `local`) | `s3` |
| `S3_BUCKET` | S3 media bucket name | _Required for S3_ |
| `HEARTBEAT_INTERVAL_MS` | Interval between PostgreSQL heartbeat writes | `15000` (15s) |
| `PROGRESS_UPDATE_INTERVAL_MS` | Interval between progress writes & cancellation checks | `5000` (5s) |
| `WORKER_IDLE_POLL_SECONDS` | Seconds to wait for new work before self-termination | `15` |
| `SCRATCH_DIR` | Local directory for temporary transcode files | `/tmp/veolms-worker` |

---

## Running Tests

```bash
pnpm --filter @veolms/media-worker test
pnpm --filter @veolms/media-worker typecheck
```

