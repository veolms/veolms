# Configuration Reference

This document defines all environment variables, defaults, and configuration options used by the **Fleet Manager** and **AWS Provider**.

---

## Configuration Variables

### Fleet Manager Core Configuration (`apps/fleet-manager/.env`)

| Variable                      | Type                          | Default        | Description                                                                |
| ----------------------------- | ----------------------------- | -------------- | -------------------------------------------------------------------------- |
| `DATABASE_URL`                | `string`                      | _required_     | PostgreSQL connection string with SSL mode.                                |
| `FLEET_MODE`                  | `"serverless" \| "serverful"` | `"serverless"` | Runtimes: Lambda event-driven (`serverless`) or daemon loop (`serverful`). |
| `FLEET_PROVIDER` / `PROVIDER` | `"aws" \| "local"`            | `"aws"`        | Compute provider package to load dynamically.                              |
| `MAX_WORKERS`                 | `number`                      | `8`            | Maximum concurrent active worker instances allowed.                        |
| `MAX_RETRIES`                 | `number`                      | `3`            | Maximum automatic retry attempts before marking a job `failed`.            |
| `HEARTBEAT_TIMEOUT_SECONDS`   | `number`                      | `90`           | Seconds without a heartbeat before a worker is marked dead.                |
| `POLL_INTERVAL_MS`            | `number`                      | `5000`         | Polling tick interval when running in serverful daemon mode.               |

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

## Operational CLI Commands

For the complete command matrix, workflow examples, and execution details for all fleet commands (`pnpm fleet:provider`, `pnpm fleet:infra`, `pnpm fleet:destroy`, `pnpm fleet:queue:trigger`, and `pnpm fleet:cli`), see the dedicated reference:

👉 **[`docs/fleet-commands-and-operations.md`](../fleet-commands-and-operations.md)**
