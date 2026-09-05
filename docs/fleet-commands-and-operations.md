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

| Command                                     | Workspace Location            | Purpose                                                                                              |
| :------------------------------------------ | :---------------------------- | :--------------------------------------------------------------------------------------------------- |
| `pnpm fleet:provider`                       | `apps/fleet-manager`          | Interactively select and configure a provider (`aws`, `local`, etc.)                                 |
| `pnpm fleet:infra [--provider=x] [--yes]`   | `apps/fleet-manager`          | Generate/check `.env` files, prompt confirmation, and provision infrastructure                       |
| `pnpm fleet:destroy [--provider=x] [--yes]` | `apps/fleet-manager`          | **Teardown**: Terminate all workers and destroy all provider resources                               |
| `pnpm fleet:queue:trigger [--provider=x]`   | `apps/fleet-manager`          | End-to-end task test: queue DB job & trigger worker execution (Lambda on AWS, child worker on local) |
| `pnpm fleet:cicd`                           | `packages/fleet-provider-aws` | Setup AWS IAM policies and access keys for GitHub Actions CI/CD                                      |
| `pnpm fleet:build-ami`                      | `packages/fleet-provider-aws` | _(Optional)_ Build pre-baked worker AMI with Node.js 24 + FFmpeg                                     |
| `pnpm build:serverless`                     | `apps/fleet-manager`          | Fast universal `esbuild` bundling of the Serverless Fleet Manager handler                            |
| `pnpm build:worker`                         | `apps/media-worker`           | Fast `esbuild` bundling of the standalone Media Worker                                               |
| `pnpm fleet:cli run`                        | `apps/fleet-manager`          | Run Fleet Manager daemon in serverful (persistent) mode                                              |
| `pnpm fleet:cli health`                     | `apps/fleet-manager`          | Inspect fleet health metrics (queued, processing, stalled count)                                     |
| `pnpm fleet:cli workers`                    | `apps/fleet-manager`          | List active, recent, and pending worker instances                                                    |
| `pnpm fleet:cli jobs`                       | `apps/fleet-manager`          | List recent transcoding jobs and status                                                              |
| `pnpm fleet:cli status <id>`                | `apps/fleet-manager`          | View detailed diagnostics & real-time progress history for a job                                     |
| `pnpm fleet:cli prune`                      | `apps/fleet-manager`          | Terminate and clean up any stalled zombie worker processes/instances                                 |

---

## 🏛️ Pluggable Provider Architecture

`apps/fleet-manager` contains **zero provider-specific code**. All provider implementations live in their respective packages (`@veolms/fleet-provider-aws`, `@veolms/fleet-provider-local`, etc.) and adhere to standardized lifecycle contracts exported from `@veolms/fleet-types`:

- **`configureEnv(options)`**: Interactively prompts (or derives) environment configuration and writes `.env` files for `apps/fleet-manager` and `apps/media-worker`.
- **`provisionInfra(options)`**: Provisions required cloud or local resources (buckets, IAM roles, Lambda handlers, directories).
- **`destroyInfra(options)`**: Completely removes provisioned resources and stops active compute workers.
- **`triggerTest(options)`**: Queues a test transcoding task in PostgreSQL and executes worker dispatch appropriate for that provider.

---

## 🔌 1. Setup & Provider Configuration

### `pnpm fleet:provider`

**Location:** `apps/fleet-manager/src/provider-select.ts`

**What it does:**

- Interactively lists all available fleet provider packages (`@veolms/fleet-provider-aws`, `@veolms/fleet-provider-local`, etc.).
- Dynamically installs or updates the selected provider package in `apps/fleet-manager`.
- Updates `FLEET_PROVIDER` in `apps/fleet-manager/.env`.
- Ensures zero static vendor lock-in inside the core fleet manager.

---

## 🏗️ 2. Infrastructure Provisioning & Teardown

### `pnpm fleet:infra`

**Location:** `apps/fleet-manager/src/cli.ts` (`infra` subcommand — delegates to active provider setup)

**Two-Stage Workflow:**

