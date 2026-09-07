# Video Upload, Transcoding, and Replacement PRD

**Status:** Draft for implementation
**Date:** 2026-09-07
**Product area:** Course builder → Curriculum → Lesson video
**Primary outcome:** A video that is already ready must remain clearly ready and playable while any new upload is being processed. Processing progress, rendition status, and SSE connection health must be represented as separate states.

## 1. Problem statement

The current lesson editor can show contradictory information after a video has already been uploaded or transcoded:

- The lesson has an existing media asset, but clicking **Upload New** opens a modal that starts at `0%` and `Processing`.
- If the status stream closes, the UI can show **The transcoding status stream was closed** even when the job already reached a terminal state.
- The lesson-level **Video processing failed** label does not distinguish a failed current video from a failed replacement attempt.
- The UI receives a media ID, but a media ID alone does not tell it whether the asset is uploaded, processing, ready, failed, or being replaced.
- The current worker reports one aggregate transcode percentage. It does not durably report which output quality is complete.

This is primarily a state-model and lifecycle problem, not only a progress-bar problem. The product must distinguish:

1. the currently attached lesson video;
2. a new upload or replacement candidate;
3. the transcoding job and its retry state; and
4. the health of the live SSE connection.

An SSE disconnect must never turn a ready video into a failed video, and starting a replacement must never remove the last known-good video before the replacement is ready.

## 2. Goals and non-goals

### Goals

- Show the correct state after page load, refresh, modal reopen, browser reconnect, and concurrent edits.
- Keep a ready video available while a replacement is uploading or transcoding.
- Provide separate upload progress and transcode progress.
- Use `EventSource` for live frontend updates; no frontend polling or periodic refetching.
- Make upload confirmation, retries, reconnects, and duplicate requests safe and idempotent.
- Report aggregate job progress honestly and, when supported, show per-rendition status.
- Give users a safe, explicit way to retry, discard a failed replacement, or replace a ready video.
- Prevent publishing a lesson that has no usable video.
- Make failures diagnosable through durable status, error codes, attempts, timestamps, logs, and metrics.

### Non-goals for the first release

- Resumable multipart upload across all storage providers.
- In-browser video editing, trimming, or format conversion.
- Promise of an exact ETA. Processing speed varies by source duration, resolution, codec, and worker capacity.
- Showing a rendition as complete merely because FFmpeg has started producing files. Completion must be based on a verified manifest/output policy.

## 3. Product decisions

### 3.1 Safe replacement is the default

Selecting **Upload New** creates a new media asset and a new processing job. It does not mutate or detach the currently attached asset.

The lesson continues to reference the old ready asset until the new asset has:

1. uploaded successfully;
2. passed source validation;
3. completed the required transcode; and
4. passed output/manifest verification.

Only then does the product commit the new asset as the lesson's current video. If the replacement fails, the old video remains attached and playable.

### 3.2 Connection state is not media state

The UI must have independent values for `mediaStatus`, `jobStatus`, `progress`, and `streamConnectionState`.

Examples:

- `mediaStatus=ready`, `jobStatus=completed`, `streamConnectionState=closed` means **Ready**; it is not a failure.
- `mediaStatus=uploaded`, `jobStatus=processing`, `streamConnectionState=reconnecting` means **Processing at the last known percentage; live updates are temporarily unavailable**.
- `mediaStatus=failed`, `jobStatus=failed`, `streamConnectionState=connected` means **Processing failed**.

### 3.3 Never infer status from an ID

`contentMediaId` identifies an asset only. The page and modal must hydrate a status summary from the server. A missing event must not leave the UI permanently at default `0%`.

### 3.4 Do not claim per-format completion without backend data

The current implementation transcodes the applicable `360p`, `720p`, and `1080p` outputs in one FFmpeg job and exposes aggregate progress. It does not currently persist a status row for each rendition. Until that is added, the UI should show **Overall transcode progress** and a list of **Requested qualities**, not “720p complete” or “1080p complete”.

## 4. Current implementation audit

The following reflects the current repository, including the current worktree implementation.

