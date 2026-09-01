# Fleet Manager — Manual Verification Runbook

Two commands, run in order, to manually provision infra and push a test job
through the pipeline. Both are interactive/CLI — this doc lists exactly what
each prompt asks and what to answer, based on a working real-AWS run.

---

## 1. Provision infrastructure — `pnpm fleet:infra`

Run from the repo root:

```bash
pnpm fleet:infra
```

It asks 12 questions in order. Press Enter to accept the shown default.

| #   | Prompt                                                    | What to answer                                                                                                                                                              |
| --- | --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Target Environment                                        | `1` = Real AWS (billed) · `2` = LocalStack (free, needs LocalStack running)                                                                                                 |
| 1b  | LocalStack endpoint URL _(only if you picked LocalStack)_ | Default is `http://localhost.localstack.cloud:4566`. If that hostname won't resolve on your machine/sandbox, type `http://localhost:4566` instead.                          |
| 2   | AWS region                                                | e.g. `us-east-1`                                                                                                                                                            |
| 3   | Fleet Manager Mode                                        | `1` = Serverless (Lambda) · `2` = Serverful (daemon)                                                                                                                        |
| 4   | Video Storage Provider                                    | `1` = S3                                                                                                                                                                    |
| 5   | S3 bucket name                                            | An existing or new bucket name. If it doesn't exist, it's created with public read.                                                                                         |
| 6   | S3 credential mode                                        | `1` = Automatic (EC2 instance role — recommended)                                                                                                                           |
| 7   | PostgreSQL DATABASE_URL                                   | Must be reachable from AWS/LocalStack, not just your machine — a cloud Postgres URL (e.g. Neon) works; localhost does not. Enter accepts the default already in `.env`/env. |
| 8   | Allowed EC2 instance types                                | Default `c7g.xlarge,c7g.2xlarge,c6i.xlarge` is fine.                                                                                                                        |
| 9   | EC2 Worker Boot Mode                                      | `1` = Fresh install (apt-installs Node/FFmpeg on boot, ~1-3 min) · `2` = Pre-baked AMI (needs `pnpm fleet:build-ami` first)                                                 |
| 10  | Max concurrent workers                                    | Default `8`. Now actually enforced — see below.                                                                                                                             |
| 11  | Worker idle poll interval (seconds)                       | Default `15`. How long an idle worker waits for one more queue check before self-terminating — see below.                                                                   |
| 12  | EC2 Pricing Model                                         | `1` = Spot (cheaper, recommended) · `2` = On-Demand                                                                                                                         |

**What it creates:** IAM role `VeoLMSWorkerRole` + instance profile
`VeoLMSWorkerInstanceProfile`, CloudWatch log groups `/veolms/workers` and
`/veolms/fleet-manager`, the `veolms-fleet-manager` Lambda (serverless mode),
an S3 bucket policy, and writes `apps/fleet-manager/.env` +
`apps/media-worker/.env`.

Re-running this command is safe — it reuses existing resources and
refreshes their policies/Lambda code+config rather than erroring.

**How capacity and idle workers actually behave:**

- `processNextJob()` checks the current count of non-terminal workers
  against `MAX_WORKERS` before claiming a job. At capacity, it declines and
  leaves the job `queued` for a later check — it will _not_ over-provision
  past the configured max.
- A worker doesn't die after a single job. When it finishes one, it checks
  the queue for the next `queued` job and claims it directly (atomically,
  same claim query the Lambda uses) — reusing the already-booted instance
  instead of paying the fresh-boot cost again. If the queue is empty, it
  waits `WORKER_IDLE_POLL_SECONDS`, checks exactly once more, and only then
  self-terminates.
- Because of that, freeing up a slot (a worker finishing) does **not** by
  itself pick up a different, still-blocked-on-capacity job — only the
  worker that just freed up looks for more work. A job that was declined at
  step "capacity check" still needs some Lambda invoke (e.g. another
  `fleet:queue:trigger`) to be claimed, unless a worker happens to poll and
  find it during its own idle-retry window.

### What was actually typed, this session (real AWS)