1. **Environment Configuration & Review**:
   - Provider asks configuration questions (or uses defaults/env flags).
   - Writes generated `.env` configurations to `apps/fleet-manager/.env` and `apps/media-worker/.env`.
   - Displays file locations on disk and pauses:
     ```text
     Please review or edit .env files if you wish to adjust any settings before provisioning.
     Do you want to proceed with provisioning the infrastructure resources now? [y/N]:
     ```
   - Passing `--yes`, `--non-interactive`, or setting `CI=true` automatically bypasses this prompt for automated CI/CD runs.
2. **Resource Provisioning**:
   - **AWS Provider**: Verifies STS credentials, creates/validates S3 bucket & public policy, creates IAM Role & Instance Profile, creates CloudWatch log groups, bundles and deploys AWS Lambda `veolms-fleet-manager`, and uploads `dist/worker/media-worker.js` bundle to S3.
   - **Local Provider**: Creates local video input, output, and temporary transcoding storage directories (`data/local-storage`).

---

### `pnpm fleet:destroy`

**Location:** `apps/fleet-manager/src/destroy.ts` (delegates to active provider teardown)

**What it does:**

- **Provider-delegated teardown**:
  - **AWS**: Terminates any active/running EC2 worker instances (`ManagedBy=veolms-fleet-manager`), deletes AWS Lambda function `veolms-fleet-manager`, deletes CloudWatch log groups, removes role from instance profile and deletes `VeoLMSWorkerInstanceProfile`, detaches policies and deletes IAM Role `VeoLMSWorkerRole`.
  - **Local**: Terminates any running worker processes and cleans up local storage directories.
- Accepts `--provider=<name>` and `--yes` for unattended teardowns.

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

**Queue Logic:** Shared centrally inside `apps/fleet-manager/src/cli.ts` (inserts into PostgreSQL `media_assets` and `video_jobs`).
**Execution Logic:** Delegated dynamically to the active provider package (`@veolms/fleet-provider-${provider}/trigger`).

**Command Options:**

- **Video Key:** `--key=<path>`, `--video-key=<path>`, `--video=<path>`, `-k <path>`, positional argument, or interactive prompt (defaults to `raw/video.mp4` or `s3-bucket/raw/video.mp4`).
- **Qualities:** `--qty=<qualities>`, `--qualities=<qualities>`, `--quality=<qualities>`, `-q <qualities>`, or interactive prompt (e.g. `--qty=240p,144p`).
- **Provider Override:** `--provider=<name>` (e.g. `--provider=local` or `--provider=aws`).
- **Non-Interactive Bypass:** `--yes`, `-y`, or `--non-interactive`.

**Provider-Specific Execution:**

- **AWS (`@veolms/fleet-provider-aws/src/trigger.ts`)**:
  1. Invokes the deployed AWS Lambda (`veolms-fleet-manager` or probe Lambda) to claim the queued job.
  2. The Lambda allocates an EC2 worker instance matching job hardware requirements.
  3. Inspects worker state, public IP, and displays live SSH command for monitoring.
- **Local (`@veolms/fleet-provider-local/src/trigger.ts`)**:
  1. Sizes worker hardware dynamically via `resolveJobHardware`.
  2. Registers worker instance and monitoring record in PostgreSQL.
  3. Spawns `apps/media-worker` in a local child process.
  4. Streams real-time transcode progress and heartbeats from PostgreSQL until completion.
  5. Verifies output master playlist (`master.m3u8`) and all chunk files (`.ts` and `.m3u8`) on disk.
  6. Safely shuts down the local worker process.

---

## 🛠️ 5. Fleet Daemon & CLI Operations

### `pnpm fleet:cli run`

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

Run the full monorepo verification suite across all packages:

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

# 3. Provision AWS Infrastructure (reviews .env files before creating resources)
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
# 1. Install dependencies & run migrations
pnpm install
pnpm db:migrate

# 2. Setup Local Storage & Environment
pnpm fleet:infra --provider=local --yes

# 3. Run automated local transcode pipeline test
pnpm fleet:queue:trigger --provider=local --yes

# 4. Cleanup Local Storage when finished
pnpm fleet:destroy --provider=local --yes
```
