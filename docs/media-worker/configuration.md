# Media Worker Configuration

All values are read from environment variables and validated at startup.
`WORKER_ID` is required and must be a UUID. `JOB_ID` is optional for a worker
that should poll for compatible work.

## Core

| Variable                | Default                     | Meaning                                  |
| ----------------------- | --------------------------- | ---------------------------------------- |
| `DATABASE_URL`          | local VeoLMS PostgreSQL URL | PostgreSQL connection string.            |
| `STORAGE_PROVIDER`      | `local`                     | Output destination: `local` or `s3`.     |
| `SCRATCH_DIR`           | `/tmp/veolms-worker`        | Per-job temporary workspace.             |
| `FFMPEG_PATH`           | `ffmpeg`                    | FFmpeg executable.                       |
| `FFPROBE_PATH`          | `ffprobe`                   | ffprobe executable.                      |
| `VIDEO_COMPRESSION_CRF` | `22`                        | CRF for an optional capped intermediate. |

## Storage

| Variable                   | Default        | Meaning                                                     |
| -------------------------- | -------------- | ----------------------------------------------------------- |
| `S3_BUCKET`                | `veolms-media` | S3 bucket. `S3_BUCKET_NAME` is accepted as an alias.        |
| `S3_REGION`                | `us-east-1`    | S3 region. `AWS_REGION` is accepted as an alias.            |
| `S3_ENDPOINT`              | unset          | Custom S3-compatible endpoint.                              |
| `S3_FORCE_PATH_STYLE`      | unset          | Set `true` for path-style S3-compatible endpoints.          |
| `HTTP_DOWNLOAD_TIMEOUT_MS` | `300000`       | HTTP download timeout in milliseconds.                      |
| `HTTP_DOWNLOAD_MAX_BYTES`  | `53687091200`  | Maximum source size for HTTP, S3, and local files (50 GiB). |

## Monitoring and worker reuse

| Variable                      | Default | Meaning                                     |
| ----------------------------- | ------- | ------------------------------------------- |
| `HEARTBEAT_INTERVAL_MS`       | `15000` | PostgreSQL heartbeat interval.              |
| `PROGRESS_UPDATE_INTERVAL_MS` | `5000`  | Minimum interval between progress writes.   |
| `WORKER_IDLE_POLL_SECONDS`    | `15`    | One grace wait before an idle worker exits. |

## Incremental upload concurrency

| Variable                         | Default                | Meaning                                             |
| -------------------------------- | ---------------------- | --------------------------------------------------- |
| `UPLOAD_MAX_CONCURRENCY`         | calculated, maximum 32 | Maximum simultaneous S3 uploads.                    |
| `UPLOAD_MIN_CONCURRENCY`         | calculated             | Upload concurrency under resource pressure.         |
| `UPLOAD_THROTTLE_CPU_PERCENT`    | `80`                   | CPU threshold for using the minimum concurrency.    |
| `UPLOAD_THROTTLE_MEMORY_PERCENT` | `80`                   | Memory threshold for using the minimum concurrency. |
| `INCREMENTAL_UPLOAD_POLL_MS`     | `3000`                 | HLS directory scan interval.                        |
| `INCREMENTAL_UPLOAD_SETTLE_MS`   | `2000`                 | Minimum unchanged time before a file is uploaded.   |

`UPLOAD_MIN_CONCURRENCY` may not exceed `UPLOAD_MAX_CONCURRENCY`. When the
values are omitted, the worker derives them from available CPU and memory.
