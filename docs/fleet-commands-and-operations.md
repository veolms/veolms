# 🚀 VeoLMS Fleet Manager & Video Pipeline — Complete CLI Command Reference

This document is a comprehensive guide to all commands used to configure, provision, build, test, monitor, and tear down the **VeoLMS Video Transcoding Pipeline** and **Pluggable Fleet Manager**.

---

## 📑 Table of Contents

1. [Quick Command Matrix](#-quick-command-matrix)
2. [Setup & Provider Configuration](#-1-setup--provider-configuration)
3. [Infrastructure Provisioning & Teardown](#-2-infrastructure-provisioning--teardown)
4. [Fast Bundling with esbuild](#-3-fast-bundling-with-esbuild)
5. [End-to-End Testing & Pipelines](#-4-end-to-end-testing--pipelines)
6. [Fleet Daemon & CLI Operations](#-5-fleet-daemon--cli-operations)
7. [Codebase Verification](#-6-codebase-verification)
8. [End-to-End Workflow Examples](#-7-end-to-end-workflow-examples)

---

## ⚡ Quick Command Matrix

| Command                         | Workspace Location            | Purpose                                                                                     |
| :------------------------------ | :---------------------------- | :------------------------------------------------------------------------------------------ |
| `pnpm fleet:provider`           | `apps/fleet-manager`          | Select a provider (`aws`, `local`, or built-in `docker`)                                    |
| `pnpm fleet:infra`              | `apps/fleet-manager`          | Provision cloud infrastructure (IAM, Lambda, S3, CloudWatch, `.env`)                        |
| `pnpm fleet:destroy`            | `apps/fleet-manager`          | **Teardown**: Terminate all EC2 workers and delete all AWS resources                        |
| `pnpm fleet:build-ami`          | `packages/fleet-provider-aws` | _(Optional)_ Build pre-baked worker AMI with Node.js 24 + FFmpeg                            |
| `pnpm build:serverless`         | `apps/fleet-manager`          | Fast universal `esbuild` bundling of the Serverless Fleet Manager handler                   |
| `pnpm build:worker`             | `apps/media-worker`           | Fast `esbuild` bundling of the standalone Media Worker                                      |
| `pnpm fleet:images:build`       | root                          | Build one-file Docker images for the local manager and worker                               |
| `pnpm fleet:local:up`           | root                          | Start the optional serverful Docker Fleet profile                                           |
| `pnpm fleet:localstack:prepare` | root                          | Build LocalStack Lambda and Docker-worker artifacts                                         |
| `pnpm fleet:localstack:up`      | root                          | Start the optional LocalStack Fleet profile                                                 |
| `pnpm fleet:queue:trigger`      | `apps/fleet-manager`          | Queue one AWS job & invoke the Lambda once to claim it — requires `fleet:infra` already run |
| `pnpm test:pipeline`            | `apps/fleet-manager`          | Automated local offline end-to-end transcoding test                                         |
| `pnpm fleet:run`                | `apps/fleet-manager`          | Run Fleet Manager daemon in serverful (persistent) mode                                     |
| `pnpm fleet:cli health`         | `apps/fleet-manager`          | Inspect fleet health metrics (queued, processing, stalled count)                            |
| `pnpm fleet:cli workers`        | `apps/fleet-manager`          | List active, recent, and pending worker instances                                           |
| `pnpm fleet:cli jobs`           | `apps/fleet-manager`          | List recent transcoding jobs and status                                                     |
| `pnpm fleet:cli status <id>`    | `apps/fleet-manager`          | View detailed diagnostics & real-time progress history for a job                            |
| `pnpm fleet:cli prune`          | `apps/fleet-manager`          | Terminate and clean up any stalled zombie worker processes/instances                        |

---

## 🔌 1. Setup & Provider Configuration

### `pnpm fleet:provider`

**Location:** `apps/fleet-manager/src/provider-select.ts`

**What it does:**

- Interactively lists all available fleet provider packages (`@veolms/fleet-provider-aws`, `@veolms/fleet-provider-local`, etc.).
- Dynamically installs the selected provider package into `apps/fleet-manager` using `pnpm add`.
- Updates `FLEET_PROVIDER` in `apps/fleet-manager/.env`.
- Ensures zero static vendor lock-in inside the core fleet manager.

---

## 🏗️ 2. Infrastructure Provisioning & Teardown

### `pnpm fleet:infra`

**Location:** `apps/fleet-manager/src/cli.ts` (`infra` subcommand — delegates to active provider setup)

**What it does:**

- Verifies AWS credentials via AWS STS (`aws sts get-caller-identity`).
- Prompts for deployment settings:
  - **Fleet Mode**: Serverless (AWS Lambda) or Serverful (persistent daemon).
  - **Storage Provider**: AWS S3 or Local disk.
  - **S3 Bucket**: Validates bucket existence, auto-creates if missing, and applies public read policy.
  - **Allowed EC2 Types**: `c7g.large`, `c7g.xlarge`, `c7g.2xlarge`, `c6i.large`, etc.
  - **Boot Mode**: Fresh install (Ubuntu base) or Pre-baked AMI.
  - **Pricing Model**: Spot (up to 70-90% discount) or On-Demand.
- Creates IAM Role `VeoLMSWorkerRole` & Instance Profile `VeoLMSWorkerInstanceProfile`.
- Creates CloudWatch log groups `/aws/lambda/veolms-fleet-manager`, `/veolms/workers`, and `/veolms/fleet-manager`.
- Direct `esbuild` bundle and deployment of AWS Lambda function `veolms-fleet-manager`.
- Uploads `dist/worker/media-worker.js` to `s3://<bucket>/bundles/media-worker.js`.
- Automatically generates `.env` files for `apps/fleet-manager` and `apps/media-worker`.

---

### `pnpm fleet:destroy`

**Location:** `apps/fleet-manager/src/destroy.ts` (delegates to active provider teardown)

**What it does:**

- **Single-command complete teardown** of all AWS cloud resources:
  1. 🛑 Finds and terminates any active/running EC2 worker instances (`ManagedBy=veolms-fleet-manager`).
  2. 🗑️ Deletes the AWS Lambda function `veolms-fleet-manager`.
  3. 🗑️ Deletes CloudWatch log groups (`/aws/lambda/veolms-fleet-manager`, `/veolms/workers`, `/veolms/fleet-manager`).
  4. 🗑️ Removes role from instance profile and deletes `VeoLMSWorkerInstanceProfile`.
  5. 🗑️ Detaches all policies and deletes IAM Role `VeoLMSWorkerRole`.

---

### `pnpm fleet:build-ami`

**Location:** `packages/fleet-provider-aws/src/setup/build-ami.ts`

**What it does:**

- Launches a temporary compute-optimized `c7g.large` EC2 Graviton builder instance.
- Pre-installs Node.js 24, FFmpeg, and AWS CLI v2 without apt lock contention.
- Auto-stops the instance, creates an AMI `veolms-worker-ami-arm64-<timestamp>`, and waits for AWS snapshot registration.
- Terminates the temporary builder and writes `AMI_ID="ami-xxxx"` into `.env` files.
- **Benefit:** Workers booted with this AMI start transcoding in **<30 seconds**!

---

## ⚡ 3. Fast Bundling with esbuild

### `pnpm build:serverless`

**Location:** `apps/fleet-manager/scripts/build-serverless.ts`

- Bundles `apps/fleet-manager/src/entrypoints/serverless.ts` into `dist/serverless/index.js` and ZIP package using `esbuild` in **~250ms**. Supports all cloud providers via `--provider=<name>`.

### `pnpm build:worker`

**Location:** `apps/media-worker/package.json`

- Bundles `apps/media-worker/src/index.ts` into `dist/worker/media-worker.js` using `esbuild` in **~130ms**.

---

## 🧪 4. End-to-End Testing & Pipelines

### `pnpm fleet:queue:trigger`

**Location:** `apps/fleet-manager/scripts/queue-and-trigger-lambda.ts`

**Requires** AWS infra already provisioned via `pnpm fleet:infra` — this script does no infra provisioning itself.

**What it does:**

1. **Queue Job**: Queues one transcode job (default `raw/video.mp4`, quality `240p`) into PostgreSQL.
2. **Trigger Lambda**: Invokes AWS Lambda `veolms-fleet-manager` once to claim the job and launch an EC2 worker.
3. **Status Check**: Looks up the resulting worker/EC2 instance and prints its state, IP, and an `ssh` command (using a local `mykey.pem` / `<key-name>.pem` if found) for tailing live worker logs.

Meant to be run multiple times in a row to queue several jobs and verify the fleet provisions one worker per job. Configurable via `VIDEO_KEY` and `QUALITIES` env vars, e.g.:

```bash
VIDEO_KEY=raw/other.mp4 QUALITIES=240p,360p pnpm fleet:queue:trigger
```

---

### `pnpm test:pipeline`

**Location:** `apps/fleet-manager/scripts/test-local-pipeline.ts`

**What it does:**

- Runs a 100% offline local transcode test using `@veolms/fleet-provider-local`.
- Spawns local worker child processes with FFmpeg, writes HLS chunks to local disk, and verifies playlists without incurring any cloud costs.

### Docker Fleet profiles

`compose.yaml` is intentionally PostgreSQL-only. Use `compose.fleet.yaml`
through the scripts below only when testing the Fleet. Before starting either
profile, set the existing `DATABASE_URL` in `apps/fleet-manager/.env` to the
local or remote PostgreSQL database to use; these commands do not create a
PostgreSQL container:

```bash
pnpm fleet:images:build
pnpm fleet:local:up
pnpm fleet:local:down

pnpm fleet:localstack:prepare
pnpm fleet:localstack:up
pnpm fleet:localstack:down
```

LocalStack defaults to its Community-compatible Lambda → Docker socket path.
Set `LOCALSTACK_EC2_ENABLED=true` only when EC2 Docker emulation is available.

---

## 🛠️ 5. Fleet Daemon & CLI Operations

### `pnpm fleet:run`

**Location:** `apps/fleet-manager/src/entrypoints/serverful.ts`

- Starts the persistent Fleet Manager daemon loop. Auto-claims queued jobs, allocates worker instances, manages heartbeats, and updates progress.

### `pnpm fleet:cli <subcommand>`

**Location:** `apps/fleet-manager/src/cli.ts`

- **`pnpm fleet:cli health`**:
  Prints real-time cluster health summary (Active Workers, Queued Jobs, Processing Jobs, Completed Jobs, Stalled Workers).
- **`pnpm fleet:cli workers`**:
  Lists all recent and active worker IDs, status, provider, and last heartbeat timestamp.
- **`pnpm fleet:cli jobs`**:
  Lists recent transcoding jobs, target video keys, attempt counts, and current status.
- **`pnpm fleet:cli status <job-id>`**:
  Inspects a specific job ID, showing full diagnostic history, audit events, worker allocation, and progress percentages.
- **`pnpm fleet:cli prune`**:
  Scans database for workers that missed their heartbeat deadline and gracefully terminates them.

---

## 🧪 6. Codebase Verification

Run the full monorepo verification suite across all 10 packages:

```bash
pnpm format:check && pnpm lint && pnpm typecheck && pnpm test
```

---

## 📖 7. End-to-End Workflow Examples

### 🚀 **Workflow A: Fresh Start on AWS (Cloud Mode)**

```bash
# 1. Install dependencies & run migrations
pnpm install
pnpm db:migrate

# 2. Select AWS provider
pnpm fleet:provider

# 3. Provision AWS Infrastructure
pnpm fleet:infra

# 4. Queue a job and trigger the Lambda to claim it
pnpm fleet:queue:trigger

# 5. Check Cluster Health
pnpm fleet:cli health

# 6. Teardown All AWS Resources when finished
pnpm fleet:destroy
```

---

### 💻 **Workflow B: Offline Local Development (Zero Cloud Costs)**

```bash
# 1. Select Local provider
pnpm fleet:provider

# 2. Run automated local pipeline test
pnpm test:pipeline
```
