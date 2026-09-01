# Media Worker

The media worker converts a source video into adaptive HLS output. It runs as
an independently provisioned process, reports its state to PostgreSQL, and can
reuse the same compatible worker for more than one queued job.

## Documentation map

- [Overview and features](./overview.md) — responsibilities, supported inputs,
  outputs, reliability behaviour, and limits.
- [Job lifecycle and flow](./job-lifecycle.md) — the complete path from a
  queued job to completed output or a retry.
- [Architecture](./architecture.md) — runtime components and their boundaries.
- [Transcoding and storage](./transcoding-and-storage.md) — FFmpeg rendition
  generation, progress, local storage, and incremental S3 uploads.
- [Configuration](./configuration.md) — environment variables and defaults.
- [File structure](./file-structure.md) — every relevant source and test file
  with its responsibility.
- [Testing and operations](./testing-and-operations.md) — commands, logs, and
  failure investigation.

## Quick flow

```text
Fleet manager or idle worker
        |
        v
Claim a compatible queued job atomically
        |
        v
Download source -> ffprobe -> optional resolution cap
        |
        v
FFmpeg multi-rendition HLS transcode
        |
        +--> progress + heartbeat updates to PostgreSQL
        +--> incremental S3 segment/playlist uploads (when enabled)
        |
        v
Persist output -> mark job completed -> worker ready
        |
        v
Claim one more compatible job, or exit cleanly
```

The worker implementation is in
[`apps/media-worker`](../../apps/media-worker), and queue claiming is shared
with the control plane in
[`packages/database/src/fleet/jobs.ts`](../../packages/database/src/fleet/jobs.ts).