| Area | Implemented today | Gap or risk |
|---|---|---|
| Presigned upload | `POST /media/presign` creates a media asset in `uploading` state and returns a storage upload URL. | Upload session identity, expiration, idempotency, and recovery semantics are not fully represented in the product state. |
| Browser upload | Frontend uses XHR upload progress. | Upload progress must be cleared or retained deliberately when the user cancels, refreshes, or replaces a file. |
| Upload confirmation | Confirm checks object existence and exact size and is designed to be idempotent. | MIME/content validation, upload-session ownership, and explicit replacement metadata need to be formalized. |
| Job creation | A unique active-job index prevents multiple active jobs for one media asset. Jobs have attempts and a maximum retry count. | The lesson replacement is not a first-class server-side transaction; the old and new asset relationship is not recorded. |
| Retry | A transcode retry route exists for failed/uploaded media. | Retry UX and retryable versus permanent errors need explicit contracts. A retry must not lose the current ready lesson asset. |
| Worker progress | `worker_monitoring.progress_percent` is updated during FFmpeg; the API prefers this live value and falls back to the job value. | This is aggregate progress only. Compression/finalization phases are not represented consistently, and the job row is not updated on every live callback. |
| Output qualities | Worker targets applicable `360p`, `720p`, and `1080p` HLS qualities based on source dimensions. | There is no durable per-rendition table or completion event. The worker parser does not populate `currentQuality`. |
| SSE endpoint | `/media/:mediaId/progress/stream` exists and sends progress snapshots using `EventSource` from the frontend. | The server loop currently re-reads state on an interval, has limited event types, no durable event sequence/`Last-Event-ID`, and no normal heartbeat protocol. |
| Frontend transport | The upload component uses one validated `EventSource` per active job, preserves monotonic progress, distinguishes queued work from determinate progress, and automatically reconnects after a clean stream close with bounded backoff. | The backend still needs versioned snapshots, sequence replay/`Last-Event-ID`, and heartbeat semantics for fully durable reconnects. |
| Lesson attachment | A candidate media ID is attached only after terminal `completed`; the parent persists it and rolls back the local lesson binding when persistence fails. | Replacement commit/discard is not yet a first-class server transaction, and old assets can become orphaned. |
| Failure display | Media/job failure, stream interruption, queued worker state, and replacement failure have separate UI states and retry actions. | Stable server error codes and end-to-end transport/failure acceptance tests are still needed. |
| Access control | API routes use authentication, MFA, ownership checks, and presigned storage access. | SSE reconnect behavior, authorization on every reconnect, and safe user-facing error mapping need production acceptance tests. |
| Cleanup | Foreign keys protect referenced media. | Replacing a lesson does not immediately or safely garbage-collect the old asset; a reference-aware retention process is needed. |

## 5. User experience requirements

### 5.1 Lesson card before opening the modal

The lesson card must show the state of the currently attached asset, not the state of a newly opened upload modal.

| Current lesson state | Lesson card presentation | Allowed actions |
|---|---|---|
| No video | `Add video` | Upload new |
| Uploading | `Uploading — 42%` | Cancel; continue later if upload protocol supports it |
| Queued/provisioning | `Preparing video` | Open details; cancel if supported |
| Processing | `Processing — 42%` | Open details; replace only with confirmation |
| Ready | `Video ready` plus filename/duration | Preview; replace; remove if allowed |
| Failed, no prior ready asset | `Video processing failed` | Retry; choose another file; remove failed draft |
| Ready current + replacement processing | `Video ready` and secondary `Replacement processing — 42%` | Open replacement details; cancel/discard replacement |
| Ready current + replacement failed | `Video ready` and secondary `Replacement failed` | Retry replacement; discard replacement; keep current |
| Unknown/stale | `Status unavailable` | Reconnect status; retain last known safe attachment |

The card must not show `Processing` solely because `contentMediaId` is non-null.

### 5.2 Opening Upload New for an already-ready video

Clicking **Upload New** on a ready lesson opens a replacement flow:

