# Configuration & CLI Reference

The Fleet Manager provides unified configuration management, interactive provisioning tooling, and diagnostic CLI utilities.

---

## Configuration Variables

### Fleet Manager Core Configuration (`apps/fleet-manager/.env`)

| Variable                      | Type                           | Default                                            | Description                                                                |
| ----------------------------- | ------------------------------ | -------------------------------------------------- | -------------------------------------------------------------------------- |
| `DATABASE_URL`                | `string`                       | `postgresql://veolms:veolms@localhost:5433/veolms` | PostgreSQL connection string.                                              |
| `FLEET_MODE`                  | `"serverless" \| "serverful"`  | `"serverless"`                                     | Runtimes: Lambda event-driven (`serverless`) or daemon loop (`serverful`). |
| `FLEET_PROVIDER` / `PROVIDER` | `"aws" \| "docker" \| "local"` | `"local"`                                          | Compute provider package to load dynamically.                              |
| `MAX_WORKERS`                 | `number`                       | `8`                                                | Maximum concurrent active worker instances allowed.                        |
| `MAX_RETRIES`                 | `number`                       | `3`                                                | Maximum automatic retry attempts before marking a job `failed`.            |
| `HEARTBEAT_TIMEOUT_SECONDS`   | `number`                       | `90`                                               | Seconds without a heartbeat before a worker is marked dead.                |
| `POLL_INTERVAL_MS`            | `number`                       | `2000`                                             | Polling tick interval when running in serverful daemon mode.               |

### Local Docker Fleet Configuration

| Variable                           | Default                     | Description                                                                    |
| ---------------------------------- | --------------------------- | ------------------------------------------------------------------------------ |
| `DOCKER_WORKER_IMAGE`              | `veolms-media-worker:local` | One-job worker image.                                                          |
| `DOCKER_NETWORK`                   | unset                       | Compose network used by manager, worker, and PostgreSQL.                       |
| `DOCKER_STORAGE_ROOT`              | `s3-bucket/`                | Host-visible shared input/output folder.                                       |
| `DOCKER_VERIFICATION_STORAGE_ROOT` | `DOCKER_STORAGE_ROOT`       | Manager-visible mount used to verify `master.m3u8`.                            |
| `DOCKER_TRANSPORT`                 | `cli`                       | `socket` for Compose/LocalStack; avoids requiring a Docker CLI in the runtime. |
| `DOCKER_SOCKET_GID`                | `0`                         | Supplementary group for the Docker socket when the manager runs as `node`.     |
| `FLEET_TEST_MODE`                  | `false`                     | Enables guarded fault controls.                                                |

### AWS Provider Configuration (`packages/fleet-provider-aws`)

| Variable                       | Type               | Default                         | Description                                                                  |
| ------------------------------ | ------------------ | ------------------------------- | ---------------------------------------------------------------------------- |
| `AWS_REGION`                   | `string`           | `"us-east-1"`                   | Target AWS region.                                                           |
| `EC2_IAM_INSTANCE_PROFILE`     | `string`           | `"VeoLMSWorkerInstanceProfile"` | IAM instance profile attached to EC2 instances.                              |
| `EC2_USE_SPOT`                 | `boolean`          | `true`                          | Launch workers as EC2 Spot instances for cost reduction.                     |
| `EC2_ALLOWED_INSTANCE_TYPES`   | `string`           | `undefined`                     | Optional comma-separated instance allowlist (e.g. `c7g.xlarge,c7g.2xlarge`). |
| `EC2_BOOT_MODE`                | `"fresh" \| "ami"` | `"fresh"`                       | Fast boot with pre-baked AMI or fresh bootstrap install.                     |
| `S3_BUCKET` / `S3_BUCKET_NAME` | `string`           | _optional_                      | Primary video storage and HLS destination bucket.                            |
| `SECURITY_GROUP_IDS`           | `string`           | _optional_                      | Security Group ID with outbound access and optional SSH port 22.             |
| `KEY_NAME`                     | `string`           | _optional_                      | EC2 Key Pair name for SSH access.                                            |
| `LAMBDA_FUNCTION_ARN`          | `string`           | _optional_                      | ARN of the deployed serverless `veolms-fleet-manager` Lambda.                |
| `PROBE_LAMBDA_NAME`            | `string`           | `"veolms-video-metadata-probe"` | Name of the video metadata probing Lambda function.                          |
| `FFPROBE_LAYER_ARN`            | `string`           | _optional_                      | ARN of the published `veolms-ffprobe` layer.                                 |

---

## CLI Commands

### Operations & Diagnostics (`pnpm fleet:cli`)

```bash
# Start persistent fleet manager daemon (serverful mode)
pnpm fleet:run

# Show fleet cluster health summary (queued, processing, stalled count)
pnpm fleet:cli health

# List active and recent EC2 / local workers
pnpm fleet:cli workers

# List recent transcoding jobs and attempt counts
pnpm fleet:cli jobs

# Inspect detailed progress history and diagnostic audit events for a job
pnpm fleet:cli status <job-id>

# Queue a video job manually from the CLI
pnpm fleet:cli queue <video-key-or-url> --qualities=1080p,720p --prefix=transcoded/demo/

# Prune and terminate any stalled zombie worker instances
pnpm fleet:cli prune
```

### Provider selection

```bash
pnpm fleet:provider
```

Choose **Docker Engine (Local Fleet)** to write `PROVIDER=docker` and
`FLEET_PROVIDER=docker` to `apps/fleet-manager/.env`. The selector then prints
the local image build and startup command.

### Infrastructure Provisioning & Updates

```bash
# Interactive cloud infrastructure setup (IAM, Lambdas, S3, Security Groups)
pnpm fleet:infra

# Non-interactive update of all cloud infrastructure (Full Update)
NON_INTERACTIVE=true pnpm fleet:infra --update

# Fast code & bundle update (re-bundles Lambdas and uploads worker bundle, skips layer build)
UPDATE_MODE=bundles pnpm fleet:infra --update

# Teardown and delete all provisioned AWS resources
pnpm fleet:destroy
```

### Serverless Bundling

```bash
# Build universal serverless Lambda bundles using esbuild
pnpm build:serverless --entry=fleet
pnpm build:serverless --entry=probe

# Upload media worker bundle to S3
pnpm fleet:bundle:upload
```
