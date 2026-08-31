# Worker Hardware Sizing & EC2 Instance Selection

This document explains two related pieces of the fleet manager: how a job's
required worker hardware is decided, and how that requirement gets turned
into an actual EC2 instance. Both live outside `apps/fleet-manager` in the
places the top-level `apps/fleet-manager` vs. `packages/fleet-provider-aws`
split already puts them — the machine-sizing _logic_ is provider-agnostic
(`@veolms/fleet-types`), and the EC2-specific _mechanics_ live in
`@veolms/fleet-provider-aws`.

## Why this exists

Two videos of the same file size and the same requested output qualities
can need very different compute:

|            | Video A | Video B |
| ---------- | ------- | ------- |
| Size       | 2 GB    | 2 GB    |
| Resolution | 1080p   | 4K      |
| FPS        | 30      | 60      |
| Codec      | H.264   | HEVC    |

Sizing a worker from `video_size` + `qualities` alone (the original
heuristic) can't tell these apart. Video B needs meaningfully more CPU to
decode before it can even start re-encoding.

## Where the metadata comes from

`packages/fleet-provider-aws/src/probe-lambda.ts` runs `ffprobe` against a
queued video (see `packages/fleet-provider-aws/src/prober.ts`) and enriches
the invocation payload with a `videoMetadata` object — width, height, fps,
codec, bitrate, duration, and (informational only, not yet used for
sizing) `pixelFormat`/`bitDepth`. This payload reaches
`apps/fleet-manager/src/core/video-job-manager.ts`'s `queueJob()`.

**This is optional.** A job queued via a direct trigger that bypasses the
probe Lambda (or one where probing failed) simply has no `videoMetadata`.
Every piece of this system treats that as "use the qualities+size
heuristic," never as an error — see [Fallback behavior](#fallback-behavior)
below.

## Machine profile tiers

`packages/fleet-types/src/video-job.ts` resolves a job to one of five named
tiers, from `resolveMachineProfile(qualities, videoMetadata?)`:

| Tier   | minCpu | minMemoryMb | storage floor |
| ------ | ------ | ----------- | ------------- |
| NANO   | 1      | 2048        | 20 GB         |
| MICRO  | 2      | 4096        | 30 GB         |
| SMALL  | 4      | 8192        | 50 GB         |
| MEDIUM | 8      | 16384       | 80 GB         |
| LARGE  | 16     | 32768       | 130 GB        |

MICRO/SMALL/MEDIUM are exact renames of the tiers this module used before
named tiers existed (the old "baseline / 1440p+5-qualities / 2160p"
buckets). NANO and LARGE are new — they're only reachable when probed
metadata confirms a source is unusually simple or unusually demanding;
qualities alone never resolve to either.

**Resolution order:**

1. Start from the tier the _requested output qualities_ alone imply
   (2160p → MEDIUM, 1440p or 5+ qualities → SMALL, otherwise MICRO). This
   is the exact legacy heuristic, unchanged.
2. If metadata is present:
   - **Resolution floor** — a 4K+ source floors the tier at MEDIUM (a
     source that big costs real CPU to decode even when only a 480p
     output is requested — the pipeline decodes the full-resolution source
     once, directly or via `apps/media-worker/src/ffmpeg-builder.ts`'s
     resolution-cap compression pass, before splitting into renditions).
   - **FPS bump** — 50/60fps sources: +1 tier. 100fps+ sources: +2 tiers.
   - **Codec bump** — HEVC/H.265/AV1/VP9 sources (materially more
     expensive to software-decode than H.264): +1 tier.
   - **NANO step-down** — only when qualities alone would already resolve
     to MICRO, 2 or fewer qualities are requested, _and_ metadata confirms
     the source is small (largest dimension ≤ 854px). Metadata can lower
     the tier only when it actively confirms "this is simple," never as a
     default guess.
3. Clamp the result to `[NANO, LARGE]`.

## Fallback behavior

Every consumer that needs a job's hardware requirement calls
`resolveJobHardware(job)` (also in `video-job.ts`), which is just
`estimateJobHardware(job.video_size, job.qualities, { videoMetadata:
job.video_metadata })`. Since this is a **pure function** of three already-
persisted inputs, calling it from multiple places always agrees — nothing
needs to be cached or kept in sync:

- `apps/fleet-manager/src/core/worker-manager.ts` — `calculateWorkerSpec()`
  sizes the EC2 worker at provisioning time.
- `apps/fleet-manager/src/core/worker-manager.ts` — `worker_monitoring`
  initialization reads `estimatedDurationSeconds` from the same call.
- `apps/media-worker/src/processor.ts` — the worker's own claim-time
  capacity re-check reads the exact same numbers the fleet manager used to
  size it, so this can never disagree and fail a job that's actually fine.
