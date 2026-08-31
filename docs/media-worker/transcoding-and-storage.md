# Transcoding and Storage

## Quality selection

Quality profiles are defined in `@veolms/fleet-types`. The worker removes
duplicate requested qualities and keeps only resolutions appropriate for the
source dimensions. If every requested quality is larger than the source, it
falls back to the smallest requested level rather than producing no output.

## Optional resolution cap

For a source larger than the largest requested quality, the worker first
creates an H.264/AAC intermediate capped to that target while preserving
orientation and aspect ratio. This prevents a 4K source from being carried
through multiple lower-resolution rendition encodes.

If the source already fits the largest requested quality, the worker bypasses
the intermediate and feeds the original source directly to the HLS transcode.

## HLS generation

The worker creates one FFmpeg HLS output per applicable quality. Each output
uses:

- H.264 video (`libx264`) with the profile bitrate, max rate, and buffer size.
- AAC audio at the profile bitrate and 48 kHz.
- Aspect-ratio-preserving scale plus black padding to the profile dimensions.
- GOP/keyframe length calculated from the probed source FPS and requested
  segment duration.
- `independent_segments` and a VOD playlist.

After FFmpeg finishes, the worker writes `master.m3u8` that references each
rendition playlist.

## Progress

FFmpeg emits machine-readable records on stdout. The parser preserves records
split across stream chunks, calculates a 0–100 percentage from source duration,
and throttles database writes according to `PROGRESS_UPDATE_INTERVAL_MS`.

## S3 behaviour

The incremental uploader scans the HLS directory while FFmpeg is running:

- waits for the configured settle period before uploading a newly written file;
- uploads immutable segments once;
- checks playlists for mtime/size changes and uploads their new contents;
- streams each file from disk with bounded concurrency and retries transient
  upload failures three times;
- sets no-cache headers for playlists and long-lived immutable cache headers
  for segments.

The final upload sweep is required for `master.m3u8`, because it is written
after FFmpeg exits. A failed or cancelled job stops the uploader without a
final sweep, avoiding publication of additional partial output.

## Local storage behaviour

Local mode copies the final HLS directory once to:

```text
<repository>/s3-bucket/<output-prefix>/
```

The output prefix is validated to stay inside this directory. A copy failure
fails the job instead of reporting it as completed.