1. Show a confirmation copy such as: **Replace this lesson video? Your current video will remain available until the new video is ready.**
2. If the file picker is cancelled, close the picker and make no server or lesson changes.
3. Once a file is selected, show the new filename, size, duration when known, and validation result.
4. Start the new upload as a replacement candidate. Keep the old video visibly labelled **Current video**.
5. Show upload progress first, then transcode progress for the candidate.
6. On success, show **Replacement ready** and commit the new attachment. The old asset becomes eligible for cleanup only after reference checks and the retention window.
7. On failure, show **Replacement failed** with retry and discard actions. The old video remains current.

There must not be a moment where a failed candidate replaces a ready current asset.

### 5.3 Modal state hydration

When the modal opens or the page reloads, the frontend must receive an initial status snapshot containing the current asset and any replacement job. The initial snapshot may be the first SSE event, a dedicated status request used only for hydration, or server-rendered data. It must not be a timer-based frontend poll.

The initial snapshot must include a server timestamp and a monotonically increasing version/sequence. The UI must initialize progress from that snapshot before rendering a determinate progress bar. If no percentage is known, use an indeterminate bar and explanatory text instead of showing a misleading `0%`.

### 5.4 Stream interruption behavior

On an SSE error or normal connection close before a terminal event:

- retain the last received media/job status and percentage;
- show `Live updates paused` or `Reconnecting…` as a transport notice;
- offer `Reconnect` after the automatic reconnect policy is exhausted;
- do not set progress back to `0%`;
- do not set a ready asset to failed;
- do not discard a replacement candidate.

On a terminal `completed`, `failed`, or `cancelled` event, apply the terminal state first and then close the stream. A subsequent `EventSource.onerror` must be ignored for that job because the stream closing is expected.

## 6. State model

The server and frontend should model three related state machines.

### 6.1 Media asset state

`uploading → uploaded → ready`

`uploading → failed`

`uploaded → failed`

`ready → archived/deleted` only after it is no longer referenced and the retention policy allows deletion.

An asset must never be marked `ready` before output verification succeeds.

### 6.2 Transcode job state

`queued → provisioning → processing → finalizing → completed`

Any non-terminal state may transition to `failed` with a retry classification. A retry creates a new attempt or increments an attempt counter and returns to `queued`; it must retain the previous error for diagnostics.

`queued/provisioning/processing → cancelled` is allowed only when cancellation is implemented end-to-end. A cancelled job must not be presented as a generic failure.

### 6.3 Lesson binding state

The lesson must distinguish:

- `currentMediaId`: the asset currently used by the lesson;
- `replacementMediaId`: an optional candidate being uploaded/processed;
- `replacementOfMediaId`: the current asset that the candidate intends to replace;
- `replacementState`: none, uploading, processing, ready_to_commit, failed, discarded.

For a new lesson, there may be no current asset and a candidate can become current after it is ready. For an existing lesson, the current asset is immutable during replacement.

### 6.4 Connection state

`idle`, `connecting`, `connected`, `reconnecting`, `terminal`, `closed`, `unauthorized`.

Connection state must be displayed as a small secondary status. It must never overwrite `mediaStatus` or `jobStatus`.

## 7. Progress and rendition requirements

### 7.1 Separate progress dimensions

The API and UI must keep these values separate:

- `uploadPercent`: bytes sent to object storage;
- `transcodePercent`: server-side processing percentage;
- `processedSeconds` and `totalDurationSeconds`, when available;
- `stage`: uploading, validating, queued, provisioning, processing, finalizing, verifying, completed;
- `lastUpdatedAt` and `isStale`.

The progress bar must never use upload percentage after the upload has completed, and must never reset to zero when the connection reconnects.

### 7.2 Aggregate progress semantics

For the current worker, `transcodePercent` is overall job progress across the FFmpeg operation. The product should expose the label **Overall transcode progress**.

If compression is enabled and its duration cannot be measured, show an indeterminate `Preparing source…` state or use a documented weighted phase model. Do not leave the UI at `0%` while work is active without explaining that the source is being prepared.

Recommended initial weighting:

| Stage | Weight |
|---|---:|
| Validate/provision | 0–5% |
| Optional source preparation/compression | 5–20% |
| HLS transcode | 20–95% |
| Finalize/upload/verify | 95–100% |

