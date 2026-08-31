# Media Worker

The media worker runs independently from the API on a provisioned VM or local process. It claims jobs compatible with its recorded CPU, memory, storage, and architecture; downloads a bounded-size source from HTTP(S), local storage, or S3; probes it with `ffprobe`; and produces adaptive HLS renditions with FFmpeg.

HLS segments upload incrementally to S3 while encoding, with playlists re-uploaded whenever they change. Local output is persisted once under `s3-bucket/<output-prefix>`. The worker reports progress and heartbeats to PostgreSQL, retries failed jobs up to their configured attempt limit, cleans its scratch directory, and exits cleanly when no compatible work remains.