- `packages/database/src/fleet/video-jobs.ts` — the atomic claim query
  (used when an already-provisioned, idle worker polls for its next job)
  pre-filters using the persisted `hardware_profile` column, falling back
  to the legacy qualities-only SQL `CASE` for pre-migration rows
  (`hardware_profile IS NULL`).

## What's persisted, and why only two columns

Migration `packages/database/migrations/008-add-hardware-sizing-to-video-jobs.ts`
adds exactly two nullable columns to `video_jobs`:

- **`video_metadata`** (`jsonb`) — the probed metadata subset (everything
  except ffprobe's raw per-stream dump). This is the only signal any
  sizing logic actually needs — `video_size` and `qualities` were already
  columns, and `estimateJobHardware()` is deterministic given those three,
  so nothing else needs to be cached.
- **`hardware_profile`** (native Postgres enum `hardware_profile_enum`:
  `NANO`/`MICRO`/`SMALL`/`MEDIUM`/`LARGE`) — the resolved tier, persisted
  purely for observability (`SELECT * FROM video_jobs WHERE
hardware_profile = 'large'`) and as the fast pre-filter in the claim
  query above. No sizing logic reads it back — `video_metadata` alone is
  sufficient to recompute everything, including this same value.

Both are `NULL` for a job with no probe step; every reader already treats
`NULL` as "use the legacy fallback."

## EC2 instance selection

`packages/fleet-provider-aws/src/instance-types.ts` maps a resolved
`{cpu, memoryMb}` requirement to an **ordered list** of same-size instance
type candidates, not one hardcoded type:

| Tier   | ARM64 (Graviton)                            | X86_64                                        |
| ------ | ------------------------------------------- | --------------------------------------------- |
| NANO   | `c7g.medium`, `c8g.medium`, `c6g.medium`    | _(same as MICRO — x86 has no `.medium` size)_ |
| MICRO  | `c7g.large`, `c8g.large`, `c6g.large`       | `c6i.large`, `c5.large`, `c7i.large`          |
| SMALL  | `c7g.xlarge`, `c8g.xlarge`, `c6g.xlarge`    | `c6i.xlarge`, `c5.xlarge`, `c7i.xlarge`       |
| MEDIUM | `c7g.2xlarge`, `c8g.2xlarge`, `c6g.2xlarge` | `c6i.2xlarge`, `c5.2xlarge`, `c7i.2xlarge`    |
| LARGE  | `c7g.4xlarge`, `c8g.4xlarge`, `c6g.4xlarge` | `c6i.4xlarge`, `c5.4xlarge`, `c7i.4xlarge`    |

`packages/fleet-provider-aws/src/provider.ts`'s `createWorker` tries each
candidate's `RunInstancesCommand` in order, moving to the next only on a
capacity/availability-class error
(`InsufficientInstanceCapacity`/`Unsupported`/`InstanceLimitExceeded`/
`SpotMaxPriceTooLow`/`MaxSpotInstanceCountExceeded`). Any other error (bad
AMI, IAM, subnet) fails immediately — it would fail identically on every
candidate, so there's no point retrying.

Setting `EC2_ALLOWED_INSTANCE_TYPES` (comma-separated exact types, already
collected by the setup wizard) filters each tier's candidate list down to
that allow-list, falling back to the full list if the intersection would
otherwise be empty.

**Deliberately excludes burstable instances** (`t3`/`t4g`): `ffmpeg` holds
CPU continuously through a transcode, and burstable CPU credits would
throttle mid-job.

### Why not AWS's attribute-based instance selection?

AWS does have a feature for exactly this — "let AWS pick the best-available
instance across a family/wildcard list in one call" — via
`InstanceRequirements` + `AllowedInstanceTypes`. It's **not available on
plain `RunInstances`**, though: it only exists on `CreateFleet` /
`RequestSpotFleet`, which require an EC2 Launch Template resource and
additional `ec2:CreateFleet`/`ec2:CreateLaunchTemplate*` IAM permissions —
a materially larger change (new AWS resource type + lifecycle management)
than this feature's actual goal. The same-size candidate list above
achieves the practical outcome (don't fail outright just because one exact
type lacks capacity) without introducing that.

If a future need justifies the larger change, `CreateFleet` with a
maintained Launch Template is the natural next step — `AllowedInstanceTypes`
already accepts the same family wildcard patterns.

### A note on the `c7g.medium` question that prompted this

The pre-existing instance selector already mapped 2 vCPU/4GB → `c7g.large`
correctly — `c7g.medium` (1 vCPU/2GB) was never used by the old ladder at
all. If documentation elsewhere says otherwise, that documentation is
stale; the code was right. The NANO tier introduced here is the first
place `.medium` actually gets used.