The exact weighting is an implementation detail, but it must be monotonic, documented, and tested. A percentage is allowed to remain unchanged for a period of time; it must not move backwards except when a new attempt is explicitly started.

### 7.3 Per-quality status

The target quality list is based on source dimensions. The backend must persist each rendition as a row or equivalent durable record with:

- quality (`360p`, `720p`, `1080p`, etc.);
- requested/applicable status;
- processing status (`pending`, `processing`, `ready`, `failed`, `not_applicable`);
- playlist/output path;
- progress or verified segment count if supported;
- error code/message;
- `completedAt`.

The UI may then show:

| Quality | Meaning |
|---|---|
| Pending | Requested but processing has not started or has no verified output. |
| Processing | Output generation is in progress. |
| Ready | The rendition manifest and required segments passed verification. |
| Not applicable | Source cannot produce that quality; this is not a failure. |
| Failed | This rendition failed and the aggregate job policy determines whether playback can continue. |

Until this backend capability exists, remove the current “Playback files — Pending” illusion if it implies per-format progress. Use a single aggregate row and list the requested qualities as metadata.

## 8. SSE contract

The existing progress stream can remain the route for compatibility, but its protocol should evolve into a versioned event stream.

### 8.1 Connection behavior

- Authenticate and authorize the media/lesson on every connection and reconnect.
- Set `Content-Type: text/event-stream`, `Cache-Control: no-cache, no-transform`, and `X-Accel-Buffering: no`.
- Send an initial `snapshot` event immediately after authorization.
- Send `id: <sequence>` on every state event.
- Support `Last-Event-ID` so reconnecting clients can receive missed events or a fresh snapshot.
- Send a comment or named `heartbeat` every 15–30 seconds while the job is active.
- Close only after a terminal event has been delivered and flushed.
- Clean up listeners, timers, database subscriptions, and abort handlers when the client disconnects.
- Enforce a maximum connection lifetime and reconnect safely for long jobs.

### 8.2 Event types

| Event | Required payload purpose |
|---|---|
| `snapshot` | Current asset, candidate/replacement, job, progress, renditions, version, and timestamps. |
| `status` | State/stage transition, attempt, retryability, and user-safe message. |
| `progress` | Aggregate percentage, processed duration, speed/fps when known, and `lastUpdatedAt`. |
| `rendition` | One quality status change, only after rendition tracking is implemented. |
| `completed` | Verified output prefix/master playlist, ready qualities, metadata, and replacement commit eligibility. |
| `failed` | Stable error code, retryability, attempt count, and whether the current lesson video remains usable. |
| `cancelled` | Cancellation result and whether the candidate can be discarded. |
| `heartbeat` | Connection liveness only; it must not change media state. |
| `error` | Transport or authorization error; it must not masquerade as a transcode failure. |

Example `snapshot` payload shape:

```json
{
  "schemaVersion": 1,
  "sequence": 1842,
  "mediaAssetId": "candidate-media-id",
  "jobId": "job-id",
  "replacementOfMediaId": "current-media-id",
  "mediaStatus": "uploaded",
  "jobStatus": "processing",
  "stage": "processing",
  "progressPercent": 42,
  "processedSeconds": 312,
  "totalDurationSeconds": 742,
  "qualities": [
    { "quality": "360p", "status": "processing" },
    { "quality": "720p", "status": "pending" },
    { "quality": "1080p", "status": "pending" }
  ],
  "lastUpdatedAt": "2026-09-07T12:00:00.000Z",
  "retryable": true,
  "error": null
}
```

The frontend must validate payloads with shared contracts from `@veolms/contracts`, ignore stale sequence numbers, and treat a terminal event as authoritative for that job attempt.

### 8.3 No frontend polling requirement

The lesson upload UI must not use `setInterval`, recurring `setTimeout` loops, React Query `refetchInterval`, or repeated progress GET requests. It uses one `EventSource` per active candidate/job, closes it on terminal state/unmount, and relies on native SSE reconnect plus a bounded one-shot backoff timer only when a stream has cleanly closed. The backoff recreates the `EventSource`; it never fetches status itself. Durable replay still requires `Last-Event-ID` support from the backend.