This transcript is from before the idle-poll-interval question (#11) was
added, so it only has 11 answers rather than the current 12 — everything
else about it is still accurate. In order, one answer per prompt — blank
means "pressed Enter to accept the shown default":

```
1                       # Target Environment -> Real AWS
us-east-1               # AWS region
                         # Fleet Manager Mode -> serverless (default)
                         # Storage Provider -> s3 (default)
veo-lms-test             # S3 bucket name
                         # S3 credential mode -> automatic (default)
                         # DATABASE_URL -> accepted default (Neon URL already in .env)
                         # Allowed instance types -> default (c7g.xlarge,c7g.2xlarge,c6i.xlarge)
1                       # EC2 Boot Mode -> fresh install
                         # Max concurrent workers -> default (8)
                         # Pricing model -> spot (default)
```

Result that run: reused the existing `VeoLMSWorkerRole` role/instance
profile/log groups, updated the existing `veolms-fleet-manager` Lambda's
code and env vars, reused the existing `veo-lms-test` bucket, uploaded the
worker bundle to it, and wrote both `.env` files.

For the **LocalStack** path earlier in the same session, the only different
answers were: `2` (LocalStack) at prompt 1, `http://localhost:4566` at the
endpoint prompt (the default `http://localhost.localstack.cloud:4566`
wouldn't resolve in that sandbox), and `veolms-localstack-test` for the
bucket name — everything else was the same as above.

---

## 2. Queue a transcode job — `pnpm fleet:queue:trigger`

Run from the repo root:

```bash
pnpm fleet:queue:trigger
```

Optional env vars:

| Var         | Default         | Notes                                                                                                                                       |
| ----------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `VIDEO_KEY` | `raw/video.mp4` | An S3 key relative to the bucket from step 1, **or** a full `http(s)://` URL — the worker downloads it directly instead of pulling from S3. |
| `QUALITIES` | `240p`          | Comma-separated, e.g. `240p,360p,720p`.                                                                                                     |

Example, using a short clip for a faster test run:

```bash
VIDEO_KEY=raw/video-1min.mp4 pnpm fleet:queue:trigger
```

`QUALITIES` defaults to `240p` only — the worked example below only
produced a `240p/` rendition for this reason. For multiple renditions in one
job:

```bash
VIDEO_KEY=raw/video-1min.mp4 QUALITIES=240p,360p,720p pnpm fleet:queue:trigger
```

**What it does:** inserts a `queued` row into the `jobs` table, then invokes
the `veolms-fleet-manager` Lambda once. The Lambda claims the **oldest**
`queued` job in the table (FIFO) — not necessarily the one just inserted, if
others are already waiting.

Check on it afterward:

```bash
pnpm fleet:cli status <job-id>   # printed by the trigger command
pnpm fleet:cli workers           # see the EC2 worker it launched
pnpm fleet:cli health            # cluster-wide summary
```

### What was actually run this session (real AWS)

```bash
FLEET_PROVIDER=aws VIDEO_KEY=raw/video-1min.mp4 node --env-file-if-exists=.env scripts/queue-and-trigger-lambda.ts
```

(run from `apps/fleet-manager`; equivalent to
`VIDEO_KEY=raw/video-1min.mp4 pnpm fleet:queue:trigger` from the repo root)

Output:

```
[Queue] Adding job to database...
  Job ID:        ba55b585-1ea8-4d09-a7e4-e802425e9dbd
  Video Key:     raw/video-1min.mp4
  Output Prefix: hls/test-ba55b585/
  Qualities:     240p
✓ Job [ba55b585-1ea8-4d09-a7e4-e802425e9dbd] queued.

[Trigger] Invoking Lambda "veolms-fleet-manager"...
✓ Lambda invoked. Response: {"statusCode":200,"body":"{\"success\":true,\"jobClaimed\":true,...}"}

Check status: pnpm fleet:cli status ba55b585-1ea8-4d09-a7e4-e802425e9dbd
```

Because an older job was still `queued` ahead of it, that invocation
actually claimed and ran the older job (`c7d02a9a`, full-length
`raw/video.mp4`) — not `ba55b585` — which is the FIFO behavior noted above.
That run completed successfully end to end: worker created → booted →
FFmpeg transcoded 240p HLS → 91 segments + `master.m3u8` uploaded to
`s3://veo-lms-test/hls/test-c7d02a9a/` → job marked `completed` → EC2
instance self-terminated. Total wall time, worker creation to completion:
under 3 minutes.

---

## Tearing down

```bash
pnpm fleet:destroy
```

Terminates any active workers and deletes the Lambda, log groups, instance
profile, and IAM role. It will also prompt to delete the S3 bucket if it
still holds objects — read that prompt carefully if the bucket has anything
in it you didn't put there yourself. See
[fleet-commands-and-operations.md](./fleet-commands-and-operations.md) for
the full command reference.
