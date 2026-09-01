# Media Worker Overview and Features

## Purpose

The media worker turns one source video into HLS output with several quality
levels. A job defines the source, output prefix, target qualities, segment
duration, and minimum hardware requirements.

## Features

- Claims only jobs compatible with the worker's CPU, memory, storage, and
  architecture when it is polling for new work.
- Accepts HTTP(S) URLs, approved local paths, and S3 object keys as source
  inputs.
- Enforces configured source-download time and size limits for HTTP, local,
  and S3 inputs.
- Uses `ffprobe` to require real duration, dimensions, and frame-rate data
  before processing.
- Removes duplicate quality requests and avoids upscaling when selecting
  applicable HLS renditions.
- Optionally creates a capped intermediate for sources larger than the
  largest requested rendition; sources already within the cap skip that extra
  encode.
- Generates H.264/AAC HLS video-on-demand playlists and transport-stream
  segments with keyframes aligned to the input frame rate.
- Writes throttled progress and regular heartbeats to PostgreSQL.
- Streams uploads from disk instead of loading complete segments into memory.
- Uploads S3 segments incrementally and re-uploads playlists whenever FFmpeg
  changes them.
- Persists local output once under `s3-bucket/<output-prefix>`.
- Retries failed jobs until `max_attempts` is reached, then marks the job and
  worker as failed.
- Handles SIGTERM and SIGINT by aborting active FFmpeg work, stopping new
  uploads, returning the job to the retry flow, and closing the DB pool.

## Supported output

Each requested quality becomes a directory under the job's output prefix:

```text
<output-prefix>/
  master.m3u8
  1080p/
    1080p.m3u8
    segment_000.ts
  720p/
    720p.m3u8
    segment_000.ts
```

See [Transcoding and storage](./transcoding-and-storage.md) for the exact
FFmpeg and upload behaviour.

## Important boundaries

The worker owns media processing and job-result state. The fleet manager owns
job creation, worker provisioning, monitoring, and provider termination. Both
use the shared atomic claim helper so the same queued job cannot be processed
twice.