The current server-side snapshot loop is acceptable as a short-term compatibility implementation, but production scale should move to a publish/subscribe or database-notification-backed stream hub. One connected client must not create an unbounded database polling loop.

## 9. API and persistence requirements

### 9.1 Existing endpoints to retain or formalize

| Endpoint | Current use | Target behavior |
|---|---|---|
| `POST /media/presign` | Start upload | Accept upload/session metadata, idempotency key, and optional replacement context. Return asset/session IDs and constraints. |
| Storage `PUT` | Transfer bytes | Enforce presigned size/content constraints where supported. |
| `POST /media/:id/upload-complete` | Confirm upload | Idempotent; verify ownership, object existence, size, content type, and upload session. Queue one job. |
| `GET /media/:id/progress/stream` | Live progress | Versioned SSE snapshot/events with heartbeat, sequence, reconnect, and terminal semantics. |
| `POST /media/:id/transcode/retry` | Retry failed job | Idempotent per request key; return current job if active; classify retryable/permanent failure. |
| `GET /media/:id/progress` | Existing polling/diagnostics | Keep temporarily for support and compatibility; do not call it from the upload UI. Mark deprecated for frontend use. |

### 9.2 Target replacement endpoints

One safe design is:

- `POST /lessons/:lessonId/video-replacements` creates a candidate asset with `replacementOfMediaId` and returns the upload session;
- `POST /media/:candidateId/upload-complete` confirms and queues processing;
- `GET /media/:candidateId/progress/stream` tracks the candidate;
- `POST /lessons/:lessonId/video-replacements/:candidateId/commit` atomically changes the lesson binding after the candidate is ready;
- `POST /lessons/:lessonId/video-replacements/:candidateId/discard` marks the candidate for cleanup without affecting the current asset.

If the existing presign flow is reused instead, the replacement context must still be persisted server-side. The frontend must not be the only place that remembers which old asset a candidate is replacing.

### 9.3 Status summary response

The course/lesson response or a dedicated lesson-video status endpoint must return:

- current media ID and complete media status;
- current filename, size, duration, dimensions, and playback readiness;
- active candidate/replacement ID if one exists;
- latest job status, stage, progress, attempt, and retryability;
- verified output/master playlist information;
- rendition summaries when implemented;
- safe user-facing status message and internal error code;
- `updatedAt` and sequence/version.

This prevents a refresh from treating a non-null `contentMediaId` as “processing”.

### 9.4 Persistence changes

Recommended additions:

1. `video_upload_sessions`: owner, media ID, expected size/type, storage key, status, expiry, idempotency key, created/completed timestamps.
2. `video_job_events` or an equivalent event log: job ID, sequence, event type, payload, created timestamp. A short retention period is sufficient if a durable event log is not desired.
3. `video_renditions`: job/media ID, quality, status, output path, error, completion time, and verification metadata.
4. Replacement fields or a separate `lesson_video_replacements` table containing lesson ID, current media ID, candidate media ID, state, actor, and timestamps.
5. Reference-aware cleanup metadata: `lastReferencedAt`, deletion eligibility, cleanup attempt, and retention deadline.

The current `video_outputs` record and `video_jobs.qualities` array are useful but insufficient to represent per-quality lifecycle or replacement history.

## 10. Failure, retry, and recovery policy

### Retryable failures

Examples: worker unavailable, temporary storage outage, transient network error, capacity timeout, interrupted worker, and recoverable FFmpeg process exit.

Behavior: retain the candidate, show the last completed stage, allow retry, increment attempt, and apply bounded exponential backoff for automatic worker retries. The current ready lesson video remains untouched.

### Non-retryable failures

Examples: unsupported codec, corrupt source, invalid size/type, duration/quality policy violation, missing authorization, and output validation failure caused by the source.

Behavior: show a clear user-safe reason, offer **Choose another video**, and keep the current ready video if this was a replacement. Do not repeatedly auto-retry a permanent source failure.

### Worker loss or lease expiry

