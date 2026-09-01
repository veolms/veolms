# Media Worker File Structure

```text
apps/media-worker/
  src/
    index.ts
    config.ts
    worker.ts
    processor.ts
    ffmpeg-builder.ts
    progress.ts
    http-download.ts
    incremental-upload.ts
    resource-monitor.ts
  tests/
    ffmpeg-builder.test.ts
    processor.test.ts
    progress.test.ts
    resource-monitor.test.ts
    s3.test.ts
  README.md
  package.json
  tsconfig.json

packages/storage/
  src/index.ts
  tests/storage.test.ts

packages/database/
  src/fleet/jobs.ts
```

## Source files

| File                                                                               | Contains                                                                                                               |
| ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| [`src/index.ts`](../../apps/media-worker/src/index.ts)                             | Application entry point, DB lifecycle, signal handling, and compatible-job reuse loop.                                 |
| [`src/config.ts`](../../apps/media-worker/src/config.ts)                           | Zod environment schema, aliases, defaults, and upload-concurrency validation.                                          |
| [`src/worker.ts`](../../apps/media-worker/src/worker.ts)                           | Worker initialization, event recording, heartbeats, and idle polling.                                                  |
| [`src/processor.ts`](../../apps/media-worker/src/processor.ts)                     | One-job orchestration: ownership, input acquisition, probing, FFmpeg, persistence, retries, cleanup, and cancellation. |
| [`src/ffmpeg-builder.ts`](../../apps/media-worker/src/ffmpeg-builder.ts)           | Quality filtering, compression-cap calculation, FFmpeg arguments, and master playlist generation.                      |
| [`src/progress.ts`](../../apps/media-worker/src/progress.ts)                       | Chunk-safe FFmpeg progress parser and callback throttling.                                                             |
| [`src/http-download.ts`](../../apps/media-worker/src/http-download.ts)             | Bounded streaming HTTP/HTTPS video ingestion with timeout and signal handling.                                         |
| [`src/incremental-upload.ts`](../../apps/media-worker/src/incremental-upload.ts)   | Real-time HLS segment/playlist scanning and incremental uploading via S3StorageService.                                |
| [`packages/storage/src/index.ts`](../../packages/storage/src/index.ts)             | Shared S3 storage service class with head, download, streamed upload, directory upload, and presigning.                |
| [`src/resource-monitor.ts`](../../apps/media-worker/src/resource-monitor.ts)       | Whole-host CPU/memory sampling and default upload concurrency calculation.                                             |
| [`packages/database/src/fleet/jobs.ts`](../../packages/database/src/fleet/jobs.ts) | Shared atomic queue claim helper used by the fleet manager and reusable workers.                                       |

## Test files

| File                                                                                       | Covers                                                                                        |
| ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| [`tests/ffmpeg-builder.test.ts`](../../apps/media-worker/tests/ffmpeg-builder.test.ts)     | Quality selection, portrait/cap behaviour, playlists, GOP alignment, and duplicate qualities. |
| [`tests/processor.test.ts`](../../apps/media-worker/tests/processor.test.ts)               | Source file-extension extraction.                                                             |
| [`tests/progress.test.ts`](../../apps/media-worker/tests/progress.test.ts)                 | Parsed values, completion, and records split across stdout chunks.                            |
| [`tests/resource-monitor.test.ts`](../../apps/media-worker/tests/resource-monitor.test.ts) | Resource percentage and concurrency bounds.                                                   |
| [`tests/s3.test.ts`](../../apps/media-worker/tests/s3.test.ts)                             | Re-uploading a changed HLS playlist.                                                          |