The fleet manager must mark stale jobs recoverable after lease expiry, prevent two workers from processing the same attempt, and emit a status event when ownership changes. A user should see **Processing resumed** or **Retrying attempt 2 of 3**, not an unexplained reset to zero.

### Browser refresh, tab close, and offline mode

- Refresh: hydrate from the status snapshot and reconnect to the candidate/job.
- Tab close: server processing continues; reopening shows the durable state.
- Offline during upload: show upload interrupted and preserve the candidate/session if resumable; otherwise offer a safe restart without touching the current asset.
- Offline during SSE: retain last known progress and show stale/live-disconnected state.
- Multiple tabs: sequence numbers prevent stale events from overwriting newer state. A replacement commit must be conditional on the current lesson version.

### Cancel and discard

Cancel upload stops the client transfer and marks the upload session abandoned. Discarding a candidate never deletes the current lesson video. Job cancellation must be explicit and idempotent; if cancellation cannot stop the worker, show that the candidate is being cleaned up rather than falsely claiming cancellation completed.

## 11. Security and production correctness

- Authorize the owner/course editor for presign, confirm, status, retry, replacement commit, discard, and SSE reconnect.
- Do not trust the browser's MIME type or filename; inspect object metadata/content where feasible.
- Enforce maximum bytes, duration, dimensions, codec/container, and allowed output policy before expensive processing.
- Keep source and output storage keys tenant/course scoped and non-guessable.
- Do not include raw worker, storage, FFmpeg, or stack-trace details in the UI. Map internal errors to stable user-safe codes.
- Ensure SSE responses cannot be cached or buffered by a proxy and do not leak events across users.
- Rate-limit retry and replacement creation; enforce one active candidate/replacement per lesson unless product explicitly supports a queue.
- Use idempotency keys for presign, confirm, retry, and replacement commit.
- Verify the lesson version/current media ID during commit to prevent an old tab from overwriting a newer replacement.
- Retain audit information for who uploaded, retried, replaced, discarded, or removed a video.

## 12. Observability and operations

Every upload/job should be traceable by `courseId`, `lessonId`, `mediaAssetId`, `jobId`, `uploadSessionId`, `attempt`, and `workerId`.

Recommended metrics and alerts:

- upload success/failure/cancel rate;
- time from upload confirmation to queue, processing start, and ready;
- job success rate and retry count by error code;
- stale worker leases and queue age;
- SSE connected clients, reconnect rate, unauthorized reconnects, and terminal delivery failures;
- percentage of jobs with no progress update for a configured threshold;
- orphan candidate count and cleanup age;
- ready videos with missing or invalid master playlists.

Support tooling should be able to display the state timeline and manually retry or discard a candidate without editing database rows directly.

## 13. Acceptance criteria

### Existing ready video

- After refresh, the lesson shows `Video ready` and never `Processing` merely because a media ID exists.
- Opening and closing the upload modal does not start a new job or change the current attachment.
- Clicking **Upload New** clearly indicates a replacement and leaves the current video playable.

### Successful replacement

- The old asset remains current during upload, processing, and finalization.
- The candidate reaches verified ready state through SSE.
- The lesson binding changes once, atomically, and the UI shows the new filename/details.
- The old asset is not deleted synchronously; cleanup happens only after reference and retention checks.

### Failed replacement

- The lesson continues to play the old ready video.
- The UI says `Replacement failed`, shows a retryable/permanent explanation, and offers retry, choose another, and discard.
- Retrying does not create duplicate active jobs.

### Stream behavior

- The first SSE event hydrates the current state, including a completed state if the job already finished.
- A disconnect preserves the last state and percentage and displays a connection notice.
- A terminal event is applied before stream close; stream close does not turn completion into failure.
- Reconnect uses `Last-Event-ID` or a fresh snapshot and ignores stale sequence numbers.
- No frontend timer or progress polling request exists in the lesson upload flow.

### Progress and qualities

- Upload and transcode percentages are not mixed.
- Active work is not represented as a misleading static `0%` without a stage explanation.
- The UI does not show per-quality completion until durable rendition status is implemented.
- When rendition status is implemented, `not_applicable` is shown separately from `failed`.

### Reliability and security

- Duplicate confirm, retry, reconnect, and commit requests are safe.
- An expired session, unauthorized SSE connection, missing object, worker loss, corrupt source, and storage outage each have tested behavior.
- Publishing a lesson with no ready video is blocked or clearly kept hidden according to the course publishing policy.

## 14. Test plan

### Unit tests

- Reducer/state-machine tests for every media/job/connection combination.
- Terminal event followed by `onerror` remains completed/failed as appropriate.
- Reconnect does not reset progress and stale sequence numbers are ignored.
- Replacement failure preserves `currentMediaId`.
- Retryable and permanent error mapping.
- Event contract validation and unknown event handling.

### API and integration tests

- Ownership/MFA for every endpoint and SSE reconnect.
- Idempotent presign/confirm/retry/commit/discard.
- Active-job uniqueness and concurrent replacement commit protection.
- Initial snapshot for ready, processing, failed, cancelled, and missing media.
- Heartbeat, client disconnect cleanup, Last-Event-ID replay/fresh snapshot, and terminal stream close.
- Output verification and media status synchronization.
- Reference-aware cleanup does not delete assets still used by another lesson/course field.

### Worker/fleet tests

- Progress monotonicity and stage weighting.
- Compression, transcode, finalization, and verification failures.
- Worker lease expiry, retry attempt limits, cancellation, duplicate claim, and idempotent completion.
- Rendition status for applicable and not-applicable qualities.

### Browser end-to-end matrix

Test at minimum:

| Scenario | Expected result |
|---|---|
| New lesson, successful upload | Upload → queued → processing → ready; lesson attaches only after ready according to product policy. |
| Existing ready, open modal | Shows current ready video; no fake 0% processing state. |
| Existing ready, cancel file picker | No changes. |
| Existing ready, replacement succeeds | Old remains current until atomic commit, then new becomes current. |
| Existing ready, replacement fails | Old remains playable; candidate can retry/discard. |
| Existing failed, retry succeeds | Same candidate/job attempt policy is visible; ready on completion. |
| SSE disconnect at 0%, 42%, and 100% | Last state retained; reconnect notice; no false failure. |
| Refresh while processing | Snapshot restores correct job/progress. |
| Two tabs replace the same lesson | One commit wins; the other receives a conflict and refreshes status. |
| Network loss during upload | Candidate/session is recoverable or safely restartable; current video remains intact. |
| Unsupported/corrupt/oversized video | Clear validation failure; no stuck job or orphaned active attachment. |

## 15. Delivery plan

### Phase 0 — Correct the current UX and SSE semantics

- Hydrate from the first validated SSE snapshot so the UI does not infer state from `contentMediaId` or render a default `0%`.
- Separate current media, candidate media, job status, progress, and stream connection state in the frontend.
- Preserve last known progress on disconnect, automatically reconnect closed streams, and ignore post-terminal stream errors.
- Rename the current progress UI to aggregate progress until rendition status exists.
- Add API SSE contract/integration tests and remove all frontend polling paths.

### Phase 1 — Safe replacement lifecycle

- Persist replacement context server-side.
- Add replacement create, commit, and discard operations.
- Commit only verified-ready candidates with optimistic concurrency protection.
- Add reference-aware cleanup with a retention window.

### Phase 2 — Production eventing and rendition status

- Replace per-connection database snapshot loops with a pub/sub or database-notification-backed stream hub.
- Add event sequence/replay/heartbeat behavior.
- Add `video_renditions` persistence and worker updates.
- Show applicable, processing, ready, not-applicable, and failed qualities.

### Phase 3 — Operational hardening

- Add resumable upload where needed.
- Add support timeline/admin actions, dashboards, alerts, cleanup reconciliation, and load testing for many concurrent SSE clients.

## 16. Definition of done

This feature is production-ready when the user can refresh, reconnect, retry, replace, cancel, or open the lesson in multiple tabs without losing a ready video or seeing a misleading status; when every displayed status can be traced to durable server state; when the frontend uses SSE rather than polling; and when the worker/API/UI contracts agree on what progress and rendition completion mean.
